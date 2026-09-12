import { z } from "zod";

const kindSchema = z.enum(["image", "video", "pdf", "note", "link", "file"]);
const sampleAssetNames = new Set([
  "A5Pce5.png",
  "VNEeQ.png",
  "YJyTv.png",
  "PJGlf.png",
  "V9fCQL.png",
  "S2DPo.png",
  "GWQho.png",
  "oQWkt.png",
  "editorial.svg",
  "colors.svg",
  "type.svg",
  "balance.svg",
  "contrast.svg",
  "space.svg",
]);
export const sourceUrlSchema = z.string().refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}, "Use an HTTP or HTTPS URL without embedded credentials.");
export const assetKeySchema = z.string().refine(
  (value) => !value || /^[a-f0-9]{64}$/.test(value) || (value.startsWith("demo/") && sampleAssetNames.has(value.slice(5))),
  "Invalid local asset identifier.",
).default("");
export const savedMediaSchema = z.object({
  asset: assetKeySchema,
  mime: z.string(),
  kind: z.enum(["image", "video"]),
  url: sourceUrlSchema,
  width: z.number().positive().default(600),
  height: z.number().positive().default(600),
});
export type SavedMedia = z.infer<typeof savedMediaSchema>;
export const embedSchema = z.object({ provider: z.enum(["youtube", "vimeo", "x"]), id: z.string().regex(/^[A-Za-z0-9_-]+$/) });
export const captureSchema = z.object({
  status: z.enum(["queued", "fetching", "ready", "partial", "failed", "disabled"]),
  error: z.string().default(""),
  fetchedAt: z.string().default(""),
  author: z.string().default(""),
  sensitive: z.boolean().default(false),
  remoteText: z.string().default(""),
});
export const importSettingsSchema = z.object({
  autoFetch: z.boolean().default(true),
  downloadMedia: z.boolean().default(true),
  allowEmbeds: z.boolean().default(true),
  preferredKeywords: z.array(z.string()).default([]),
  excludedKeywords: z.array(z.string()).default([]),
  blockedDomains: z.array(z.string()).default([]),
  blockedAuthors: z.array(z.string()).default([]),
  reviewSensitive: z.boolean().default(true),
  maxDownloadMb: z.number().positive().nullable().default(null),
  requestTimeoutSeconds: z.number().positive().nullable().default(null),
});
export type ImportSettings = z.infer<typeof importSettingsSchema>;
export const itemSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  kind: kindSchema,
  asset: z
    .string()
    .refine(
      (value) =>
        !value ||
        /^[a-f0-9]{64}$/.test(value) ||
        (value.startsWith("demo/") && sampleAssetNames.has(value.slice(5))),
      "Invalid local asset identifier.",
    )
    .default(""),
  mime: z.string().default(""),
  width: z.number().positive().default(600),
  height: z.number().positive().default(600),
  body: z.string().default(""),
  url: sourceUrlSchema.default(""),
  tags: z.array(z.string()).default([]),
  collections: z.array(z.string()).default([]),
  favorite: z.boolean().default(false),
  state: z.enum(["active", "archived", "trashed"]).default("active"),
  createdAt: z.string(),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
  origin: z.string().default("Imported by you"),
  media: z.array(savedMediaSchema).default([]),
  embed: embedSchema.optional(),
  capture: captureSchema.optional(),
  review: z.object({ status: z.enum(["pending", "approved"]), reasons: z.array(z.string()) }).optional(),
});
export type Item = z.infer<typeof itemSchema>;
export const targetSchema = z.object({
  itemId: z.string(),
  label: z.string(),
  title: z.string(),
  kind: kindSchema,
  text: z.string(),
  image: z.string().optional(),
  selection: z.string(),
});
export type Target = z.infer<typeof targetSchema>;
export const answerSchema = z.object({
  title: z.string().min(1),
  observations: z
    .array(
      z.object({
        text: z.string(),
        sources: z.array(z.string()).min(1),
        basis: z.enum(["observed", "inferred", "uncertain"]),
      }),
    )
    .min(1),
  vocabulary: z.array(z.object({ term: z.string(), definition: z.string() })),
  explanation: z.string(),
  recreation: z.string(),
  uncertainty: z.string(),
});
export type Answer = z.infer<typeof answerSchema>;
export const providerSchema = z.object({
  endpoint: z.string(),
  model: z.string(),
  vision: z.boolean(),
  local: z.boolean(),
});
export type Provider = z.infer<typeof providerSchema>;
export const librarySchema = z
  .object({
    version: z.literal(1),
    profile: z.object({
      name: z.string(),
      context: z.string(),
      interests: z.array(z.string()),
      tools: z.string(),
      completed: z.boolean(),
      step: z.number(),
      theme: z.enum(["light", "dark", "system"]),
      reduceMotion: z.boolean(),
    }),
    collections: z.array(z.string()),
    items: z.array(itemSchema),
    lessons: z.array(
      z.object({
        id: z.string(),
        question: z.string(),
        answer: answerSchema,
        targets: z.array(targetSchema.omit({ image: true })),
        createdAt: z.string(),
      }),
    ),
    terms: z.array(
      z.object({
        term: z.string(),
        definition: z.string(),
        lessonId: z.string().optional(),
      }),
    ),
    provider: providerSchema,
    importSettings: importSettingsSchema.default(() => importSettingsSchema.parse({})),
  })
  .refine(
    (l) => new Set(l.items.map((i) => i.id)).size === l.items.length,
    "Reference identifiers must be unique.",
  );
