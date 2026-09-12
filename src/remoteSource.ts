import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { assetKeySchema, sourceUrlSchema, type ImportSettings, type Item } from "./model";
import { assetUrl, desktop, saveAsset } from "./storage";

const documentSchema = z.object({ url: sourceUrlSchema.refine(Boolean), mime: z.string(), text: z.string() });
const downloadedSchema = z.object({ asset: assetKeySchema.refine(Boolean), mime: z.string() });
export type SourceDocument = z.infer<typeof documentSchema>;
export interface SourceAsset {
  asset: string;
  mime: string;
  width?: number;
  height?: number;
}
export interface SourceTransport {
  document(url: string, settings: ImportSettings, signal: AbortSignal): Promise<SourceDocument>;
  download(url: string, settings: ImportSettings, signal: AbortSignal): Promise<SourceAsset>;
}
interface SourceRequest {
  url: string;
  requestId: string;
  requestTimeoutSeconds: number | null;
  maxDownloadMb?: number | null;
}

export function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Import cancelled.", "AbortError");
}

async function nativeRequest<T>(command: string, request: SourceRequest, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  checkCancelled(signal);
  let cancel = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      void invoke("cancel_source_request", { requestId: request.requestId }).catch(() => undefined);
      reject(new DOMException("Import cancelled.", "AbortError"));
    };
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    const result = await Promise.race([invoke(command, { ...request }), interrupted]);
    checkCancelled(signal);
    return schema.parse(result);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

