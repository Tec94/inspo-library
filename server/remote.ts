import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { once } from "node:events";
import { z } from "zod";
import type { Plugin } from "vite";

const blockedV4 = new BlockList();
// IANA special-purpose registries define these non-public ranges; RFC 1112 defines multicast.
// https://www.iana.org/assignments/iana-ipv4-special-registry/
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] satisfies [string, number][]) blockedV4.addSubnet(network, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
// IANA IPv6 global unicast allocations are in 2000::/3. Exclude special/transition prefixes.
// https://www.iana.org/assignments/iana-ipv6-special-registry/
for (const [network, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] satisfies [string, number][]) blockedV6.addSubnet(network, prefix, "ipv6");
const publicSpecialV6 = new BlockList();
for (const address of ["2001:1::1", "2001:1::2", "2001:1::3"]) publicSpecialV6.addAddress(address, "ipv6");
for (const [network, prefix] of [["2001:3::", 32], ["2001:4:112::", 48], ["2001:20::", 28], ["2001:30::", 28]] satisfies [string, number][]) publicSpecialV6.addSubnet(network, prefix, "ipv6");

export function publicAddress(address: string) {
  if (isIP(address) === 4) return address === "192.0.0.9" || address === "192.0.0.10" || !blockedV4.check(address, "ipv4");
  if (isIP(address) === 6) return globalV6.check(address, "ipv6") && (!blockedV6.check(address, "ipv6") || publicSpecialV6.check(address, "ipv6"));
  return false;
}

export function sourceUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error("Use a public HTTP or HTTPS URL without embedded credentials.");
  url.hash = "";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !publicAddress(host)) throw new Error("Local and private network sources are not allowed.");
  return url;
}

export async function sourceAddresses(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(host);
  const addresses = family ? [{ address: host, family }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error("Local and private network sources are not allowed.");
  return addresses;
}

async function connect(url: URL, signal: AbortSignal) {
  signal.throwIfAborted();
  const addresses = await new Promise<Awaited<ReturnType<typeof sourceAddresses>>>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void sourceAddresses(url).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
  signal.throwIfAborted();
  // Keep the original HTTP Host and TLS server name, but never resolve the host again.
  const pinnedLookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      agent: false,
      lookup: pinnedLookup,
      signal,
      headers: { "User-Agent": "InspoLibrary/0.2", Accept: "*/*", "Accept-Encoding": "identity" },
    }, resolve);
    request.on("error", reject);
    request.end();
  });
}

export async function remoteResponse(value: string, signal: AbortSignal) {
  let url = sourceUrl(value);
  const visited = new Set<string>();
  while (true) {
    if (visited.has(url.href)) throw new Error("The source redirects in a loop.");
    visited.add(url.href);
    const response = await connect(url, signal);
    if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
      const location = response.headers.location;
      response.destroy();
      if (!location) throw new Error("The source returned a redirect without a destination.");
      url = sourceUrl(new URL(location, url).href);
      continue;
    }
    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
      response.destroy();
      throw new Error(`The source returned HTTP ${response.statusCode || "an invalid response"}.`);
    }
    if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
      response.destroy();
      throw new Error("The source ignored the uncompressed transfer request. Its media was not saved.");
    }
    return { url: url.href, response };
  }
}

// Fixed signature fields from WHATWG MIME Sniffing and ISO BMFF occupy the first 16 bytes.
// This is a file identification prefix, not a file-size limit.
export const signatureBytes = 16;
export function mediaMime(bytes: Uint8Array) {
  const prefix = Buffer.from(bytes);
  if (prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(prefix.toString("ascii", 0, 6))) return "image/gif";
  if (prefix.toString("ascii", 0, 4) === "RIFF" && prefix.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (prefix.toString("ascii", 0, 2) === "BM") return "image/bmp";
  if (prefix.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) return "image/x-icon";
  if (prefix.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) return "video/webm";
  if (prefix.length >= 16 && prefix.toString("ascii", 4, 8) === "ftyp" && prefix.readUInt32BE(0) >= 16) {
    const brand = prefix.toString("ascii", 8, 12);
    if (["avif", "avis"].includes(brand)) return "image/avif";
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "image/heic";
    if (brand === "qt  ") return "video/quicktime";
    if (/^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash|3gp[4-9])$/.test(brand)) return "video/mp4";
  }
  return "";
}

const requestSchema = z.object({
  url: z.string(),
  requestId: z.string().optional(),
  requestTimeoutSeconds: z.number().positive().nullable().default(null),
  maxDownloadMb: z.number().positive().nullable().default(null),
}).strict();

