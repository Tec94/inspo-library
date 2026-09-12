import { createServer, get, type IncomingMessage, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { mediaMime, publicAddress, remoteResponse, sourceAddresses, sourceMiddleware, sourceUrl, streamAsset } from "./remote";

const servers: Server[] = [];
async function listen(server: Server) {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  // SAFETY: the listening event follows an explicit TCP listen on 127.0.0.1, so Node returns AddressInfo, not an IPC path.
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close((error) => error ? reject(error) : resolve()); })));
});

it("rejects local, special-use, translated and disguised network targets", async () => {
  for (const address of ["0.0.0.0", "10.0.0.1", "100.100.100.200", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "192.0.2.1", "198.18.0.1", "203.0.113.1", "224.0.0.1", "::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::", "3fff::1"]) expect(publicAddress(address), address).toBe(false);
  for (const address of ["1.1.1.1", "8.8.8.8", "2001:4860:4860::8888", "2606:4700:4700::1111"]) expect(publicAddress(address), address).toBe(true);
  for (const url of ["http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "http://[::ffff:127.0.0.1]/", "file:///etc/passwd", "https://user:secret@example.com/"]) expect(() => sourceUrl(url), url).toThrow();
  await expect(sourceAddresses(new URL("http://localhost/"))).rejects.toThrow("private network");
  await expect(remoteResponse("http://127.0.0.1/", new AbortController().signal)).rejects.toThrow("private network");
});

it("keeps supported binary media distinct from HTML and scripts", () => {
  expect(mediaMime(Buffer.from("<!doctype html><title>error</title>"))).toBe("");
  expect(mediaMime(Buffer.from("<svg onload='alert(1)'></svg>"))).toBe("");
  expect(mediaMime(Buffer.from("GIF89a0123456789"))).toBe("image/gif");
  expect(mediaMime(Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]))).toBe("video/mp4");
  expect(mediaMime(Buffer.from([0,0,0,24,102,116,121,112,97,118,105,102,0,0,0,0]))).toBe("image/avif");
});

it("requires the local browser origin and blocks SSRF before connecting", async () => {
  const server = createServer((request, response) => { void sourceMiddleware(request, response, () => { response.writeHead(404); response.end(); }); });
  const base = await listen(server);
  const payload = JSON.stringify({ url: "http://169.254.169.254/", requestTimeoutSeconds: null });
  for (const origin of ["https://attacker.example", "null", ""]) {
    const response = await fetch(`${base}/api/source/document`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: payload });
    expect(response.status).toBe(403);
  }
  const response = await fetch(`${base}/api/source/document`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: payload });
  expect(response.status).toBe(400);
  expect(await response.text()).toContain("private network");
});

it("streams exact media bytes, ignores a misleading MIME header and honors the user's size setting", async () => {
  const bytes = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.from("media body crossing the signature boundary")]);
  const source = await listen(createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    for (let index = 0; index < bytes.length; index += 3) response.write(bytes.subarray(index, index + 3));
    response.end();
  }));
  const transport = await listen(createServer(async (request, response) => {
    const upstream = await new Promise<IncomingMessage>((resolve, reject) => { get(source, resolve).on("error", reject); });
    try {
      const maximum = request.url === "/limited" ? (bytes.length - 1) / 1_000_000 : null;
      await streamAsset(upstream, response, maximum, new AbortController().signal);
    } catch {
      if (response.headersSent) response.destroy();
      else { response.writeHead(400); response.end("size setting"); }
    } finally { upstream.destroy(); }
  }));
  const response = await fetch(transport);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  await expect(fetch(`${transport}/limited`).then(async (limited) => { if (!limited.ok) throw new Error("size setting"); return limited.arrayBuffer(); })).rejects.toThrow();
});
