import { useCallback, useEffect, useRef, useState } from "react";
import {
  Images,
  Inbox,
  Heart,
  Folder,
  Plus,
  BookOpen,
  Bookmark,
  Settings as SettingsIcon,
  Archive,
  Trash2,
  Search,
  X,
  SlidersHorizontal,
  PanelLeft,
  ChevronDown,
  Check,
  ArrowUpRight,
  FolderPlus,
  Monitor,
  Hash,
  PanelLeftClose,
  ListFilter,
  LoaderCircle,
} from "lucide-react";
import { Button, Dialog, Empty } from "./components";
import { Gallery } from "./Gallery";
import { SearchPalette } from "./SearchPalette";
import { SourceView } from "./SourceView";
import { Capture } from "./Capture";
import { Onboarding } from "./Onboarding";
import { Ask } from "./Ask";
import { Learning } from "./Learning";
import { Settings } from "./Settings";
import { desktop, loadLibrary, restoreLibrary, saveLibrary } from "./storage";
import {
  filterItems,
  countTags,
  type Destination,
  type Item,
  type Library,
  type Selection,
} from "./model";
import { sampleItems } from "./samples";
import { queueImport, reviewItem } from "./importing";
import { useImportQueue, prepareLibraryImports, retryItem, approveItem, mergeReferenceEdits } from "./useImportQueue";
import { ReviewQueue } from "./ReviewQueue";
import "./import-workflow.css";

