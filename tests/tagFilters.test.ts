import { describe, expect, it } from "vitest";
import { countTags, createItem, filterItems } from "../src/model";

describe("tag browsing", () => {
  const first = { ...createItem("Motion study", "link"), tags: ["design", "motion"], collections: ["Interaction"], favorite: true };
  const second = { ...createItem("Design systems", "note"), tags: ["design-system"], body: "design needs-review" };
  const archived = { ...first, id: "archived", state: "archived" as const };
  it("matches exact tags and combines them with search, type, collection, and state", () => {
    const items = [first, second, archived];
    expect(filterItems(items, "all", "", "all", "design")).toEqual([first]);
    expect(filterItems(items, "collection:Interaction", "motion", "link", "motion")).toEqual([first]);
    expect(filterItems(items, "all", "motion", "note", "design")).toEqual([]);
    expect(filterItems(items, "archive", "", "all", "design")).toEqual([archived]);
    expect(filterItems(items, "all", "", "all", "")).toEqual([first, second]);
  });
  it("counts each reference once per tag in the visible scope", () => {
    expect(countTags([{ ...first, tags: ["design", "design", "needs-review"] }, second])).toEqual([["design", 1], ["design-system", 1], ["needs-review", 1]]);
  });
});
