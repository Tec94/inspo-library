import { useState, type FormEvent } from "react";
import {
  Upload,
  Link as LinkIcon,
  FileText,
  Clipboard,
  Check,
  ImagePlus,
} from "lucide-react";
import { Button, Dialog } from "./components";
import { createItem, type Item } from "./model";
import { saveAsset } from "./storage";
import { prepareBatch } from "./batchImport";

export async function importFiles(
  files: File[],
  collection: string,
): Promise<Item[]> {
  return Promise.all(
    files.map(async (file) => {
      const kind = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : file.type === "application/pdf"
            ? "pdf"
            : file.type.startsWith("text/")
              ? "note"
              : "file";
      const item = createItem(file.name.replace(/\.[^.]+$/, ""), kind);
      item.mime = file.type || "application/octet-stream";
      if (kind === "note") item.body = await file.text();
      else item.asset = await saveAsset(file);
      if (collection) item.collections = [collection];
      item.origin = `Imported file · ${file.name}`;
      if (kind === "image") {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.src = url;
        try {
          await image.decode();
          item.width = image.naturalWidth;
          item.height = image.naturalHeight;
        } catch {
          item.kind = "file";
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      return item;
    }),
  );
}
export interface CaptureProps {
  existingUrls: string[];
  collections: string[];
  initialCollection?: string;
  onClose: () => void;
  add: (items: Item[]) => Promise<void>;
}
export function Capture({
  existingUrls,
  collections,
  initialCollection = "",
  onClose,
  add,
}: CaptureProps) {
  const [tab, setTab] = useState("link");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [collection, setCollection] = useState(initialCollection);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [batch, setBatch] = useState("");
  const [tags, setTags] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  let batchPreview: ReturnType<typeof prepareBatch> | undefined;
  let batchError = "";
  if (tab === "link" && batch.trim()) {
    try { batchPreview = prepareBatch(batch, existingUrls, collection); }
    catch { batchError = "Paste complete HTTP(S) links, or a JSON reference list with valid URLs, titles, notes, and tags."; }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let items: Item[];
      if (tab === "link") {
        const prepared = prepareBatch(batch, existingUrls, collection);
        items = prepared.items;
        setDuplicateCount(prepared.duplicates);
        if (!items.length) throw new Error("These references are already in your library. Nothing was added.");
        const sharedTags = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
        for (const item of items) {
          if (items.length === 1 && title.trim()) item.title = title.trim();
          if (body.trim()) item.body = [item.body, body.trim()].filter(Boolean).join("\n\n");
          item.tags = [...new Set([...item.tags, ...sharedTags])];
        }
      } else if (tab === "files") {
        if (!files.length)
          throw new Error("Choose at least one file to import.");
        items = await importFiles(files, collection);
      } else {
        const item = createItem(title.trim() || "Untitled note", "note");
        item.body = body;
        item.collections = collection ? [collection] : [];
        item.tags = [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))];
        items = [item];
      }
      await add(items);
      setSavedCount(items.length);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save. Check available disk space and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function paste() {
    try {
      const value = await navigator.clipboard.readText();
      if (/https?:\/\//i.test(value)) {
        setTab("link");
        setBatch(value.trim());
      } else {
        setTab("note");
        setBody(value);
      }
    } catch {
      setError(
        "Clipboard access is unavailable. Paste into the link or note field instead.",
      );
    }
  }
  return (
    <Dialog
      title={saved ? "Added to your library" : "Add references"}
      description={
        saved
          ? "Saved on this device, ready when you are."
          : "Paste links. Save the ideas worth keeping."
      }
      onClose={onClose}
    >
      {saved ? (
        <div className="capture-success">
          <span className="success-circle">
            <Check />
          </span>
          <p>
            Your{" "}
            {savedCount > 1
              ? `${savedCount} references are`
              : "reference is"}{" "}
            saved locally.
          </p>
          {duplicateCount > 0 && <p>{duplicateCount} existing or repeated links skipped.</p>}
          {tab === "link" && (
            <p className="muted">
              Automatic capture continues in the background when enabled in Settings.
              Each reference shows its capture status; anything flagged by your rules goes to the review queue.
            </p>
          )}
          <div className="form-actions">
            <Button
              onClick={() => {
                setSaved(false);
                setFiles([]);
                setTitle("");
                setBody("");
                setBatch("");
                setTags("");
                setDuplicateCount(0);
              }}
            >
              Add another
            </Button>
            <Button primary onClick={onClose}>
              Return to library
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack" onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setFiles(Array.from(e.dataTransfer.files));
          setTab("files");
          setError("");
        }}>
          <div
            className="capture-tabs"
            role="group"
            aria-label="Reference type"
          >
            {[
              { id: "link", label: "Links", icon: LinkIcon },
              { id: "files", label: "Files", icon: Upload },
              { id: "note", label: "Note", icon: FileText },
            ].map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                quiet
                aria-pressed={tab === id}
                onClick={() => {
                  setTab(id);
                  setError("");
                }}
              >
                <Icon size={15} />
                {label}
              </Button>
            ))}
            <Button quiet onClick={() => void paste()}>
              <Clipboard size={15} />
              Paste
            </Button>
          </div>
          {tab === "link" ? (
            <>
              <label>
                Links to import
                <textarea autoFocus rows={5} value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Paste a link, several links, or text containing links…" required />
                <small>Links are found automatically in pasted text. Existing and repeated links are skipped.</small>
              </label>
              {batchError && <p className="error" role="alert">{batchError}</p>}
              {batchPreview && <p role="status">{batchPreview.items.length} new references ready · {batchPreview.duplicates} duplicates skipped</p>}
              <details className="capture-extra">
                <summary>Add context or import JSON</summary>
                <div className="form-stack">
                  {batchPreview?.items.length === 1 && <label>Title <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional title" /></label>}
                  <label>Tags <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="design, motion, typography" /><small>Separate tags with commas. Applied to every new link.</small></label>
                  <label>Notes <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What caught your attention?" /></label>
                  <label>
                    JSON reference list
                    <input type="file" accept=".json,application/json" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try { setBatch(await file.text()); setError(""); }
                        catch { setError("Unable to read this reference list."); }
                      }
                    }} />
                    <small>A JSON list preserves each reference’s URL, title, body, and tags.</small>
                  </label>
                </div>
              </details>
            </>
          ) : tab === "files" ? (
            <label
              className="file-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <ImagePlus size={32} strokeWidth={1.2} />
              <strong>
                {files.length
                  ? `${files.length} ${files.length === 1 ? "file" : "files"} selected`
                  : "Drop your next idea here"}
              </strong>
              <span>Images, videos, PDFs, and anything worth keeping.</span>
              <span className="button">Choose files</span>
              <input
                aria-label="Choose reference files"
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
              {files.length > 0 && (
                <small>{files.map((f) => f.name).join(", ")}</small>
              )}
            </label>
          ) : (
            <>
              <label>
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="A thought worth keeping"
                  required
                />
              </label>
              <label>
                Tags
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="design, ai, needs-review" />
                <small>Separate tags with commas.</small>
              </label>
              <label>
                Note
                <textarea
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="The detail, idea, or question you want to revisit…"
                  required
                />
              </label>
            </>
          )}
          <label>
            Save to
            <select
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
            >
              <option value="">Inbox</option>
              {collections.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <span className="muted small">Stored on this device</span>
            <Button type="submit" primary disabled={busy || (tab === "link" && !batchPreview?.items.length)}>
              {busy
                ? "Saving…"
                : tab === "files" || tab === "link"
                  ? "Add references"
                  : "Save reference"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