export function sameOrigin(request: IncomingMessage) {
  try {
    const host = new URL(`http://${request.headers.host}`);
    return ["localhost", "127.0.0.1", "[::1]"].includes(host.hostname)
      && Number(host.port || 80) === request.socket.localPort
      && request.headers.origin === host.origin
      && (!request.headers["sec-fetch-site"] || request.headers["sec-fetch-site"] === "same-origin");
  } catch { return false; }
}

function userDeadline(controller: AbortController, seconds: number | null) {
  if (seconds === null) return () => {};
  const deadline = performance.now() + seconds * 1000;
  if (!Number.isFinite(deadline)) throw new Error("The request timeout is outside the supported duration range.");
  let timer: ReturnType<typeof setTimeout>;
  const tick = () => {
    const remaining = deadline - performance.now();
    if (remaining <= 0) controller.abort(new Error("The source exceeded your request timeout."));
    // Node timers accept at most a signed 32-bit number of milliseconds. Longer user settings are scheduled in parts.
    else timer = setTimeout(tick, Math.min(remaining, 2 ** 31 - 1));
  };
  tick();
  return () => clearTimeout(timer);
}

export async function streamAsset(response: IncomingMessage, output: ServerResponse, maxDownloadMb: number | null, signal: AbortSignal) {
  const maximum = maxDownloadMb === null ? null : maxDownloadMb * 1_000_000;
  const stated = Number(response.headers["content-length"]);
  if (maximum !== null && Number.isFinite(stated) && stated > maximum) throw new Error("The media exceeds your download size setting.");
  let length = 0;
  let prefix = Buffer.alloc(0);
  let started = false;
  for await (const chunk of response) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (maximum !== null && length > maximum) throw new Error("The media exceeds your download size setting.");
    signal.throwIfAborted();
    if (!started) {
      const needed = Math.max(0, signatureBytes - prefix.length);
      prefix = Buffer.concat([prefix, bytes.subarray(0, needed)]);
      if (prefix.length < signatureBytes) continue;
      const mime = mediaMime(prefix);
      if (!mime) throw new Error("The source did not return a supported image or video. Its response was not saved.");
      output.setHeader("Content-Type", mime);
      output.setHeader("X-Content-Type-Options", "nosniff");
      started = true;
      if (!output.write(prefix)) await once(output, "drain", { signal });
      if (bytes.length > needed && !output.write(bytes.subarray(needed))) await once(output, "drain", { signal });
    } else if (!output.write(bytes)) await once(output, "drain", { signal });
  }
  if (!started) throw new Error("The source returned an empty or incomplete media file.");
  output.end();
}

export async function sourceMiddleware(request: IncomingMessage, output: ServerResponse, next: () => void) {
  const path = request.url?.split("?")[0];
  if (path !== "/api/source/document" && path !== "/api/source/asset") { next(); return; }
  output.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST" || !sameOrigin(request) || request.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
    output.writeHead(403, { "Content-Type": "application/json" });
    output.end(JSON.stringify({ error: "Source capture is available only to this local app." }));
    return;
  }
  const controller = new AbortController();
  const cancel = () => { if (!output.writableEnded) controller.abort(new Error("Source capture cancelled.")); };
  request.on("aborted", cancel);
  output.on("close", cancel);
  let clearDeadline = () => {};
  let remote: IncomingMessage | undefined;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    clearDeadline = userDeadline(controller, input.requestTimeoutSeconds);
    const result = await remoteResponse(input.url, controller.signal);
    remote = result.response;
    if (path === "/api/source/asset") await streamAsset(remote, output, input.maxDownloadMb, controller.signal);
    else {
      const mime = remote.headers["content-type"]?.split(";")[0].trim().toLowerCase() || "application/octet-stream";
      let text = "";
      if (mime.startsWith("text/") || mime === "application/xhtml+xml" || mime === "application/json" || mime.endsWith("+json")) {
        const body: Buffer[] = [];
        for await (const chunk of remote) body.push(Buffer.from(chunk));
        text = Buffer.concat(body).toString("utf8");
      }
      output.writeHead(200, { "Content-Type": "application/json" });
      output.end(JSON.stringify({ url: result.url, mime, text }));
    }
  } catch (error) {
    if (!output.headersSent && !output.destroyed) {
      output.writeHead(400, { "Content-Type": "application/json" });
      output.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unable to capture this source." }));
    } else if (!output.writableEnded) output.destroy();
  } finally {
    remote?.destroy();
    clearDeadline();
    request.off("aborted", cancel);
    output.off("close", cancel);
  }
}

export function sourceTransport(): Plugin {
  return {
    name: "local-source-transport",
    configureServer(server) { server.middlewares.use((request, response, next) => { void sourceMiddleware(request, response, next); }); },
    configurePreviewServer(server) { server.middlewares.use((request, response, next) => { void sourceMiddleware(request, response, next); }); },
  };
}
