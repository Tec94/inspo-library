import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createItem, emptyLibrary, captureSchema, filterItems } from "../src/model";
import { prepareLibraryImports, approveItem, mergeImportedItem, mergeReferenceEdits } from "../src/useImportQueue";
import { loadLibrary, restoreLibrary, saveLibrary } from "../src/storage";
import { buildTargets } from "../src/analysis";

describe("automatic import lifecycle", () => {
  it("resumes interrupted captures and preserves existing local files", () => {
    const library = emptyLibrary();
    library.items = [
      { ...createItem("Interrupted", "link"), url: "https://example.com/interrupted", capture: captureSchema.parse({ status: "fetching" }) },
      { ...createItem("Old bookmark", "link"), url: "https://example.com/bookmark" },
      { ...createItem("Local evidence", "image"), url: "https://example.com/local", asset: "a".repeat(64) },
    ];
    const ready = prepareLibraryImports(library);
    expect(ready.items.map((item) => item.capture?.status)).toEqual(["queued", "queued", undefined]);
    expect(ready.items[2]).toBe(library.items[2]);
  });

  it("moves legacy review imports out of All and continues them only after Keep", () => {
    const library = emptyLibrary();
    const item = { ...createItem("Uncertain reference", "link"), url: "https://example.com/post", tags: ["needs-review", "design"] };
    library.items = [item];
    expect(filterItems(library.items, "all", "")).toHaveLength(0);
    expect(filterItems(library.items, "review", "")).toHaveLength(1);
    const kept = approveItem(item, library);
    expect(kept.capture?.status).toBe("queued");
    expect(kept.tags).toEqual(["design"]);
    expect(filterItems([kept], "review", "")).toHaveLength(0);
    expect(filterItems([kept], "all", "")).toHaveLength(1);
  });

  it("keeps edits made while a download is in progress", () => {
    const started = { ...createItem("Original title", "link"), url: "https://example.com/post" };
    const live = { ...started, title: "My title", body: "My note", favorite: true, tags: ["my-tag"] };
    const result = { ...started, title: "Remote title", capture: captureSchema.parse({ status: "ready", remoteText: "Captured post" }) };
    const merged = mergeImportedItem(live, started, result);
    expect(merged.title).toBe("My title");
    expect(merged.body).toBe("My note");
    expect(merged.favorite).toBe(true);
    expect(merged.tags).toEqual(["my-tag"]);
    expect(merged.capture?.remoteText).toBe("Captured post");
  });

  it("uses captured post text as explicit source evidence", async () => {
    const item = { ...createItem("Saved post", "link"), body: "Personal context", capture: captureSchema.parse({ status: "ready", remoteText: "Captured source text" }) };
    const [target] = await buildTargets([item], [{ itemId: item.id }]);
    expect(target.text).toBe("Personal context\n\nCaptured source text");
  });

  it("retains a completed import when a user edit was queued during its save", () => {
    const rendered = { ...createItem("example.com", "link"), capture: captureSchema.parse({ status: "fetching" }) };
    const completed = { ...rendered, title: "Captured title", asset: "a".repeat(64), capture: captureSchema.parse({ status: "ready" }) };
    const favorite = mergeReferenceEdits(completed, rendered, { ...rendered, favorite: true });
    expect(favorite.asset).toBe(completed.asset);
    expect(favorite.capture?.status).toBe("ready");
    expect(favorite.title).toBe("Captured title");
    expect(favorite.favorite).toBe(true);
  });

  it("restores all attachments and rejects a backup missing a secondary attachment", async () => {
    const library = emptyLibrary();
    const bytes = [Buffer.from("First attachment"), Buffer.from("Second attachment")];
    const assets = bytes.map((value) => ({ key: createHash("sha256").update(value).digest("hex"), mime: "image/png", data: `data:image/png;base64,${value.toString("base64")}` }));
    library.items = [{ ...createItem("Multiple images", "image"), asset: assets[0].key, mime: "image/png", media: assets.map((asset, index) => ({ asset: asset.key, mime: asset.mime, kind: "image", url: `https://example.com/${index}.png`, width: 600, height: 600 })) }];
    await saveLibrary(emptyLibrary());
    await expect(restoreLibrary(new File([JSON.stringify({ format: "inspo-library", library, assets: assets.slice(0, 1) })], "missing.json"))).rejects.toThrow("missing source files");
    expect((await loadLibrary()).items).toHaveLength(0);
    await restoreLibrary(new File([JSON.stringify({ format: "inspo-library", library, assets })], "complete.json"));
    expect((await loadLibrary()).items[0].media).toHaveLength(2);
  });
});
