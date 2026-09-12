import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  emptyLibrary,
  librarySchema,
  portableSchema,
  type Library,
  type Item,
  type Provider,
} from "./model";

export const desktop = isTauri();
let dbPromise: Promise<IDBDatabase> | undefined;
const objectUrls = new Map<string, string>();
let sessionKey = "";
let sessionEndpoint = "";

function database() {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("inspo-library-preview", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("library");
      request.result.createObjectStore("assets");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Unable to open local storage. Check browser storage permissions.",
        ),
      );
  });
  return dbPromise;
}
async function put(store: string, key: string, value: Library | Blob) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error("Unable to save locally. Check available disk space."));
    tx.onabort = () =>
      reject(new Error("The local save was interrupted. Try again."));
  });
}
export async function loadLibrary(): Promise<Library> {
  if (desktop) {
    const value = await invoke<string | null>("load_library");
    return value ? librarySchema.parse(JSON.parse(value)) : emptyLibrary();
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("library")
      .objectStore("library")
      .get("current");
    request.onsuccess = () => {
      const parsed = librarySchema.safeParse(request.result);
      if (request.result === undefined) resolve(emptyLibrary());
      else if (parsed.success) resolve(parsed.data);
      else
        reject(
          new Error(
            "This library could not be read. Import a compatible backup to recover it.",
          ),
        );
    };
    request.onerror = () =>
      reject(new Error("Unable to read the library. Try reopening the app."));
  });
}
export async function saveLibrary(library: Library) {
  const valid = librarySchema.parse(library);
  if (desktop) await invoke("save_library", { json: JSON.stringify(valid) });
  else await put("library", "current", valid);
}
export async function saveAsset(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  const key = Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  if (desktop)
    await invoke("save_asset", {
      key,
      bytes: Array.from(new Uint8Array(buffer)),
    });
  else await put("assets", key, blob);
  return key;
}
async function readAsset(key: string, mime: string): Promise<Blob> {
  if (key.startsWith("demo/")) {
    const response = await fetch(`/${key}`);
    if (!response.ok) throw new Error("The sample image is unavailable.");
    return response.blob();
  }
  if (desktop) {
    const bytes = await invoke<number[]>("read_asset", { key });
    return new Blob([new Uint8Array(bytes)], { type: mime });
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("assets").objectStore("assets").get(key);
    request.onsuccess = () =>
      request.result instanceof Blob
        ? resolve(request.result)
        : reject(
            new Error(
              "The local file is unavailable. Re-import the original file to restore it.",
            ),
          );
    request.onerror = () =>
      reject(new Error("Unable to read this local file."));
  });
}
export async function assetUrl(key: string, mime: string): Promise<string> {
  if (!key) return "";
  if (key.startsWith("demo/")) return `/${key}`;
  const cached = objectUrls.get(key);
  if (cached) return cached;
  const url = URL.createObjectURL(await readAsset(key, mime));
  objectUrls.set(key, url);
  return url;
}
export function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer || result === null)
        reject(new Error("Unable to read file."));
      else resolve(result);
    };
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(blob);
  });
}
export async function backupLibrary(library: Library) {
  const sourceAssets = library.items.flatMap(itemAssets);
  const assets = await Promise.all(
    [
      ...new Set(
        sourceAssets
          .map((i) => i.asset)
          .filter((k) => k && !k.startsWith("demo/")),
      ),
    ].map(async (key) => {
      const mime =
        sourceAssets.find((i) => i.asset === key)?.mime ||
        "application/octet-stream";
      return { key, mime, data: await dataUrl(await readAsset(key, mime)) };
    }),
  );
  return new Blob(
    [JSON.stringify({ format: "inspo-library", library, assets })],
    { type: "application/json" },
  );
}
export async function restoreLibrary(file: File): Promise<Library> {
  const backup = portableSchema.parse(JSON.parse(await file.text()));
  const keys = new Set(backup.assets.map((a) => a.key));
  if (
    backup.library.items.flatMap(itemAssets).some(
      (i) => i.asset && !i.asset.startsWith("demo/") && !keys.has(i.asset),
    )
  )
    throw new Error(
      "This backup is missing source files. The current library was not changed.",
    );
  for (const asset of backup.assets) {
    if (!asset.data.startsWith("data:"))
      throw new Error("The backup contains an invalid file.");
    const response = await fetch(asset.data);
    const blob = await response.blob();
    const key = await saveAsset(blob);
    if (key !== asset.key)
      throw new Error(
        "A backup file failed its integrity check. The current library was not changed.",
      );
  }
  await saveLibrary(backup.library);
  return backup.library;
}
function itemAssets(item: Item) {
  return [{ asset: item.asset, mime: item.mime }, ...item.media];
}
export async function setProviderKey(provider: Provider, key: string) {
  if (desktop)
    await invoke("set_provider_key", {
      endpoint: provider.endpoint,
      secret: key,
    });
  else {
    sessionKey = key;
    sessionEndpoint = provider.endpoint;
  }
}
export function browserKey(endpoint: string) {
  return endpoint === sessionEndpoint ? sessionKey : "";
}
export async function openExternal(url: string) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol))
    throw new Error("Only HTTP and HTTPS links can be opened.");
  if (desktop) await invoke("open_external", { url: parsed.toString() });
  else window.open(parsed, "_blank", "noopener,noreferrer");
}