export default function App() {
  const [library, setLibrary] = useState<Library>();
  const current = useRef<Library | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  const cancelImports = useRef<() => void>(() => {});
  const [fatal, setFatal] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [destination, setDestination] = useState<Destination>("all");
  const [tag, setTag] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [filters, setFilters] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [focus, setFocus] = useState<{ id: string; rect: DOMRect | null }>();
  const [capture, setCapture] = useState(false);
  const [collectionDialog, setCollectionDialog] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const narrow = matchMedia("(max-width: 700px)");
    const close = () => setSidebarOpen(false);
    narrow.addEventListener("change", close);
    return () => narrow.removeEventListener("change", close);
  }, []);
  useEffect(() => {
    if (!sidebarOpen) return;
    const controls = () => Array.from(
      document.querySelectorAll<HTMLElement>(".sidebar button, .sidebar input, .sidebar summary"),
    ).filter((element) => element.getClientRects().length && !element.matches(":disabled"));
    controls()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const visible = controls();
      const first = visible[0];
      const last = visible[visible.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      window.removeEventListener("keydown", trap);
      document
        .querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')
        ?.focus();
    };
  }, [sidebarOpen]);
  const report = useCallback((message: string) => setToast(message), []);
  const replace = useCallback((value: Library) => {
    current.current = value;
    setLibrary(value);
    setFatal("");
  }, []);
  const reload = useCallback(() => {
    cancelImports.current();
    void loadLibrary()
      .then((value) => replace(prepareLibraryImports(value)))
      .catch((err) =>
        setFatal(err instanceof Error ? err.message : String(err)),
      );
  }, [replace]);
  const restoreBackup = useCallback(
    (file: File) => {
      cancelImports.current();
      const next = queue.current
        .catch(() => {})
        .then(async () => {
          setSaving(true);
          try {
            replace(prepareLibraryImports(await restoreLibrary(file)));
            setSelections([]);
            setQuestionOpen(false);
            setSelected([]);
          } finally {
            setSaving(false);
          }
        });
      queue.current = next;
      return next;
    },
    [replace],
  );
  useEffect(reload, [reload]);
  const mutate = useCallback(
    (fn: (l: Library) => Library): Promise<void> => {
      const next = queue.current
        .catch(() => {})
        .then(async () => {
          if (!current.current)
            throw new Error("The library has not opened yet.");
          setSaving(true);
          try {
            const value = fn(current.current);
            await saveLibrary(value);
            replace(value);
          } finally {
            setSaving(false);
          }
        });
      queue.current = next;
      return next;
    },
    [replace],
  );
  const imports = useImportQueue(library, mutate);
  cancelImports.current = imports.cancel;
  async function retryImports() {
    imports.cancel();
    await mutate((l) => ({ ...l, items: l.items.map((item) => item.url && (!item.capture || ["failed", "partial", "disabled", "fetching"].includes(item.capture.status) || (!item.asset && !item.embed)) ? retryItem(item, l) : item) }));
    imports.resume();
  }
  async function recheckImports() {
    imports.cancel();
    await mutate((l) => ({ ...l, items: l.items.map((item) => {
      if (!item.url || item.state !== "active") return item;
      const reviewed = reviewItem(item, l.importSettings);
      if (reviewed.review?.status === "pending") return reviewed;
      return item.review?.status === "pending" || item.capture?.status === "fetching" || !item.capture ? retryItem(reviewed, l) : reviewed;
    }) }));
    imports.resume();
  }
  async function keep(item: Item) {
    await mutate((l) => ({ ...l, items: l.items.map((entry) => entry.id === item.id ? approveItem(entry, l) : entry) }));
    report("Reference kept in your library.");
  }
  useEffect(() => {
    const dark = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        library?.profile.theme === "system"
          ? dark.matches
            ? "dark"
            : "light"
          : library?.profile.theme || "light";
      document.documentElement.dataset.reduceMotion = String(
        library?.profile.reduceMotion || false,
      );
    };
    apply();
    dark.addEventListener("change", apply);
    return () => dark.removeEventListener("change", apply);
  }, [library?.profile.theme, library?.profile.reduceMotion]);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      document.documentElement.dataset.input = "keyboard";
      if (document.querySelector("dialog[open]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setCapture(true);
      }
      if (e.key === "Escape") {
        setSelected([]);
        setSidebarOpen(false);
      }
    };
    const pointer = () => {
      document.documentElement.dataset.input = "pointer";
    };
    window.addEventListener("keydown", keyboard);
    window.addEventListener("pointerdown", pointer);
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("pointerdown", pointer);
    };
  }, []);
  function go(dest: Destination) {
    setDestination(dest);
    setQuestionOpen(false);
    setQuery("");
    setTag("");
    setSelected([]);
    setSidebarOpen(false);
  }
  function update(item: Item) {
    const before = library?.items.find((entry) => entry.id === item.id);
    return mutate((l) => ({
      ...l,
      items: l.items.map((live) => {
        if (live.id !== item.id) return live;
        return mergeReferenceEdits(live, before, item);
      }),
    }));
  }
  async function add(items: Item[]) {
    await mutate((l) => ({
      ...l,
      items: [
        ...items.map((i, n) => ({
          ...queueImport(i, l.importSettings),
          x: (n % 4) * 285,
          y: Math.floor(n / 4) * 360,
        })),
        ...l.items,
      ],
    }));
  }
  function select(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((v) => v !== id) : [...s, id],
    );
  }
  function ask(selection?: Selection, append = false) {
    setFocus(undefined);
    if (selection)
      setSelections((s) =>
        append
          ? [...s.filter((v) => v.itemId !== selection.itemId), selection]
          : [selection],
      );
    else setSelections(selected.map((itemId) => ({ itemId })));
    setQuestionOpen(true);
    setSidebarOpen(false);
  }
  function bulk(fn: (i: Item) => Item) {
    void mutate((l) => ({
      ...l,
      items: l.items.map((i) => (selected.includes(i.id) ? fn(i) : i)),
    }))
      .then(() => {
        setSelected([]);
        report("References updated.");
      })
      .catch((err) => report(String(err)));
  }
  if (fatal)
    return (
      <div className="recovery-screen">
        <div className="recovery-card">
          <Archive size={30} />
          <span className="eyebrow">Your library needs attention</span>
          <h1>Let’s get your references back.</h1>
          <p role="alert">{fatal}</p>
          <p className="muted">
            Your existing files have not been removed. Try reopening the
            library, or restore a compatible backup.
          </p>
          <div className="inline-actions">
            <Button primary onClick={reload}>
              Try opening again
            </Button>
            <label className="button file-button">
              Restore backup
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void restoreLibrary(file)
                      .then(replace)
                      .catch((err) => setFatal(String(err)));
                }}
              />
            </label>
          </div>
        </div>
      </div>
    );
  if (!library)
    return (
      <div className="loading-library" role="status">
        <Images size={30} />
        <span>Opening your library…</span>
      </div>
    );
  const items = filterItems(library.items, destination, query, kind, tag);
  const tags = countTags(filterItems(library.items, destination, query, kind));
  function chooseTag(value: string) {
    if (["settings", "lessons", "vocabulary"].includes(destination)) setDestination("all");
    setTag(value);
    setSelected([]);
    setQuestionOpen(false);
    setSidebarOpen(false);
  }
  const focused = library.items.find((i) => i.id === focus?.id);
  const collection = destination.startsWith("collection:")
    ? destination.slice(11)
    : "";
  const title =
    collection ||
    new Map<Destination, string>([
      ["all", "All references"],
      ["inbox", "Inbox"],
      ["review", "Review queue"],
      ["favorites", "Favorites"],
      ["archive", "Archive"],
      ["trash", "Trash"],
      ["lessons", "Saved lessons"],
      ["vocabulary", "Vocabulary"],
      ["settings", "Settings"],
    ]).get(destination) ||
    "Library";
  const galleryPage = !["settings", "lessons", "vocabulary"].includes(
    destination,
  );
  const activeCount = (dest: Destination) =>
    filterItems(library.items, dest, "").length;
  const nav = (
    dest: Destination,
    label: string,
    Icon: typeof Images,
    count?: number,
  ) => (
    <button
      className={`nav-item ${destination === dest && !questionOpen && !tag ? "active" : ""}`}
      aria-current={destination === dest && !questionOpen && !tag ? "page" : undefined}
      onClick={() => go(dest)}
    >
      <Icon size={16} />
      <span>{label}</span>
      {count !== undefined && <small>{count}</small>}
    </button>
  );
  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Library navigation">
        <div className="workspace-heading">
          <span className="app-mark" aria-hidden="true" />
          <strong>{library.profile.name}</strong>
          <Button quiet label="Collapse sidebar" className="desktop-only" onClick={() => setSidebarCollapsed(true)}><PanelLeftClose /></Button>
          <Button
            quiet
            label="Close navigation"
            className="mobile-only"
            onClick={() => setSidebarOpen(false)}
          >
            <X />
          </Button>
        </div>
        <button
          className="sidebar-search"
          onClick={() => {
            setSearchOpen(true);
            setSidebarOpen(false);
          }}
        >
          <Search size={14} />
          <span>Search</span>
          <kbd>⌃ K</kbd>
        </button>
        <nav>
          <div className="nav-section">
            {nav("all", "All", Images, activeCount("all"))}
            {nav("inbox", "Inbox", Inbox, activeCount("inbox"))}
            {nav("review", "Review queue", ListFilter, activeCount("review"))}
            {nav("favorites", "Favorites", Heart, activeCount("favorites"))}
          </div>
          <section className="nav-section tag-navigation" aria-label="Filter by tag">
            <div className="nav-heading"><span>Categories</span>{tag && <button onClick={() => chooseTag("")}>Clear</button>}</div>
            <input aria-label="Find a tag" placeholder="Find a tag…" value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} />
            <div className="tag-list">
              {tags.filter(([name]) => name.toLocaleLowerCase().includes(tagQuery.toLocaleLowerCase())).map(([name, count]) => (
                <button key={name} className={`nav-item ${tag === name ? "active" : ""}`} aria-pressed={tag === name} onClick={() => chooseTag(tag === name ? "" : name)}>
                  <Hash size={14} /><span>{name}</span><small>{count}</small>
                </button>
              ))}
              {!tags.some(([name]) => name.toLocaleLowerCase().includes(tagQuery.toLocaleLowerCase())) && <p className="muted small">No matching tags.</p>}
            </div>
          </section>
          <details className="nav-section nav-disclosure" open={collection ? true : undefined}>
            <summary>Collections <ChevronDown size={12} /></summary>
            {library.collections.map((c) => <div key={c}>{nav(`collection:${c}`, c, Folder, activeCount(`collection:${c}`))}</div>)}
            <button className="nav-item new-collection" onClick={() => setCollectionDialog(true)}><Plus size={14} /><span>New collection</span></button>
          </details>
          <details className="nav-section nav-disclosure" open={destination === "lessons" || destination === "vocabulary" ? true : undefined}>
            <summary>Learning <ChevronDown size={12} /></summary>
            {nav("lessons", "Saved lessons", Bookmark, library.lessons.length)}
            {nav("vocabulary", "Vocabulary", BookOpen, library.terms.length)}
          </details>
        </nav>
        <div className="sidebar-footer">
          <Button primary className="sidebar-add" onClick={() => { setCapture(true); setSidebarOpen(false); }}><Plus size={14} />Add reference</Button>
          <div className="sidebar-utilities">
            <Button quiet label="Archive" aria-pressed={destination === "archive"} onClick={() => go("archive")}><Archive /></Button>
            <Button quiet label="Trash" aria-pressed={destination === "trash"} onClick={() => go("trash")}><Trash2 /></Button>
            <Button quiet label="Display options" aria-pressed={filters} onClick={() => { setFilters(!filters); setSidebarOpen(false); }}><SlidersHorizontal /></Button>
            <Button quiet label="Settings" aria-pressed={destination === "settings"} onClick={() => go("settings")}><SettingsIcon /></Button>
          </div>
          <div className="storage-status">
            <span className="status-dot local" />
            <span>
              {saving
                ? "Saving…"
                : desktop
                  ? "Saved on this device"
                  : "Saved in this browser"}
            </span>
            {!desktop && <Monitor size={12} />}
          </div>
          {imports.busy && <div className="import-progress" role="status"><LoaderCircle size={12} className="spinner" /><span>Importing {imports.busy}</span></div>}
          {imports.problem && <div className="import-problem" role="alert"><span>Import paused: {imports.problem}</span><Button quiet onClick={() => { void retryImports().catch((error) => report(String(error))); }}>Retry imports</Button></div>}
        </div>
      </aside>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="app-main" inert={sidebarOpen}>
        {sidebarCollapsed && <Button quiet label="Expand sidebar" className="expand-sidebar desktop-only" onClick={() => setSidebarCollapsed(false)}><PanelLeft /></Button>}
        <header className={`topbar ${galleryPage && !questionOpen ? "library-topbar" : ""}`}>
          <div className="topbar-title">
            <Button
              quiet
              label="Open navigation"
              className="mobile-only"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeft />
            </Button>
            <h1>{questionOpen ? "Ask about a source" : title}</h1>
            {galleryPage && !questionOpen && <span>{items.length}</span>}
          </div>
          <div className="topbar-actions">
            <div className="search-field">
              <Search size={14} />
              <input
                ref={search}
                aria-label="Search library"
                placeholder="Search your library"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (questionOpen) setQuestionOpen(false);
                }}
              />
              {query && (
                <Button label="Clear search" quiet onClick={() => setQuery("")}>
                  <X />
                </Button>
              )}
            </div>
            {galleryPage && !questionOpen && (
              <Button
                quiet
                label="Display options"
                aria-expanded={filters}
                onClick={() => setFilters(!filters)}
              >
                <SlidersHorizontal />
              </Button>
            )}
            <Button
              primary
              aria-label="Add reference"
              onClick={() => setCapture(true)}
            >
              <Plus size={15} />
              <span>Add reference</span>
            </Button>
          </div>
        </header>
        {(selections.length > 0 || questionOpen) && (
          <div className={questionOpen ? "ask-container" : "hidden"}>
            <Ask
              library={library}
              selections={selections}
              setSelections={setSelections}
              back={() => {
                setQuestionOpen(false);
                setSelected(selections.map((s) => s.itemId));
              }}
              open={(item) => setFocus({ id: item.id, rect: null })}
              saveProvider={(provider) => mutate((l) => ({ ...l, provider }))}
              saveLesson={(lesson) =>
                mutate((l) => ({ ...l, lessons: [lesson, ...l.lessons] }))
              }
              saveTerm={(term, definition) => {
                void mutate((l) => ({
                  ...l,
                  terms: l.terms.some((t) => t.term === term)
                    ? l.terms
                    : [...l.terms, { term, definition }],
                }))
                  .then(() => report("Term saved."))
                  .catch((err) => report(String(err)));
              }}
            />
          </div>
        )}
        {questionOpen ? null : destination === "settings" ? (
          <Settings
            library={library}
            mutate={mutate}
            restoreBackup={restoreBackup}
            report={report}
            retryImports={retryImports}
            recheckImports={recheckImports}
          />
        ) : destination === "lessons" || destination === "vocabulary" ? (
          <Learning
            library={library}
            vocabulary={destination === "vocabulary"}
            query={query}
            open={(item) => setFocus({ id: item.id, rect: null })}
            mutate={mutate}
            report={report}
            goLibrary={() => go("all")}
          />
        ) : (
          <main id="main-content" className="library-main">
            <h1 className="sr-only">{title}</h1>
            {filters && (
              <div className="display-options">
                <label>
                  Show
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="all">All source types</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                    <option value="pdf">PDFs</option>
                    <option value="note">Notes</option>
                    <option value="link">Links</option>
                    <option value="file">Other files</option>
                  </select>
                </label>
                <Button
                  quiet
                  label="Close display options"
                  onClick={() => setFilters(false)}
                >
                  <X />
                </Button>
              </div>
            )}
            {selected.length > 0 && (
              <div className="selection-bar">
                <span>{selected.length} selected</span>
                {destination === "review" && <Button quiet onClick={() => bulk((item) => approveItem(item, library))}><Check size={14} />Keep selected</Button>}
                <Button quiet onClick={() => ask()}>
                  <BookOpen size={14} />
                  Ask together
                </Button>
                <Button quiet onClick={() => setCollecting(true)}>
                  <FolderPlus size={14} />
                  Collect
                </Button>
                <Button
                  quiet
                  label="Favorite selected references"
                  onClick={() => bulk((i) => ({ ...i, favorite: true }))}
                >
                  <Heart />
                </Button>
                {destination === "trash" ? (
                  <Button
                    quiet
                    onClick={() => bulk((i) => ({ ...i, state: "active" }))}
                  >
                    Restore
                  </Button>
                ) : (
                  <>
                    <Button
                      quiet
                      label="Archive selected references"
                      onClick={() => bulk((i) => ({ ...i, state: "archived" }))}
                    >
                      <Archive />
                    </Button>
                    <Button
                      quiet
                      label="Move selected references to trash"
                      onClick={() => bulk((i) => ({ ...i, state: "trashed" }))}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
                <Button
                  label="Clear selection"
                  quiet
                  onClick={() => setSelected([])}
                >
                  <X />
                </Button>
              </div>
            )}
            {tag && <div className="active-tag"><span>Filtered by</span><button onClick={() => chooseTag("")}>#{tag}<X size={13} /><span className="sr-only">Remove tag filter</span></button></div>}
            {query && (
              <div className="search-summary">
                {items.length} {items.length === 1 ? "reference" : "references"}{" "}
                for “{query}”
              </div>
            )}
            {destination === "review" ? (
              <ReviewQueue items={items} open={(item) => setFocus({ id: item.id, rect: null })} keep={keep} trash={(item) => update({ ...item, state: "trashed" })} settings={() => go("settings")} report={report} />
            ) : items.length ? (
              <Gallery
                items={items}
                selected={selected}
                select={select}
                open={(item, rect) => setFocus({ id: item.id, rect })}
                filterTag={chooseTag}
                reduceMotion={library.profile.reduceMotion}
                trash={destination === "trash" ? undefined : (item) => {
                  void update({ ...item, state: "trashed" })
                    .then(() => {
                      setSelected((ids) => ids.filter((id) => id !== item.id));
                      report("Reference moved to Trash. You can restore it there.");
                    })
                    .catch((error) => report(String(error)));
                }}
              />
            ) : (
              <Empty
                title={
                  query || tag || kind !== "all"
                    ? "Nothing here matches yet"
                    : destination === "trash"
                      ? "Nothing in the trash"
                      : destination === "archive"
                        ? "A place for finished threads"
                        : destination === "favorites"
                          ? "Keep your favorites close"
                          : "A little space for your next idea"
                }
                action={
                  query || tag || kind !== "all" ? (
                    <Button
                      onClick={() => {
                        setQuery("");
                        setKind("all");
                        setTag("");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    !["trash", "archive", "favorites"].includes(
                      destination,
                    ) && (
                      <div className="inline-actions">
                        <Button primary onClick={() => setCapture(true)}>
                          <Plus size={14} />
                          Add a reference
                        </Button>
                        {!library.items.length && (
                          <Button
                            onClick={() => {
                              void add(sampleItems()).catch((err) =>
                                report(String(err)),
                              );
                            }}
                          >
                            Explore samples
                            <ArrowUpRight size={14} />
                          </Button>
                        )}
                      </div>
                    )
                  )
                }
              >
                {query || tag || kind !== "all"
                  ? "Try a different title, tag, or note."
                  : destination === "trash"
                    ? "References you remove stay here until you restore them."
                    : destination === "archive"
                      ? "Archive a reference to keep it without showing it in your active library."
                      : destination === "favorites"
                        ? "Open a reference and use the heart to save it here."
                        : "An image, a link, a thought. Start with something worth coming back to."}
              </Empty>
            )}
          </main>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <Button quiet label="Dismiss message" onClick={() => setToast("")}>
            <X />
          </Button>
        </div>
      )}
      {!library.profile.completed && (
        <Onboarding
          profile={library.profile}
          save={(profile) => mutate((l) => ({ ...l, profile }))}
          finish={async (sample, profile) => {
            await mutate((l) => ({
              ...l,
              profile,
              items: sample && !l.items.length ? sampleItems() : l.items,
            }));
            if (!sample && !library.items.length) setCapture(true);
          }}
        />
      )}
      {searchOpen && <SearchPalette items={library.items} onClose={() => setSearchOpen(false)} open={(item) => { setSearchOpen(false); setFocus({ id: item.id, rect: null }); }} />}
      {capture && (
        <Capture
          existingUrls={library.items.map((item) => item.url)}
          collections={library.collections}
          initialCollection={collection}
          add={add}
          onClose={() => setCapture(false)}
        />
      )}
      {focus && focused && (
        <SourceView
          item={focused}
          rect={focus.rect}
          collections={library.collections}
          update={update}
          onClose={() => setFocus(undefined)}
          ask={(s) => ask(s)}
          addToQuestion={(s) => ask(s, true)}
          navigate={(direction) => {
            const list = items.length ? items : library.items;
            const index = list.findIndex((i) => i.id === focused.id);
            const item = list[(index + direction + list.length) % list.length];
            if (item) setFocus({ id: item.id, rect: null });
          }}
          reduceMotion={library.profile.reduceMotion}
          report={report}
          allowEmbeds={library.importSettings.allowEmbeds}
          keep={() => keep(focused)}
          retry={async () => {
            await mutate((l) => ({ ...l, items: l.items.map((item) => item.id === focused.id ? retryItem(item, l) : item) }));
            imports.resume();
          }}
        />
      )}
      {collectionDialog && (
        <Dialog
          title="New collection"
          description="Give a thread of references a place to grow."
          onClose={() => setCollectionDialog(false)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const name = collectionName.trim();
              if (!name) return;
              if (
                library.collections.some(
                  (c) => c.toLowerCase() === name.toLowerCase(),
                )
              ) {
                setCollectionError(
                  "A collection with this name already exists.",
                );
                return;
              }
              void mutate((l) => ({
                ...l,
                collections: [...l.collections, name],
              }))
                .then(() => {
                  setCollectionDialog(false);
                  setCollectionName("");
                  setCollectionError("");
                  go(`collection:${name}`);
                })
                .catch((err) => setCollectionError(String(err)));
            }}
          >
            <label>
              Collection name
              <input
                required
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="A direction you want to explore"
              />
            </label>
            {collectionError && (
              <p className="error" role="alert">
                {collectionError}
              </p>
            )}
            <div className="form-actions">
              <Button onClick={() => setCollectionDialog(false)}>Cancel</Button>
              <Button primary type="submit">
                Create collection
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {collecting && (
        <Dialog
          title="Add to a collection"
          onClose={() => setCollecting(false)}
        >
          <div className="collection-choices">
            {library.collections.map((c) => (
              <Button
                key={c}
                onClick={() => {
                  bulk((i) => ({
                    ...i,
                    collections: [...new Set([...i.collections, c])],
                  }));
                  setCollecting(false);
                }}
              >
                <Folder size={16} />
                {c}
                <ChevronDown size={14} />
              </Button>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}
