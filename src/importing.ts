import { captureSchema, type ImportSettings, type Item, type SavedMedia } from "./model";
import { checkCancelled, documentMetadata, mediaKind, sourceEmbed, sourceTransport, tweetMetadata, type SourceTransport } from "./remoteSource";

export { embedUrl } from "./remoteSource";

function normalized(value: string) { return value.trim().toLocaleLowerCase(); }

function sourceHost(value: string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

export function reviewItem(item: Item, settings: ImportSettings): Item {
  if (item.review?.status === "approved") return item;
  const reasons: string[] = [];
  const text = normalized([item.title, item.body, item.url, ...item.tags, item.capture?.remoteText || ""].join("\n"));
  if (item.tags.includes("needs-review")) reasons.push("This reference was marked needs-review.");
  for (const keyword of settings.excludedKeywords.map(normalized).filter(Boolean)) {
    if (text.includes(keyword)) reasons.push(`Contains excluded keyword: ${keyword}.`);
  }
  const preferred = settings.preferredKeywords.map(normalized).filter(Boolean);
  if (preferred.length && !preferred.some((word) => text.includes(word))) {
    if (item.capture?.fetchedAt) reasons.push("Does not match any preferred keyword.");
    else if (item.capture?.status === "failed") reasons.push("Relevance could not be checked because source capture failed.");
  }
  const host = sourceHost(item.url);
  for (const entry of settings.blockedDomains) {
    const domain = sourceHost(entry.includes("://") ? entry : `https://${entry}`);
    if (domain && (host === domain || host.endsWith(`.${domain}`))) reasons.push(`Source domain is blocked: ${domain}.`);
  }
  const author = normalized(item.capture?.author || "");
  const handle = sourceEmbed(item.url)?.provider === "x" ? normalized(new URL(item.url).pathname.split("/")[1]) : "";
  for (const entry of settings.blockedAuthors.map(normalized).filter(Boolean)) {
    const blocked = entry.replace(/^@/, "");
    if (handle === blocked || author.replace(/^@/, "") === blocked || author.includes(`(@${blocked})`) || author.split(" (@")[0] === blocked) reasons.push(`Source author is blocked: ${entry}.`);
  }
  if (settings.reviewSensitive && item.capture?.sensitive) reasons.push("The source marks this content as sensitive.");
  return { ...item, review: reasons.length ? { status: "pending", reasons: [...new Set(reasons)] } : undefined };
}

export function queueImport(item: Item, settings: ImportSettings): Item {
  const reviewed = reviewItem(item, settings);
  if (!item.url || (item.asset && !item.capture)) return reviewed;
  return {
    ...reviewed,
    embed: settings.allowEmbeds ? sourceEmbed(item.url) || item.embed : undefined,
    capture: captureSchema.parse({ ...item.capture, status: settings.autoFetch ? "queued" : "disabled", error: "" }),
  };
}

function failureMessage(error: Error | string): string { return error instanceof Error ? error.message : error; }

function automaticTitle(item: Item, captured: string) {
  const host = new URL(item.url).hostname;
  return captured && [item.url, host, host.replace(/^www\./, "")].includes(item.title.trim()) ? captured : item.title;
}

export function createImporter(transport: SourceTransport) {
  return async function enrich(item: Item, settings: ImportSettings, signal: AbortSignal): Promise<Item> {
    checkCancelled(signal);
    let next = queueImport(item, settings);
    if (!next.capture || !item.url || !settings.autoFetch || next.review?.status === "pending") return next;
    const errors: string[] = [];
    try {
      const provider = sourceEmbed(item.url);
      const documentUrl = provider?.provider === "x" ? `https://api.fxtwitter.com/status/${provider.id}` : item.url;
      const document = await transport.document(documentUrl, settings, signal);
      checkCancelled(signal);
      const metadata = provider?.provider === "x" ? tweetMetadata(document.text) : documentMetadata(document);
      next = {
        ...next,
        title: automaticTitle(item, metadata.title),
        embed: settings.allowEmbeds ? next.embed || metadata.embed : undefined,
        capture: captureSchema.parse({ status: "ready", fetchedAt: new Date().toISOString(), author: metadata.author, sensitive: metadata.sensitive, remoteText: metadata.text }),
      };
      next = reviewItem(next, settings);
      if (next.review?.status === "pending" || !settings.downloadMedia) return next;
      const saved: SavedMedia[] = [];
      for (const media of metadata.media) {
        checkCancelled(signal);
        const existing = item.media.find((entry) => entry.url === media.url && entry.asset);
        if (existing) { saved.push(existing); continue; }
        try {
          const result = await transport.download(media.url, settings, signal);
          checkCancelled(signal);
          const kind = mediaKind(result.mime);
          if (!kind || !result.asset) throw new Error("The downloaded source is not a saved image or video.");
          saved.push({ asset: result.asset, mime: result.mime, kind, url: media.url, width: result.width || media.width || item.width, height: result.height || media.height || item.height });
        } catch (error) {
          checkCancelled(signal);
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          errors.push(`${media.url}: ${failureMessage(error instanceof Error ? error : String(error))}`);
        }
      }
      const priorMedia = [...item.media];
      if (item.asset && (item.kind === "image" || item.kind === "video") && !priorMedia.some((media) => media.asset === item.asset)) {
        priorMedia.push({ asset: item.asset, kind: item.kind, mime: item.mime, url: item.url, width: item.width, height: item.height });
      }
      for (const prior of priorMedia) {
        if (!saved.some((media) => media.asset === prior.asset && media.url === prior.url)) saved.push(prior);
      }
      if (saved.length) {
        const first = saved[0];
        next = { ...next, media: saved, asset: first.asset, kind: first.kind, mime: first.mime, width: first.width, height: first.height };
      }
      if (errors.length) next = { ...next, capture: captureSchema.parse({ ...next.capture, status: saved.length ? "partial" : "failed", error: errors.join("\n") }) };
      checkCancelled(signal);
      return next;
    } catch (error) {
      checkCancelled(signal);
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return reviewItem({ ...next, capture: captureSchema.parse({ ...next.capture, status: "failed", error: failureMessage(error instanceof Error ? error : String(error)) }) }, settings);
    }
  };
}

export const enrichItem = createImporter(sourceTransport);
