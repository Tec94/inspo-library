import { Check, ArrowUpRight, ListFilter, Trash2 } from "lucide-react";
import { Button, Empty } from "./components";
import type { Item } from "./model";

interface ReviewQueueProps {
  items: Item[];
  open: (item: Item) => void;
  keep: (item: Item) => Promise<void>;
  trash: (item: Item) => Promise<void>;
  settings: () => void;
  report: (message: string) => void;
}
export function ReviewQueue({ items, open, keep, trash, settings, report }: ReviewQueueProps) {
  return <section className="review-queue" aria-label="Posts awaiting review">
    <header className="review-heading">
      <div><span className="eyebrow"><ListFilter size={14} /> Import review</span><h2>A second look.</h2><p>These posts matched your filters. Keep one to continue importing, or move it to Trash.</p></div>
      <Button onClick={settings}>Edit import rules</Button>
    </header>
    {items.length ? <div className="review-list">{items.map((item) => <article key={item.id} className="review-post">
      <div className="review-post-content">
        <button className="review-post-title" onClick={() => open(item)}>{item.title}<ArrowUpRight size={14} /></button>
        <p className="review-excerpt">{item.capture?.remoteText || item.body || item.url}</p>
        <ul className="review-reasons">{(item.review?.reasons.length ? item.review.reasons : ["Marked for review during an earlier import"]).map((reason) => <li key={reason}>{reason}</li>)}</ul>
        {item.url && <span className="muted small">{new URL(item.url).hostname}{item.capture?.author ? ` · ${item.capture.author}` : ""}</span>}
      </div>
      <div className="review-actions"><Button primary onClick={() => { void keep(item).catch((error) => report(String(error))); }}><Check size={14} />Keep</Button><Button onClick={() => { void trash(item).then(() => report("Moved to Trash. You can restore it there.")).catch((error) => report(String(error))); }}><Trash2 size={14} />Trash</Button></div>
    </article>)}</div> : <Empty title="Your review queue is clear">Posts that match your import rules will wait here. Your library keeps the references you choose.</Empty>}
  </section>;
}
