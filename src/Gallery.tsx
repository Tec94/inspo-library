import { Heart, Check, ArrowUpRight, Trash2, UserRound, LoaderCircle, CircleAlert, Download, Play } from "lucide-react";
import { Media } from "./components";
import type { Item } from "./model";

export interface GalleryProps {
  items: Item[];
  selected: string[];
  select: (id: string) => void;
  open: (item: Item, rect: DOMRect | null) => void;
  filterTag: (tag: string) => void;
  trash?: (item: Item) => void;
  reduceMotion?: boolean;
}
const cardDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function Gallery({ items, selected, select, open, filterTag, trash, reduceMotion = false }: GalleryProps) {
  return (
    <div className="gallery-shell" data-reduce-motion={reduceMotion}>
      <div className="gallery-scroll">
        <div className="reference-grid">
          {items.map((item) => (
            <article key={item.id} className={`reference-card ${selected.includes(item.id) ? "selected" : ""}`}>
              <button className="reference-open" aria-label={`Open ${item.title}`} onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || selected.length) select(item.id);
                else open(item, e.detail === 0 ? null : e.currentTarget.getBoundingClientRect());
              }}>
                {item.kind === "link" && !item.asset ? (
                  <div className="link-card-context">
                    <span className="link-card-domain"><ArrowUpRight size={16} /> {item.url ? new URL(item.url).hostname.replace(/^www\./, "") : "Saved link"}</span>
                    <p>{item.capture?.remoteText || item.body.split(/\n\s*\n/)[0] || item.title}</p>
                  </div>
                ) : <Media item={item} />}
                {item.favorite && <span className="favorite-mark"><Heart size={13} fill="currentColor" /></span>}
                {item.url && <span className="card-domain">{new URL(item.url).hostname.replace(/^www\./, "")} <ArrowUpRight size={10} aria-hidden="true" /></span>}
              </button>
              <button className={`selection-toggle ${selected.includes(item.id) ? "checked" : ""}`} aria-label={`Select ${item.title}`} aria-pressed={selected.includes(item.id)} onClick={() => select(item.id)}>
                {selected.includes(item.id) && <Check size={12} />}
              </button>
              {trash && <button className="card-trash" aria-label={`Move ${item.title} to trash`} onClick={() => trash(item)}><Trash2 size={13} /></button>}
              <div className="card-details">
                <button className="card-title" onClick={() => open(item, null)}>{item.title}</button>
                <div className="card-tags" aria-label="Reference tags">
                  {item.tags.map((tag) => <button key={tag} onClick={() => filterTag(tag)}>{tag}</button>)}
                </div>
                {item.capture && <div className="capture-status">
                  {item.capture.status === "fetching" || item.capture.status === "queued" ? <><LoaderCircle size={11} className={item.capture.status === "fetching" ? "spinner" : ""} />{item.capture.status === "fetching" ? "Importing…" : "Queued"}</> : item.capture.status === "failed" || item.capture.status === "partial" ? <><CircleAlert size={11} />{item.capture.status === "partial" ? "Partly saved · open to retry" : "Import failed · open to retry"}</> : item.media.length ? <><Download size={11} />{item.media.length} {item.media.length === 1 ? "attachment" : "attachments"} saved locally</> : item.embed ? <><Play size={11} />Embedded source</> : "Source link saved"}
                </div>}
                <footer className="card-footer">
                  <span className="card-added-by">Added by <span className="card-owner" title={item.origin}><UserRound size={10} aria-hidden="true" /> You</span></span>
                  <time dateTime={item.createdAt}>{Number.isNaN(Date.parse(item.createdAt)) ? "" : cardDate.format(new Date(item.createdAt))}</time>
                </footer>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
