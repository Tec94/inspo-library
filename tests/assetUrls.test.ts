import "fake-indexeddb/auto";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireAssetUrl, saveAsset } from "../src/storage";

afterEach(() => vi.restoreAllMocks());

describe("asset URL ownership", () => {
  it("shares a pending read and keeps an open viewer usable after its card leaves", async () => {
    const key = await saveAsset(new Blob(["Shared card and viewer"], { type: "image/png" }));
    const reads = vi.spyOn(IDBObjectStore.prototype, "get");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const card = acquireAssetUrl(key, "image/png");
    const viewer = acquireAssetUrl(key, "image/png");
    expect(card.url).toBe(viewer.url);
    const [cardUrl, viewerUrl] = await Promise.all([card.url, viewer.url]);
    expect(cardUrl).toBe(viewerUrl);
    expect(reads).toHaveBeenCalledTimes(1);

    card.release();
    card.release();
    expect(revoke).not.toHaveBeenCalled();
    expect(await (await fetch(viewerUrl)).text()).toBe("Shared card and viewer");

    viewer.release();
    viewer.release();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(viewerUrl);
    await expect(fetch(viewerUrl)).rejects.toThrow();
  });

  it("revokes a pending URL after its only consumer has already left", async () => {
    const key = await saveAsset(new Blob(["Leave before the read completes"], { type: "video/mp4" }));
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const leaving = acquireAssetUrl(key, "video/mp4");
    leaving.release();
    const oldUrl = await leaving.url;
    expect(revoke).toHaveBeenCalledWith(oldUrl);
    await expect(fetch(oldUrl)).rejects.toThrow();

    const returning = acquireAssetUrl(key, "video/mp4");
    const freshUrl = await returning.url;
    expect(freshUrl).not.toBe(oldUrl);
    expect(await (await fetch(freshUrl)).text()).toBe("Leave before the read completes");
    returning.release();
  });

  it("reuses a pending read when another consumer arrives before it settles", async () => {
    const key = await saveAsset(new Blob(["Pending handoff"], { type: "image/webp" }));
    const reads = vi.spyOn(IDBObjectStore.prototype, "get");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const first = acquireAssetUrl(key, "image/webp");
    first.release();
    const next = acquireAssetUrl(key, "image/webp");
    expect(next.url).toBe(first.url);
    const url = await next.url;
    expect(reads).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    expect(await (await fetch(url)).text()).toBe("Pending handoff");
    next.release();
    expect(revoke).toHaveBeenCalledWith(url);
  });

  it("retries a failed read without an older failed lease removing the replacement", async () => {
    const content = "Re-imported missing asset";
    const key = createHash("sha256").update(content).digest("hex");
    const failed = acquireAssetUrl(key, "image/jpeg");
    await expect(failed.url).rejects.toThrow("local file is unavailable");
    expect(await saveAsset(new Blob([content], { type: "image/jpeg" }))).toBe(key);

    const restored = acquireAssetUrl(key, "image/jpeg");
    const url = await restored.url;
    failed.release();
    const viewer = acquireAssetUrl(key, "image/jpeg");
    expect(viewer.url).toBe(restored.url);
    restored.release();
    expect(await (await fetch(url)).text()).toBe(content);
    viewer.release();
    await expect(fetch(url)).rejects.toThrow();
  });

  it("returns demo paths without reading assets or creating browser blobs", async () => {
    const reads = vi.spyOn(IDBObjectStore.prototype, "get");
    const create = vi.spyOn(URL, "createObjectURL");
    const empty = acquireAssetUrl("", "");
    const demo = acquireAssetUrl("demo/type.svg", "image/svg+xml");
    expect(await empty.url).toBe("");
    expect(await demo.url).toBe("/demo/type.svg");
    empty.release();
    demo.release();
    expect(reads).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