async function browserRequest(path: string, request: SourceRequest, signal: AbortSignal) {
  checkCancelled(signal);
  const response = await fetch(`/api/source/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text || `Source request failed (${response.status}).`;
    try {
      const parsed = z.object({ error: z.string() }).safeParse(JSON.parse(text));
      if (parsed.success) message = parsed.data.error;
    } catch { /* Non-JSON error bodies are already readable text. */ }
    throw new Error(message);
  }
  return response;
}

export function mediaKind(mime: string): "image" | "video" | undefined {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return undefined;
}

async function dimensions(asset: string, mime: string, signal: AbortSignal) {
  const url = await assetUrl(asset, mime);
  checkCancelled(signal);
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const media = mime.startsWith("image/") ? new Image() : document.createElement("video");
    const cleanup = () => {
      signal.removeEventListener("abort", cancel);
      media.onerror = null;
      if (media instanceof HTMLImageElement) media.onload = null;
      else media.onloadedmetadata = null;
      media.removeAttribute("src");
      if (media instanceof HTMLVideoElement) media.load();
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException("Import cancelled.", "AbortError"));
    };
    const loaded = () => {
      const width = media instanceof HTMLImageElement ? media.naturalWidth : media.videoWidth;
      const height = media instanceof HTMLImageElement ? media.naturalHeight : media.videoHeight;
      cleanup();
      resolve({ width, height });
    };
    media.onerror = () => {
      cleanup();
      // A downloaded source can still be retained when this webview cannot decode its format.
      resolve({ width: 0, height: 0 });
    };
    if (media instanceof HTMLImageElement) media.onload = loaded;
    else { media.preload = "metadata"; media.onloadedmetadata = loaded; }
    signal.addEventListener("abort", cancel, { once: true });
    media.src = url;
  });
}

export const sourceTransport: SourceTransport = {
  async document(url, settings, signal) {
    const request: SourceRequest = { url, requestTimeoutSeconds: settings.requestTimeoutSeconds, requestId: crypto.randomUUID() };
    if (desktop) return nativeRequest("fetch_source_document", request, documentSchema, signal);
    const response = await browserRequest("document", request, signal);
    return documentSchema.parse(await response.json());
  },
  async download(url, settings, signal) {
    const request: SourceRequest = { url, maxDownloadMb: settings.maxDownloadMb, requestTimeoutSeconds: settings.requestTimeoutSeconds, requestId: crypto.randomUUID() };
    let result: SourceAsset;
    if (desktop) result = await nativeRequest("download_source_asset", request, downloadedSchema, signal);
    else {
      const response = await browserRequest("asset", request, signal);
      const blob = await response.blob();
      checkCancelled(signal);
      if (!mediaKind(blob.type)) throw new Error(`The source returned ${blob.type || "an unknown format"} instead of an image or video.`);
      result = { asset: await saveAsset(blob), mime: blob.type };
    }
    checkCancelled(signal);
    if (!mediaKind(result.mime)) throw new Error(`The source returned ${result.mime || "an unknown format"} instead of an image or video.`);
    // Native downloads are already on disk; reading a whole video back through IPC just
    // to measure it defeats streaming. Source dimensions are applied by the importer.
    if (desktop) return result;
    return { ...result, ...await dimensions(result.asset, result.mime, signal) };
  },
};

type ProviderEmbed = NonNullable<Item["embed"]>;
export function sourceEmbed(value: string): ProviderEmbed | undefined {
  let url: URL;
  try { url = new URL(value); } catch { return undefined; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
  const host = url.hostname.toLowerCase();
  if (["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(host)) {
    const match = url.pathname.match(/^\/(?:[A-Za-z0-9_]+\/status|i\/web\/status)\/(\d+)(?:\/|$)/);
    if (match) return { provider: "x", id: match[1] };
  }
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be", "www.youtu.be"].includes(host)) {
    const id = host.endsWith("youtu.be") ? url.pathname.split("/")[1] : url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    // YouTube video identifiers are exactly eleven URL-safe characters.
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return { provider: "youtube", id };
  }
  if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
    const match = url.pathname.match(/\/(\d+)(?:\/[^/]*)?\/?$/);
    if (match) return { provider: "vimeo", id: match[1] };
  }
  return undefined;
}

export function embedUrl(embed: ProviderEmbed): string {
  if (embed.provider === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(embed.id)) return `https://www.youtube-nocookie.com/embed/${embed.id}`;
  if (embed.provider === "vimeo" && /^\d+$/.test(embed.id)) return `https://player.vimeo.com/video/${embed.id}?dnt=1`;
  if (embed.provider === "x" && /^\d+$/.test(embed.id)) return `https://platform.twitter.com/embed/Tweet.html?id=${embed.id}&dnt=true`;
  return "";
}

export interface RemoteMedia {
  url: string;
  kind: "image" | "video";
  mime: string;
  width: number;
  height: number;
}
export interface SourceMetadata {
  title: string;
  text: string;
  author: string;
  sensitive: boolean;
  media: RemoteMedia[];
  embed?: ProviderEmbed;
}

const remoteMediaSchema = z.object({
  url: sourceUrlSchema,
  type: z.string().default("photo"),
  format: z.string().default(""),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});
const tweetSchema = z.object({
  code: z.number(),
  message: z.string().default(""),
  tweet: z.object({
    text: z.string().default(""),
    possibly_sensitive: z.boolean().default(false),
    author: z.object({ name: z.string().default(""), screen_name: z.string().default("") }).optional(),
    media: z.object({
      all: z.array(remoteMediaSchema).optional(),
      photos: z.array(remoteMediaSchema).default([]),
      videos: z.array(remoteMediaSchema).default([]),
    }).optional(),
  }).optional(),
});

export function tweetMetadata(text: string): SourceMetadata {
  const result = tweetSchema.parse(JSON.parse(text));
  if (result.code !== 200 || !result.tweet) throw new Error(`X metadata is unavailable: ${result.message || "the post could not be read"}. The original link is retained.`);
  const tweet = result.tweet;
  const author = tweet.author;
  return {
    title: tweet.text.split(/\r?\n/).find((line) => line.trim())?.trim() || "",
    text: tweet.text,
    author: author ? [author.name, author.screen_name ? `(@${author.screen_name})` : ""].filter(Boolean).join(" ") : "",
    sensitive: tweet.possibly_sensitive,
    media: (tweet.media?.all || [...(tweet.media?.photos || []), ...(tweet.media?.videos || [])]).filter((media) => Boolean(media.url)).map((media) => ({
      url: media.url,
      kind: media.type === "video" || media.type === "gif" ? "video" : "image",
      mime: media.format || (media.type === "video" || media.type === "gif" ? "video/mp4" : ""),
      width: media.width || 0,
      height: media.height || 0,
    })),
  };
}

function decoded(value: string): string {
  const entities = new Map([["amp", "&"], ["quot", '"'], ["apos", "'"], ["lt", "<"], ["gt", ">"], ["nbsp", " "]]);
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity: string, code: string) => {
    if (!code.startsWith("#")) return entities.get(code.toLowerCase()) || entity;
    const point = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

function httpUrl(value: string, base: string): string {
  try {
    const url = new URL(decoded(value), base);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : "";
  } catch { return ""; }
}

export function documentMetadata(source: SourceDocument): SourceMetadata {
  const directKind = mediaKind(source.mime);
  if (directKind) return { title: "", text: "", author: "", sensitive: false, media: [{ url: source.url, kind: directKind, mime: source.mime, width: 0, height: 0 }] };
  if (source.mime.startsWith("text/plain")) return { title: "", text: source.text, author: "", sensitive: false, media: [] };
  const metadata = new Map<string, string[]>();
  const media: RemoteMedia[] = [];
  let current: RemoteMedia | undefined;
  let embed: ProviderEmbed | undefined;
  // Read metadata only. Remote HTML is never mounted or executed in the application.
  for (const tag of source.text.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const attr of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attributes.set(attr[1].toLowerCase(), decoded(attr[2] ?? attr[3] ?? attr[4]));
    const key = (attributes.get("property") || attributes.get("name") || "").toLowerCase();
    const content = attributes.get("content") || "";
    if (!key || !content) continue;
    metadata.set(key, [...(metadata.get(key) || []), content]);
    if (/^(og:(?:image|video)(?::url)?|twitter:image(?::src)?|twitter:player:stream)$/.test(key)) {
      const url = httpUrl(content, source.url);
      if (!url) continue;
      const candidateEmbed = sourceEmbed(url);
      if (candidateEmbed) { embed = candidateEmbed; current = undefined; continue; }
      current = { url, kind: key.includes("video") || key.includes("stream") ? "video" : "image", mime: "", width: 0, height: 0 };
      media.push(current);
    } else if (/^og:(?:image|video):secure_url$/.test(key) && current) {
      current.url = httpUrl(content, source.url) || current.url;
    } else if (/^og:(?:image|video):(width|height)$/.test(key) && current) {
      const size = Number(content);
      if (Number.isFinite(size) && size > 0) {
        if (key.endsWith(":width")) current.width = size;
        else current.height = size;
      }
    } else if (/^og:(?:image|video):type$/.test(key) && current) current.mime = content;
    else if (key === "twitter:player") embed = sourceEmbed(httpUrl(content, source.url)) || embed;
  }
  const first = (...keys: string[]) => keys.flatMap((key) => metadata.get(key) || [])[0] || "";
  const title = first("og:title", "twitter:title") || decoded(source.text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const seen = new Set<string>();
  return {
    title: title.trim(),
    text: [title.trim(), first("og:description", "twitter:description", "description")].filter(Boolean).join("\n\n"),
    author: first("author", "article:author", "twitter:creator"),
    sensitive: /^(adult|restricted|mature|rta-5042-1996-1400-1577-rta)$/i.test(first("rating", "content-rating")),
    media: media.filter((entry) => {
      if (seen.has(entry.url) || entry.mime.startsWith("text/")) return false;
      seen.add(entry.url);
      return true;
    }).sort((a, b) => Number(b.kind === "video") - Number(a.kind === "video")),
    embed,
  };
}
