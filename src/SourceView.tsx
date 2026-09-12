import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Heart,
  X,
  PanelRight,
  ChevronLeft,
  ChevronRight,
  Crop as CropIcon,
  ArrowUpRight,
  BookmarkPlus,
  Archive,
  Trash2,
  RotateCcw,
  Check,
} from "lucide-react";
import { Button, Dialog, Media } from "./components";
import { openExternal } from "./storage";
import type { Crop, Item, Selection } from "./model";

export interface SourceProps {
  item: Item;
  rect: DOMRect | null;
  collections: string[];
  update: (item: Item) => Promise<void>;
  onClose: () => void;
  ask: (selection: Selection) => void;
  addToQuestion: (selection: Selection) => void;
  navigate: (direction: number) => void;
  reduceMotion: boolean;
  report: (message: string) => void;
  allowEmbeds: boolean;
  keep: () => Promise<void>;
  retry: () => Promise<void>;
}
export function SourceView({
  item,
  rect,
  collections,
  update,
  onClose,
  ask,
  addToQuestion,
  navigate,
  reduceMotion,
  report,
  allowEmbeds,
  keep,
  retry,
}: SourceProps) {
  const [inspector, setInspector] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const [text, setText] = useState("");
  const [time, setTime] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [preferEmbed, setPreferEmbed] = useState(false);
  const drag = useRef<[number, number] | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() || reduceMotion;
  useEffect(() => {
    setCrop(undefined);
    setCropping(false);
    setText("");
    setTime(0);
    setMediaIndex(0);
    setPreferEmbed(false);
  }, [item.id]);
  useEffect(() => { setCrop(undefined); setCropping(false); setTime(0); }, [mediaIndex]);
  const attachment = item.media[mediaIndex];
  const viewed = attachment ? { ...item, asset: attachment.asset, mime: attachment.mime, kind: attachment.kind, width: attachment.width, height: attachment.height } : item;
  const pending = item.review?.status === "pending" || (!item.review && item.tags.includes("needs-review"));
  function point(e: PointerEvent<HTMLDivElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  }
  function startCrop(e: PointerEvent<HTMLDivElement>) {
    if (!cropping) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = point(e);
  }
  function changeCrop(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const p = point(e);
    setCrop({
      x: Math.min(p[0], drag.current[0]),
      y: Math.min(p[1], drag.current[1]),
      width: Math.abs(p[0] - drag.current[0]),
      height: Math.abs(p[1] - drag.current[1]),
    });
  }
  function finishCrop() {
    drag.current = null;
    if (crop && (crop.width === 0 || crop.height === 0)) setCrop(undefined);
  }
  function selection(): Selection {
    const selected: Selection = { itemId: item.id };
    if (attachment) selected.mediaIndex = mediaIndex;
    if (crop) selected.crop = crop;
    if (text) selected.text = text;
    if (viewed.kind === "video") selected.time = time;
    return selected;
  }
  const change = (next: Item) => {
    void update(next).catch((error) => report(String(error)));
  };
  const transition =
    reduced || !rect || document.documentElement.dataset.input === "keyboard"
      ? { duration: 0 }
      : { type: "spring" as const, duration: 0.3, bounce: 0 };
  return (
    <Dialog
      title={item.title}
      className={`source-dialog ${inspector ? "with-inspector" : ""}`}
      onClose={onClose}
    >
      <div className="source-toolbar">
        <div className="source-location">
          <span>{item.collections[0] || "Inbox"}</span>
          <ChevronRight size={13} />
          <strong>{item.title}</strong>
        </div>
        <div className="toolbar-actions">
          <Button
            label={item.favorite ? "Remove from favorites" : "Add to favorites"}
            quiet
            onClick={() => change({ ...item, favorite: !item.favorite })}
          >
            <Heart fill={item.favorite ? "currentColor" : "none"} />
          </Button>
          <Button
            label={inspector ? "Hide inspector" : "Show inspector"}
            quiet
            aria-pressed={inspector}
            onClick={() => setInspector(!inspector)}
          >
            <PanelRight />
          </Button>
          <Button label="Close source" quiet onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>
      <div className="source-layout">
        <div className="source-viewing">
          {pending && <div className="source-import-status"><div><strong>Waiting for your review</strong><p>{item.review?.reasons.join(" · ") || "Marked for review during an earlier import"}</p></div><div className="inline-actions"><Button primary onClick={() => { void keep().catch((error) => report(String(error))); }}><Check size={14} />Keep</Button><Button onClick={() => { void update({ ...item, state: "trashed" }).then(onClose).catch((error) => report(String(error))); }}>Trash</Button></div></div>}
          <div className="source-stage" ref={stage}>
            <Button
              label="Previous reference"
              quiet
              className="source-prev"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft />
            </Button>
            <motion.div
              className={`focused-media ${cropping ? "is-cropping" : ""}`}
              initial={rect && !reduced ? { opacity: 0, scale: 0.96 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={transition}
              style={
                viewed.kind === "image" && !preferEmbed
                  ? { aspectRatio: `${viewed.width} / ${viewed.height}` }
                  : {}
              }
            >
              <Media item={viewed} controls onTime={setTime} onText={setText} allowEmbeds={allowEmbeds && !pending} preferEmbed={preferEmbed} />
              {cropping && (
                <div
                  className="crop-layer"
                  onPointerDown={startCrop}
                  onPointerMove={changeCrop}
                  onPointerUp={finishCrop}
                  onPointerCancel={finishCrop}
                >
                  {crop && (
                    <div
                      className="crop-rectangle"
                      style={{
                        left: `${crop.x * 100}%`,
                        top: `${crop.y * 100}%`,
                        width: `${crop.width * 100}%`,
                        height: `${crop.height * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </motion.div>
            <Button
              label="Next reference"
              quiet
              className="source-next"
              onClick={() => navigate(1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="source-caption">
            <div>
              <strong>{item.title}</strong>
              <span>
                {item.origin} ·{" "}
                {item.asset
                  ? "Saved locally"
                  : item.kind === "link"
                    ? "Link saved"
                    : "Saved locally"}
              </span>
            </div>
            <Button onClick={() => ask(selection())}>
              <BookmarkPlus size={15} /> Ask about this
            </Button>
          </div>
          <div className="source-bottom-tools">
            {viewed.kind === "image" && !preferEmbed && (
              <Button
                aria-pressed={cropping}
                onClick={() => {
                  setCropping(!cropping);
                  if (!cropping) setInspector(true);
                }}
              >
                <CropIcon size={15} />{" "}
                {cropping ? "Finish region" : "Select region"}
              </Button>
            )}
            {crop && (
              <Button quiet onClick={() => setCrop(undefined)}>
                <RotateCcw size={14} /> Whole image
              </Button>
            )}
            {viewed.kind === "video" && !preferEmbed && (
              <span>Frame at {time.toFixed(1)} seconds</span>
            )}
            {text && <span>Text selection attached</span>}
            {item.media.length > 1 && <div className="attachment-picker" aria-label="Source attachments">{item.media.map((media, index) => <Button key={`${media.asset}-${index}`} aria-pressed={index === mediaIndex && !preferEmbed} onClick={() => { setMediaIndex(index); setPreferEmbed(false); }}>{media.kind === "video" ? "Video" : "Image"} {index + 1}</Button>)}</div>}
            {allowEmbeds && item.embed && item.asset && !pending && <Button onClick={() => { setPreferEmbed(!preferEmbed); setCropping(false); setCrop(undefined); }}>{preferEmbed ? "View downloaded media" : "View embedded source"}</Button>}
          </div>
          {item.url && !pending && <div className="source-import-status"><div><strong>{item.capture?.status === "fetching" ? "Importing source…" : item.capture?.status === "queued" ? "Waiting to import…" : item.media.length ? `${item.media.length} ${item.media.length === 1 ? "attachment" : "attachments"} saved locally` : item.embed && allowEmbeds ? "Embedded source · internet required" : "Source link saved"}</strong>{item.capture?.error && <p role="status">{item.capture.error}</p>}</div><div className="inline-actions">{item.capture?.status !== "fetching" && item.capture?.status !== "queued" && <Button onClick={() => { void retry().catch((error) => report(String(error))); }}><RotateCcw size={13} />Retry import</Button>}<Button onClick={() => { void openExternal(item.url).catch((error) => report(String(error))); }}>Open original <ArrowUpRight size={13} /></Button></div></div>}
        </div>
        {inspector && (
          <aside className="source-inspector" aria-label="Source inspector">
            <h2>{item.title}</h2>
            <div className="source-status">
              <Check size={14} />
              <span>{item.asset ? "Media saved locally" : "Source saved locally"}</span>
            </div>
            <p className="muted">
              {item.kind === "image" ? `${item.width} × ${item.height} · ` : ""}
              {item.kind}
            </p>
            <section>
              <h3>Source</h3>
              <p>{item.origin}</p>
              {item.url && (
                <Button
                  onClick={() => {
                    void openExternal(item.url).catch((error) =>
                      report(String(error)),
                    );
                  }}
                >
                  Open original <ArrowUpRight size={14} />
                </Button>
              )}
            </section>
            <section>
              <h3>Collections</h3>
              <div className="tag-list">
                {item.collections.length ? (
                  item.collections.map((c) => (
                    <span className="tag" key={c}>
                      {c}
                    </span>
                  ))
                ) : (
                  <span className="muted">Inbox</span>
                )}
              </div>
              <h3>Tags</h3>
              <div className="tag-list">
                {item.tags.length ? (
                  item.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="muted">No tags yet</span>
                )}
              </div>
            </section>
            <section>
              <h3>My note</h3>
              <p className="user-note">
                {item.body || "What caught your attention?"}
              </p>
              <Button onClick={() => setEditing(true)}>Edit reference</Button>
            </section>
            {item.capture?.remoteText && <section><h3>Captured source text</h3><p className="source-remote-text" onMouseUp={() => setText(window.getSelection()?.toString() || "")}>{item.capture.remoteText}</p></section>}
            {cropping && (
              <section>
                <h3>Evidence region</h3>
                <p className="muted">
                  Drag on the image, or set the region below.
                </p>
                <div className="crop-fields">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <label key={key}>
                      {key}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={Math.round(
                          (crop?.[key] ??
                            (key === "width" || key === "height" ? 1 : 0)) *
                            100,
                        )}
                        onChange={(e) => {
                          const c = crop || { x: 0, y: 0, width: 1, height: 1 };
                          const next = {
                            ...c,
                            [key]: Number(e.target.value) / 100,
                          };
                          next.x = Math.max(
                            0,
                            Math.min(next.x, 1 - 1 / item.width),
                          );
                          next.y = Math.max(
                            0,
                            Math.min(next.y, 1 - 1 / item.height),
                          );
                          next.width = Math.max(
                            1 / item.width,
                            Math.min(next.width, 1 - next.x),
                          );
                          next.height = Math.max(
                            1 / item.height,
                            Math.min(next.height, 1 - next.y),
                          );
                          setCrop(next);
                        }}
                      />
                    </label>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h3>Question target</h3>
              <p>
                {crop
                  ? "Selected image region"
                  : text
                    ? "Selected text"
                    : item.kind === "video"
                      ? `Frame at ${time.toFixed(1)}s`
                      : "Whole source"}
              </p>
              <div className="stack">
                <Button primary onClick={() => ask(selection())}>
                  Ask about this
                </Button>
                <Button onClick={() => addToQuestion(selection())}>
                  Add to question
                </Button>
              </div>
            </section>
            <div className="source-management">
              <Button
                quiet
                onClick={() =>
                  change({
                    ...item,
                    state: item.state === "archived" ? "active" : "archived",
                  })
                }
              >
                <Archive size={15} />
                {item.state === "archived" ? "Unarchive" : "Archive"}
              </Button>
              <Button
                quiet
                onClick={() => {
                  change({
                    ...item,
                    state: item.state === "trashed" ? "active" : "trashed",
                  });
                  onClose();
                }}
              >
                <Trash2 size={15} />
                {item.state === "trashed" ? "Restore" : "Move to trash"}
              </Button>
            </div>
          </aside>
        )}
      </div>
      {editing && (
        <EditReference
          item={item}
          collections={collections}
          onClose={() => setEditing(false)}
          save={async (next) => {
            await update(next);
            setEditing(false);
          }}
        />
      )}
    </Dialog>
  );
}
interface EditProps {
  item: Item;
  collections: string[];
  onClose: () => void;
  save: (item: Item) => Promise<void>;
}
function EditReference({ item, collections, onClose, save }: EditProps) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [tags, setTags] = useState(item.tags.join(", "));
  const [chosen, setChosen] = useState(item.collections);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({
        ...item,
        title: title.trim(),
        body,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        collections: chosen,
      });
    } catch {
      setError("Unable to save this reference. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Edit reference" onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label>
          My note
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="What caught your attention?"
          />
        </label>
        <label>
          Tags
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="contrast, color, rhythm"
          />
          <small>Separate tags with commas.</small>
        </label>
        <fieldset>
          <legend>Collections</legend>
          <div className="choice-list">
            {collections.map((c) => (
              <label key={c} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={chosen.includes(c)}
                  onChange={() =>
                    setChosen(
                      chosen.includes(c)
                        ? chosen.filter((v) => v !== c)
                        : [...chosen, c],
                    )
                  }
                />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" primary disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
