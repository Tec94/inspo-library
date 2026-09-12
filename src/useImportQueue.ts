import { useEffect, useRef, useState, useCallback } from "react";
import { enrichItem, queueImport } from "./importing";
import { captureSchema, type Item, type Library } from "./model";

export function isPendingReview(item: Item) {
  return item.review?.status === "pending" || (!item.review && item.tags.includes("needs-review"));
}

export function prepareLibraryImports(library: Library): Library {
  return {
    ...library,
    items: library.items.map((item) => {
      if (!item.url || item.state !== "active") return item;
      if (item.capture?.status === "fetching") return queueImport({ ...item, capture: undefined }, library.importSettings);
      if (!item.capture && !item.asset) return queueImport(item, library.importSettings);
      return item;
    }),
  };
}

export function retryItem(item: Item, library: Library): Item {
  if (!item.url || item.state !== "active" || isPendingReview(item)) return item;
  return {
    ...item,
    capture: captureSchema.parse({ ...item.capture, status: library.importSettings.autoFetch ? "queued" : "disabled", error: "" }),
  };
}

export function approveItem(item: Item, library: Library): Item {
  return retryItem({ ...item, review: { status: "approved", reasons: [] }, tags: item.tags.filter((tag) => tag !== "needs-review") }, library);
}

export function mergeImportedItem(live: Item, started: Item, result: Item): Item {
  return {
    ...live,
    title: live.title === started.title ? result.title : live.title,
    kind: result.kind,
    asset: result.asset,
    mime: result.mime,
    width: result.width,
    height: result.height,
    media: result.media,
    embed: result.embed,
    capture: result.capture,
    review: live.review?.status === "approved" ? live.review : result.review,
  };
}

export function mergeReferenceEdits(live: Item, before: Item | undefined, editedItem: Item): Item {
  const edited = <K extends keyof Item>(field: K) => editedItem[field] !== before?.[field] ? editedItem[field] : live[field];
  return { ...live, title: edited("title"), body: edited("body"), tags: edited("tags"), collections: edited("collections"), favorite: edited("favorite"), state: edited("state"), x: edited("x"), y: edited("y") };
}

interface ActiveImport {
  id: string;
  url: string;
  settings: string;
  controller: AbortController;
}
type MutateLibrary = (change: (library: Library) => Library) => Promise<void>;

export function useImportQueue(library: Library | undefined, mutate: MutateLibrary) {
  const active = useRef<ActiveImport | undefined>(undefined);
  const [revision, setRevision] = useState(0);
  const [problem, setProblem] = useState("");
  const stopped = useRef(false);
  const [busy, setBusy] = useState("");
  const cancel = useCallback(() => active.current?.controller.abort(), []);
  const resume = useCallback(() => {
    stopped.current = false;
    setProblem("");
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!library) return;
    const settings = JSON.stringify(library.importSettings);
    if (active.current) {
      const item = library.items.find((entry) => entry.id === active.current?.id);
      if (!library.importSettings.autoFetch || !item || item.url !== active.current.url || item.state !== "active" || isPendingReview(item) || settings !== active.current.settings)
        active.current.controller.abort();
      return;
    }
    if (stopped.current || !library.importSettings.autoFetch) return;
    const source = library.items.find((item) => item.url && item.state === "active" && !isPendingReview(item) && (item.capture?.status === "queued" || item.capture?.status === "disabled"));
    if (!source) return;
    const controller = new AbortController();
    active.current = { id: source.id, url: source.url, settings, controller };
    setBusy(source.title);
    const work = async () => {
      try {
        await mutate((current) => ({
          ...current,
          items: current.items.map((item) => item.id === source.id && (item.capture?.status === "queued" || item.capture?.status === "disabled")
            ? { ...item, capture: captureSchema.parse({ ...item.capture, status: "fetching" }) } : item),
        }));
        controller.signal.throwIfAborted();
        let result: Item;
        try {
          result = await enrichItem(source, library.importSettings, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          result = { ...source, capture: captureSchema.parse({ ...source.capture, status: "failed", error: error instanceof Error ? error.message : String(error) }) };
        }
        controller.signal.throwIfAborted();
        await mutate((current) => ({
          ...current,
          items: current.items.map((item) => item.id === source.id && item.url === source.url && item.capture?.status === "fetching"
            ? mergeImportedItem(item, source, result) : item),
        }));
      } catch (error) {
        if (controller.signal.aborted) {
          await mutate((current) => ({
            ...current,
            items: current.items.map((item) => item.id === source.id && item.capture?.status === "fetching"
              ? isPendingReview(item) || item.state !== "active" ? { ...item, capture: captureSchema.parse({ ...item.capture, status: "disabled" }) } : retryItem(item, current) : item),
          }));
        } else throw error;
      }
    };
    void work().catch((error) => {
      stopped.current = true;
      setProblem(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      active.current = undefined;
      setBusy("");
      setRevision((value) => value + 1);
    });
  }, [library, mutate, revision]);
  return { busy, problem, cancel, resume };
}