export type Library = z.infer<typeof librarySchema>;
export type Profile = Library["profile"];
export type Lesson = Library["lessons"][number];
export type Destination =
  | "all"
  | "inbox"
  | "review"
  | "favorites"
  | "archive"
  | "trash"
  | "lessons"
  | "vocabulary"
  | "settings"
  | `collection:${string}`;
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Selection {
  itemId: string;
  mediaIndex?: number;
  crop?: Crop;
  text?: string;
  time?: number;
}
export interface Asset {
  key: string;
  blob: Blob;
}
export const portableSchema = z.object({
  format: z.literal("inspo-library"),
  library: librarySchema,
  assets: z.array(
    z.object({ key: z.string(), data: z.string(), mime: z.string() }),
  ),
});

export function emptyLibrary(): Library {
  return {
    version: 1,
    profile: {
      name: "My library",
      context: "Designer & developer",
      interests: ["Interaction & motion", "Type & editorial"],
      tools: "React, CSS, Figma",
      completed: false,
      step: 0,
      theme: "light",
      reduceMotion: false,
    },
    collections: [
      "Interaction",
      "Type & editorial",
      "Objects & spaces",
      "Color studies",
      "To build",
    ],
    items: [],
    lessons: [],
    terms: [],
    provider: {
      endpoint: "http://localhost:11434/v1",
      model: "",
      vision: false,
      local: true,
    },
    importSettings: importSettingsSchema.parse({}),
  };
}
export function createItem(title: string, kind: Item["kind"]): Item {
  return itemSchema.parse({
    id: crypto.randomUUID(),
    title,
    kind,
    createdAt: new Date().toISOString(),
  });
}
export function filterItems(
  items: Item[],
  destination: Destination,
  query: string,
  kind = "all",
  tag = "",
) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const state =
      destination === "trash"
        ? "trashed"
        : destination === "archive"
          ? "archived"
          : "active";
    if (item.state !== state || (kind !== "all" && item.kind !== kind))
      return false;
    const needsReview = item.review?.status === "pending" || (!item.review && item.tags.includes("needs-review"));
    if (destination === "review" && !needsReview) return false;
    if (!["review", "trash", "archive"].includes(destination) && needsReview) return false;
    if (tag && !item.tags.includes(tag)) return false;
    if (destination === "favorites" && !item.favorite) return false;
    if (destination === "inbox" && item.collections.length > 0) return false;
    if (
      destination.startsWith("collection:") &&
      !item.collections.includes(destination.slice(11))
    )
      return false;
    const haystack = [
      item.title,
      item.body,
      item.url,
      ...item.tags,
      ...item.collections,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
export function countTags(items: Item[]) {
  const counts = new Map<string, number>();
  for (const item of items)
    for (const tag of new Set(item.tags))
      counts.set(tag, (counts.get(tag) || 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}
export function sourceLabel(index: number): string {
  let label = "";
  let n = index + 1;
  while (n > 0) {
    n--;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}
export function validateEndpoint(provider: Provider): string {
  const url = new URL(provider.endpoint);
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "Use an endpoint without credentials, query parameters, or a fragment.",
    );
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    throw new Error("Use HTTPS, or HTTP for a model running on localhost.");
  if (provider.local && !loopback)
    throw new Error(
      "A local model endpoint must use localhost or a loopback address.",
    );
  if (!provider.model.trim())
    throw new Error("Enter the model name used by your provider.");
  return `${url.toString().replace(/\/$/, "")}/chat/completions`;
}
export function validateAnswer(answer: Answer, targets: Target[]): Answer {
  const labels = new Set(targets.map((t) => t.label));
  if (answer.observations.some((o) => o.sources.some((s) => !labels.has(s))))
    throw new Error(
      "The model cited a source outside this question. Try again with the same evidence.",
    );
  return answer;
}
export const glossary = new Map([
  [
    "visual hierarchy",
    "The perceptual order in which elements attract attention.",
  ],
  [
    "figure–ground",
    "The relationship between a focal subject and its surroundings.",
  ],
  [
    "spatial continuity",
    "Preserving the perceived position and relationship of objects as a view changes.",
  ],
  [
    "simultaneous contrast",
    "The effect adjacent colors have on each other’s perceived appearance.",
  ],
]);
