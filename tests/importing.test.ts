import { describe, expect, it } from "vitest";
import { createImporter, embedUrl, queueImport, reviewItem } from "../src/importing";
import { createItem, importSettingsSchema, type Item } from "../src/model";
import { documentMetadata, sourceEmbed, type SourceAsset, type SourceDocument, type SourceTransport } from "../src/remoteSource";

function reference(url = "https://example.com/study"): Item {
  return { ...createItem("My motion study", "link"), url, body: "My own observations.", tags: ["motion"] };
}

class FixtureTransport implements SourceTransport {
  documents: string[] = [];
  downloads: string[] = [];
  assets = new Map<string, SourceAsset | Error>();
  constructor(private result: SourceDocument | Error) {}
  async document(url: string): Promise<SourceDocument> {
    this.documents.push(url);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
  async download(url: string): Promise<SourceAsset> {
    this.downloads.push(url);
    const asset = this.assets.get(url);
    if (!asset) throw new Error("No fixture asset.");
    if (asset instanceof Error) throw asset;
    return asset;
  }
}

function page(text: string): SourceDocument { return { url: "https://example.com/study", mime: "text/html", text }; }
const settings = importSettingsSchema.parse({});
const firstAsset = "a".repeat(64);
const secondAsset = "b".repeat(64);

describe("automatic import review", () => {
  it("holds preliminary keyword, domain, and author matches before any network request", async () => {
    const transport = new FixtureTransport(page(""));
    const configured = importSettingsSchema.parse({ preferredKeywords: ["typography"], excludedKeywords: ["motion"], blockedDomains: ["x.com"], blockedAuthors: ["@designer"] });
    const item = reference("https://x.com/designer/status/123");
    const result = await createImporter(transport)(item, configured, new AbortController().signal);
    expect(result.review?.status).toBe("pending");
    expect(result.review?.reasons).toHaveLength(3);
    expect(transport.documents).toEqual([]);
    expect(transport.downloads).toEqual([]);
  });

  it("preserves explicit approval and migrates needs-review tags without changing them", () => {
    const item = { ...reference(), tags: ["needs-review", "motion"] };
    expect(queueImport(item, settings).review?.status).toBe("pending");
    const approved: Item = { ...item, review: { status: "approved", reasons: [] } };
    expect(reviewItem(approved, importSettingsSchema.parse({ excludedKeywords: ["motion"] }))).toEqual(approved);
    expect(queueImport(approved, settings).tags).toEqual(item.tags);
  });

  it("leaves local assets untouched and records disabled capture without fetching", async () => {
    const local: Item = { ...reference(), asset: firstAsset, mime: "image/png", kind: "image" };
    expect(queueImport(local, settings)).toEqual(local);
    const transport = new FixtureTransport(page(""));
    const result = await createImporter(transport)(reference(), importSettingsSchema.parse({ autoFetch: false }), new AbortController().signal);
    expect(result.capture?.status).toBe("disabled");
    expect(transport.documents).toEqual([]);
  });

  it("holds newly discovered sensitive content before binary download, then imports after approval", async () => {
    const transport = new FixtureTransport({ url: "https://api.fxtwitter.com/status/123", mime: "application/json", text: JSON.stringify({ code: 200, tweet: { text: "A motion reference", possibly_sensitive: true, author: { name: "Designer", screen_name: "maker" }, media: { all: [{ type: "video", url: "https://video.example.com/clip.mp4", width: 1920, height: 1080 }] } } }) });
    transport.assets.set("https://video.example.com/clip.mp4", { asset: firstAsset, mime: "video/mp4" });
    const enrich = createImporter(transport);
    const held = await enrich(reference("https://x.com/maker/status/123"), settings, new AbortController().signal);
    expect(held.review?.reasons).toEqual(["The source marks this content as sensitive."]);
    expect(held.capture).toMatchObject({ author: "Designer (@maker)", remoteText: "A motion reference", sensitive: true });
    expect(transport.downloads).toEqual([]);
    const kept = await enrich({ ...held, review: { status: "approved", reasons: [] } }, settings, new AbortController().signal);
    expect(kept.capture?.status).toBe("ready");
    expect(kept).toMatchObject({ asset: firstAsset, kind: "video", mime: "video/mp4", width: 1920, height: 1080 });
    expect(kept.title).toBe("My motion study");
    expect(kept.body).toBe("My own observations.");
    expect(kept.tags).toEqual(["motion"]);
    expect(kept.url).toBe("https://x.com/maker/status/123");
  });

  it("matches discovered author and description rules without downloading", async () => {
    const transport = new FixtureTransport(page('<meta name="author" content="Blocked writer"><meta property="og:description" content="An excluded offer"><meta property="og:image" content="/image.png">'));
    const result = await createImporter(transport)(reference(), importSettingsSchema.parse({ blockedAuthors: ["blocked writer"], excludedKeywords: ["excluded offer"] }), new AbortController().signal);
    expect(result.review?.reasons).toHaveLength(2);
    expect(transport.downloads).toEqual([]);
  });

  it("reads a bare URL before applying preferred keywords and gives unmatched metadata to review", async () => {
    const configured = importSettingsSchema.parse({ preferredKeywords: ["typography"] });
    const item = { ...reference(), title: "example.com", body: "", tags: [] };
    expect(queueImport(item, configured).review).toBeUndefined();
    const matched = new FixtureTransport(page('<meta property="og:title" content="Expressive typography">'));
    const result = await createImporter(matched)(item, configured, new AbortController().signal);
    expect(result.review).toBeUndefined();
    expect(result.title).toBe("Expressive typography");
    expect(matched.documents).toEqual([item.url]);
    const unmatched = new FixtureTransport(page('<meta property="og:title" content="An unrelated subject">'));
    expect((await createImporter(unmatched)(item, configured, new AbortController().signal)).review?.status).toBe("pending");
    const failed = new FixtureTransport(new Error("Source unavailable."));
    expect((await createImporter(failed)(item, configured, new AbortController().signal)).review?.reasons).toEqual(["Relevance could not be checked because source capture failed."]);
  });
});

describe("remote media capture", () => {
  it("parses relative OG media, encoded attributes, and Twitter images without executing HTML", () => {
    const result = documentMetadata(page('<title>Fallback</title><meta content="Animation &amp; type" property="og:title"><meta name="description" content="Soft motion"><meta property="og:image" content="/cover.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:video" content="/clip.mp4?a=1&amp;b=2"><meta property="og:video:type" content="video/mp4"><meta name="twitter:image" content="https://example.com/cover.png"><meta property="og:image" content="javascript:alert(1)">'));
    expect(result.text).toBe("Animation & type\n\nSoft motion");
    expect(result.media).toEqual([
      { url: "https://example.com/clip.mp4?a=1&b=2", kind: "video", mime: "video/mp4", width: 0, height: 0 },
      { url: "https://example.com/cover.png", kind: "image", mime: "", width: 1200, height: 630 },
    ]);
  });

  it("retains ordered X media and reuses successful files when retrying a partial capture", async () => {
    const image = "https://pbs.twimg.com/media/image.jpg";
    const video = "https://video.twimg.com/clip.mp4";
    const transport = new FixtureTransport({ url: "https://api.fxtwitter.com/status/123", mime: "application/json", text: JSON.stringify({ code: 200, tweet: { text: "Two references", media: { all: [{ type: "photo", url: image, width: 1000, height: 800 }, { type: "video", url: video, width: 1920, height: 1080 }] } } }) });
    transport.assets.set(image, { asset: firstAsset, mime: "image/jpeg" });
    transport.assets.set(video, new Error("Download interrupted."));
    const enrich = createImporter(transport);
    const partial = await enrich(reference("https://x.com/maker/status/123"), settings, new AbortController().signal);
    expect(partial.capture?.status).toBe("partial");
    expect(partial.capture?.error).toContain("Download interrupted.");
    expect(partial.media.map((media) => media.url)).toEqual([image]);
    expect(partial.asset).toBe(firstAsset);
    transport.assets.set(video, { asset: secondAsset, mime: "video/mp4" });
    const complete = await enrich(partial, settings, new AbortController().signal);
    expect(complete.capture?.status).toBe("ready");
    expect(complete.media.map((media) => media.url)).toEqual([image, video]);
    expect(transport.downloads).toEqual([image, video, video]);
    expect(transport.documents).toEqual(["https://api.fxtwitter.com/status/123", "https://api.fxtwitter.com/status/123"]);
  });

  it("downloads direct media and applies actual decoded dimensions", async () => {
    const url = "https://example.com/image.webp";
    const transport = new FixtureTransport({ url, mime: "image/webp", text: "" });
    transport.assets.set(url, { asset: firstAsset, mime: "image/webp", width: 820, height: 460 });
    const result = await createImporter(transport)(reference(url), settings, new AbortController().signal);
    expect(result).toMatchObject({ asset: firstAsset, kind: "image", width: 820, height: 460 });
  });

  it("fills an automatic X title from the first text line and retains attachments removed from remote metadata", async () => {
    const video = "https://video.twimg.com/clip.mp4";
    const image = "https://pbs.twimg.com/media/image.jpg";
    const transport = new FixtureTransport({ url: "https://api.fxtwitter.com/status/123", mime: "application/json", text: JSON.stringify({ code: 200, tweet: { text: "\nUseful animation study\nMore context.", media: { all: [{ type: "video", url: video }] } } }) });
    const item: Item = {
      ...reference("https://x.com/maker/status/123"), title: "x.com", asset: firstAsset, kind: "image", mime: "image/jpeg",
      capture: { status: "ready", error: "", fetchedAt: "2026-09-12T00:00:00Z", author: "", sensitive: false, remoteText: "" },
      media: [
        { asset: firstAsset, mime: "image/jpeg", kind: "image", url: image, width: 1000, height: 800 },
        { asset: secondAsset, mime: "video/mp4", kind: "video", url: video, width: 1920, height: 1080 },
      ],
    };
    const result = await createImporter(transport)(item, settings, new AbortController().signal);
    expect(result.title).toBe("Useful animation study");
    expect(result.media.map((media) => media.url)).toEqual([video, image]);
    expect(result.asset).toBe(secondAsset);
    expect(transport.downloads).toEqual([]);
  });

  it("keeps a validated X embed and honest error if metadata is blocked", async () => {
    const transport = new FixtureTransport(new Error("Source returned 403."));
    const result = await createImporter(transport)(reference("https://x.com/maker/status/123"), settings, new AbortController().signal);
    expect(result.capture).toMatchObject({ status: "failed", error: "Source returned 403." });
    expect(result.embed).toEqual({ provider: "x", id: "123" });
    expect(result.url).toBe("https://x.com/maker/status/123");
    expect(result.media).toEqual([]);
  });

  it("reports full media failure and honors disabled downloads and embeds", async () => {
    const transport = new FixtureTransport(page('<meta property="og:video" content="/clip.mp4">'));
    const failed = await createImporter(transport)(reference(), settings, new AbortController().signal);
    expect(failed.capture?.status).toBe("failed");
    const configured = importSettingsSchema.parse({ downloadMedia: false, allowEmbeds: false });
    const result = await createImporter(transport)({ ...reference(), embed: { provider: "x", id: "123" } }, configured, new AbortController().signal);
    expect(result.capture?.status).toBe("ready");
    expect(result.embed).toBeUndefined();
    expect(transport.downloads).toEqual(["https://example.com/clip.mp4"]);
  });

  it("propagates cancellation instead of recording it as a failed import", async () => {
    const controller = new AbortController();
    const transport: SourceTransport = {
      async document() { controller.abort(); return page(""); },
      async download() { throw new Error("A cancelled import must not download."); },
    };
    await expect(createImporter(transport)(reference(), settings, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(createImporter(transport)(reference(), settings, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});

it("constructs provider-owned embeds from validated hosts and IDs only", () => {
  expect(sourceEmbed("https://youtu.be/dQw4w9WgXcQ?t=5")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
  expect(sourceEmbed("https://player.vimeo.com/video/123456")).toEqual({ provider: "vimeo", id: "123456" });
  expect(sourceEmbed("https://x.com/i/web/status/123")).toEqual({ provider: "x", id: "123" });
  expect(sourceEmbed("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeUndefined();
  expect(embedUrl({ provider: "x", id: "123&url=https://evil.example" })).toBe("");
  expect(embedUrl({ provider: "youtube", id: "dQw4w9WgXcQ" })).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});
