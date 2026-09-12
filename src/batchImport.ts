import { z } from "zod";
import { createItem, itemSchema, type Item } from "./model";

const entrySchema = itemSchema.pick({ url: true }).extend({
  title: z.string().trim().min(1).optional(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).refine((entry) => Boolean(entry.url), "A source URL is required.");

export function sourceKey(value: string): string {
  const url = new URL(value);
  if (["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "m.twitter.com"].includes(url.hostname)) {
    const post = url.pathname.match(/^\/(?:[^/]+\/status|i\/web\/status)\/(\d+)(?:\/|$)/);
    if (post) return `x:${post[1]}`;
  }
  url.hash = "";
  const trackingKeys = [...url.searchParams.keys()].filter((key) => /^utm_/i.test(key) || ["fbclid", "gclid", "dclid", "msclkid"].includes(key.toLowerCase()));
  for (const key of trackingKeys) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}

function linksFromText(input: string) {
  if (/(?:^|\s)(?:javascript|data|file|ftp):/i.test(input)) {
    throw new Error("Only HTTP and HTTPS source links can be imported.");
  }
  const links = [...input.matchAll(/https?:\/\/[^\s<>"'`]*/gi)].map(([match]) => {
    let url = match.replace(/[.,;:!?]+$/, "");
    for (const [opening, closing] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (url.endsWith(closing) && url.split(closing).length > url.split(opening).length) url = url.slice(0, -1);
    }
    return { url };
  });
  if (!links.length) throw new Error("Paste at least one complete HTTP or HTTPS link.");
  return links;
}

export function prepareBatch(text: string, existing: string[], collection: string) {
  const input = text.trim();
  if (!input) throw new Error("Paste links or choose a reference list first.");
  const isJson = /^\[\s*(?:\{|\])|^\{/.test(input);
  const parsed = isJson ? z.union([z.array(entrySchema).min(1), entrySchema]).parse(JSON.parse(input)) : linksFromText(input);
  const entries = z.array(entrySchema).min(1).parse(
    Array.isArray(parsed) ? parsed : [parsed],
  );
  const seen = new Set(existing.filter(Boolean).map(sourceKey));
  const items: Item[] = [];
  let duplicates = 0;
  for (const entry of entries) {
    const key = sourceKey(entry.url);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    const item = createItem(entry.title || new URL(entry.url).hostname, "link");
    item.url = new URL(entry.url).toString();
    item.body = entry.body || "";
    item.tags = [...new Set((entry.tags || []).map((tag) => tag.trim()).filter(Boolean))];
    item.collections = collection ? [collection] : [];
    item.origin = isJson ? "Imported reference list" : "Pasted link";
    items.push(item);
  }
  return { items, duplicates };
}
