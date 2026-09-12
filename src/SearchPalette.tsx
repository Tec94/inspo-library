import { useEffect, useRef, useState } from "react";
import { File, FileText, Link2, Search } from "lucide-react";
import { Dialog, Media } from "./components";
import { filterItems, type Item } from "./model";

export interface SearchPaletteProps {
  items: Item[];
  onClose: () => void;
  open: (item: Item) => void;
}
export function SearchPalette({ items, onClose, open }: SearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = filterItems(items, "all", query);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    document.getElementById(`search-result-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <Dialog title="Find a reference" className="search-palette" onClose={onClose}>
      <div className="palette-input">
        <Search size={16} aria-hidden="true" />
        <input ref={input} role="combobox" aria-label="Search all references" aria-expanded="true" aria-controls="reference-results" aria-autocomplete="list" aria-activedescendant={results[active] ? `search-result-${active}` : undefined} placeholder="Search anything…" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((value) => Math.max(0, Math.min(results.length - 1, value + (e.key === "ArrowDown" ? 1 : -1))));
          } else if (e.key === "Enter" && results[active]) { e.preventDefault(); open(results[active]); }
        }} />
        <button className="palette-close" aria-label="Close search" onClick={onClose}><kbd>ESC</kbd></button>
      </div>
      <div className="sr-only" role="status">{results.length} references</div>
      <div id="reference-results" role="listbox" aria-label="Search results" className="palette-results">
        {results.map((item, index) => <button key={item.id} id={`search-result-${index}`} role="option" aria-selected={index === active} tabIndex={-1} className="palette-result" onClick={() => open(item)}>
          <span className="palette-preview" aria-hidden="true">{item.asset ? <Media item={item} /> : item.kind === "link" ? <Link2 size={16} /> : item.kind === "note" || item.kind === "pdf" ? <FileText size={16} /> : <File size={16} />}</span>
          <span className="palette-result-text"><strong>{item.title}</strong><small>{item.url ? new URL(item.url).hostname.replace(/^www\./, "") : item.kind === "note" ? "Local note" : "Local file"}</small></span>
          <span className="palette-result-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</span>
        </button>)}
        {!results.length && <p className="palette-empty">No references match. Try another title, tag, or phrase.</p>}
      </div>
      <p className="sr-only">Use the up and down arrow keys to navigate, Enter to open a reference, and Escape to close search.</p>
    </Dialog>
  );
}
