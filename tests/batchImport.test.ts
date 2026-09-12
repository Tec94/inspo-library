import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { prepareBatch, sourceKey } from "../src/batchImport";
import { createItem, emptyLibrary, filterItems } from "../src/model";
import { loadLibrary, saveLibrary } from "../src/storage";

it("preserves reviewed metadata and existing items through save, edit, trash, and restore", async () => {
  const original = createItem("Existing work", "note");
  const result = prepareBatch(JSON.stringify([{ url: "https://x.com/designer/status/123", title: "Interaction study", body: "Observed button animation", tags: ["design", "needs-review"] }]), [], "");
  const library = emptyLibrary();
  library.items = [original, ...result.items];
  await saveLibrary(library);
  const reopened = await loadLibrary();
  expect(reopened.items[0]).toEqual(original);
  expect(filterItems(reopened.items, "all", "needs-review")).toHaveLength(0);
  expect(filterItems(reopened.items, "review", "needs-review")).toHaveLength(1);
  reopened.items[1].title = "Edited interaction study";
  reopened.items[1].state = "trashed";
  await saveLibrary(reopened);
  const trashed = await loadLibrary();
  expect(filterItems(trashed.items, "all", "needs-review")).toHaveLength(0);
  trashed.items[1].state = "active";
  await saveLibrary(trashed);
  expect((await loadLibrary()).items[1]).toMatchObject({ title: "Edited interaction study", tags: ["design", "needs-review"], body: "Observed button animation" });
});

it("skips repeated X links across aliases, tracking, media paths, and existing library state", () => {
  const result = prepareBatch("https://twitter.com/a/status/123?ref=share\nhttps://x.com/a/status/456\nhttps://x.com/a/status/456/photo/1", ["https://x.com/a/status/123"], "Study");
  expect(result.duplicates).toBe(2);
  expect(result.items).toHaveLength(1);
  expect(result.items[0].collections).toEqual(["Study"]);
});

it("rejects the entire list before import when a URL or entry is invalid", () => {
  expect(() => prepareBatch("https://example.com\njavascript:alert(1)", [], "")).toThrow();
  expect(() => prepareBatch('[{"url":"https://user:password@example.com"}]', [], "")).toThrow();
  expect(() => prepareBatch('[{"url":"https://example.com","tags":"design"}]', [], "")).toThrow();
  expect(() => prepareBatch("https://example.com and https://", [], "")).toThrow();
});

it("finds links in prose and markdown while retaining balanced URL punctuation", () => {
  const result = prepareBatch("[Motion study](https://example.com/motion). Also save (https://example.net/wiki/Design_(practice)) and https://example.org/colors!", [], "Motion");
  expect(result.items.map((item) => item.url)).toEqual([
    "https://example.com/motion",
    "https://example.net/wiki/Design_(practice)",
    "https://example.org/colors",
  ]);
  expect(result.items.every((item) => item.collections.includes("Motion"))).toBe(true);
});

it("applies the same canonical duplicate check to a single pasted link", () => {
  const result = prepareBatch("https://mobile.twitter.com/designer/status/123/photo/1?utm_source=share", ["https://x.com/i/web/status/123"], "");
  expect(result.items).toEqual([]);
  expect(result.duplicates).toBe(1);
});

it("ignores tracking and fragment variations while preserving meaningful query parameters", () => {
  const result = prepareBatch("https://example.com/work?utm_source=feed&layout=grid#intro\nhttps://example.com/work?layout=grid&fbclid=abc\nhttps://example.com/work?layout=list", ["https://example.com/work?layout=grid"], "");
  expect(result.duplicates).toBe(2);
  expect(result.items.map((item) => item.url)).toEqual(["https://example.com/work?layout=list"]);
  expect(sourceKey("https://example.com/?b=2&a=1")).toBe(sourceKey("https://example.com/?a=1&b=2"));
});

it("accepts a single JSON reference and retains its supplied context", () => {
  const result = prepareBatch(JSON.stringify({ url: "https://example.com/work", title: "Saved interaction", body: "Look at the timing.", tags: ["motion", " motion "] }), [], "");
  expect(result.items[0]).toMatchObject({ title: "Saved interaction", body: "Look at the timing.", tags: ["motion"], origin: "Imported reference list" });
});

it("rejects prose without source links and malformed JSON lists", () => {
  expect(() => prepareBatch("Remember this animation", [], "")).toThrow("Paste at least one complete");
  expect(() => prepareBatch('[{"url":"https://example.com"}', [], "")).toThrow();
  expect(() => prepareBatch("[]", [], "")).toThrow();
});
