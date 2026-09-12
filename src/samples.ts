import { createItem } from "./model";

export const sampleImages = [
  {
    file: "A5Pce5.png",
    title: "Light through a space",
    width: 464,
    height: 460,
    collection: "Objects & spaces",
    tags: ["light", "contrast", "architecture"],
  },
  {
    file: "VNEeQ.png",
    title: "Color as a focal point",
    width: 464,
    height: 600,
    collection: "Color studies",
    tags: ["yellow", "blue", "contrast"],
  },
  {
    file: "YJyTv.png",
    title: "A library of quiet details",
    width: 464,
    height: 360,
    collection: "Objects & spaces",
    tags: ["rhythm", "wood", "space"],
  },
  {
    file: "PJGlf.png",
    title: "Soft reflections",
    width: 464,
    height: 540,
    collection: "Objects & spaces",
    tags: ["glass", "reflection", "form"],
  },
  {
    file: "V9fCQL.png",
    title: "Room to breathe",
    width: 464,
    height: 440,
    collection: "Objects & spaces",
    tags: ["interior", "space", "light"],
  },
  {
    file: "S2DPo.png",
    title: "Type with a little attitude",
    width: 464,
    height: 520,
    collection: "Type & editorial",
    tags: ["type", "red", "lettering"],
  },
  {
    file: "GWQho.png",
    title: "Finding a rhythm",
    width: 464,
    height: 460,
    collection: "Interaction",
    tags: ["pattern", "rhythm", "blue"],
  },
  {
    file: "oQWkt.png",
    title: "A working surface",
    width: 464,
    height: 580,
    collection: "To build",
    tags: ["interface", "workspace"],
  },
];

export function sampleItems() {
  const photos = sampleImages.map((sample, index) => ({
    ...createItem(sample.title, "image"),
    asset: `demo/${sample.file}`,
    mime: "image/png",
    width: sample.width,
    height: sample.height,
    collections: [sample.collection],
    tags: sample.tags,
    favorite: index === 1 || index === 3,
    x: (index % 4) * 285,
    y: Math.floor(index / 4) * 360,
    origin: "Sample reference · Unsplash",
    body:
      index === 1
        ? "The yellow chair against the blue wall creates a clear focal point. What can I take from this contrast?"
        : "",
  }));
  const studies = [
    [
      "Quiet is a design decision.",
      "Less, but considered.",
      "editorial.svg",
      "Type & editorial",
      500,
      670,
    ],
    [
      "A study in warm and cool",
      "Color relationships",
      "colors.svg",
      "Color studies",
      600,
      450,
    ],
    [
      "Shape, then meaning.",
      "Typographic study",
      "type.svg",
      "Type & editorial",
      600,
      550,
    ],
    [
      "Objects in balance",
      "A compositional study",
      "balance.svg",
      "Objects & spaces",
      600,
      730,
    ],
    [
      "Give the eye somewhere to land.",
      "Contrast and hierarchy",
      "contrast.svg",
      "Interaction",
      600,
      400,
    ],
    [
      "A softer kind of structure",
      "Editorial spacing",
      "space.svg",
      "Type & editorial",
      600,
      700,
    ],
  ].map(([title, body, asset, collection, width, height], index) => ({
    ...createItem(String(title), "image"),
    asset: `demo/${asset}`,
    mime: "image/svg+xml",
    body: String(body),
    collections: [String(collection)],
    width: Number(width),
    height: Number(height),
    x: (index % 4) * 285 + 60,
    y: (Math.floor(index / 4) + 2) * 360,
    origin: "Original sample study · Inspo Library",
  }));
  return [
    ...photos.slice(0, 3),
    ...studies.slice(0, 2),
    ...photos.slice(3, 6),
    ...studies.slice(2, 4),
    ...photos.slice(6),
    ...studies.slice(4),
  ];
}
