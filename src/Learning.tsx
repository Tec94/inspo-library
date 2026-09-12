import { useState } from "react";
import { ArrowUpRight, BookOpen, Plus, ArrowLeft, Trash2 } from "lucide-react";
import { Button, Dialog, Empty, Media } from "./components";
import { AnswerContent } from "./Ask";
import type { Library, Item, Lesson } from "./model";

export function Learning({
  library,
  vocabulary,
  query,
  open,
  mutate,
  report,
  goLibrary,
}: {
  library: Library;
  vocabulary: boolean;
  query: string;
  open: (item: Item) => void;
  mutate: (fn: (l: Library) => Library) => Promise<void>;
  report: (s: string) => void;
  goLibrary: () => void;
}) {
  const [lesson, setLesson] = useState<Lesson>();
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [error, setError] = useState("");
  const lessons = library.lessons.filter((l) =>
    `${l.question} ${l.answer.title} ${l.answer.explanation}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const terms = library.terms.filter((t) =>
    `${t.term} ${t.definition}`.toLowerCase().includes(query.toLowerCase()),
  );
  const saveTerm = (value: string, meaning: string) => {
    void mutate((l) => ({
      ...l,
      terms: l.terms.some((t) => t.term.toLowerCase() === value.toLowerCase())
        ? l.terms
        : [...l.terms, { term: value, definition: meaning }],
    }))
      .then(() => report("Term saved to your vocabulary."))
      .catch((err) => setError(String(err)));
  };
  if (lesson)
    return (
      <main className="content-page lesson-detail" id="main-content">
        <div className="lesson-back">
          <Button quiet onClick={() => setLesson(undefined)}>
            <ArrowLeft size={15} /> Saved lessons
          </Button>
          <span className="muted">
            {new Date(lesson.createdAt).toLocaleDateString()}
          </span>
        </div>
        <p className="lesson-question">{lesson.question}</p>
        <div className="lesson-evidence">
          {lesson.targets.map((t) => {
            const item = library.items.find((i) => i.id === t.itemId);
            return item ? (
              <button key={t.label} onClick={() => open(item)}>
                <Media item={item} />
                <span>
                  Source {t.label} · {t.title}
                </span>
                <ArrowUpRight size={14} />
              </button>
            ) : (
              <p key={t.label}>
                Source {t.label} · {t.title} · Reference unavailable
              </p>
            );
          })}
        </div>
        <AnswerContent
          answer={lesson.answer}
          openSource={(label) => {
            const item = library.items.find(
              (i) =>
                i.id === lesson.targets.find((t) => t.label === label)?.itemId,
            );
            if (item) open(item);
          }}
          savedTerms={library.terms.map((t) => t.term)}
          saveTerm={saveTerm}
        />
      </main>
    );
  return (
    <main className="content-page learning-page" id="main-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Keep the idea, not just the image</span>
          <h1>{vocabulary ? "Your vocabulary" : "Saved lessons"}</h1>
          <p>
            {vocabulary
              ? "A growing language for the things you notice."
              : "Small discoveries you can bring to your next project."}
          </p>
        </div>
        {vocabulary && (
          <Button onClick={() => setAdding(true)}>
            <Plus size={15} />
            Add a term
          </Button>
        )}
      </div>
      {vocabulary ? (
        terms.length ? (
          <div className="term-grid">
            {terms.map((t) => (
              <article className="term-card" key={t.term}>
                <BookOpen size={18} />
                <h2>{t.term}</h2>
                <p>{t.definition}</p>
                <Button
                  quiet
                  label={`Remove ${t.term}`}
                  onClick={() => {
                    void mutate((l) => ({
                      ...l,
                      terms: l.terms.filter((v) => v.term !== t.term),
                    })).catch((err) => setError(String(err)));
                  }}
                >
                  <Trash2 />
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={
              query ? "No matching terms" : "Find the words for what you see"
            }
            action={
              !query && (
                <Button onClick={() => setAdding(true)}>
                  Add your first term
                </Button>
              )
            }
          >
            {query
              ? "Try another word or clear your search."
              : "Save vocabulary from a lesson, or add a term you want to remember."}
          </Empty>
        )
      ) : lessons.length ? (
        <div className="lesson-grid">
          {lessons.map((l) => {
            const item = library.items.find(
              (i) => i.id === l.targets[0]?.itemId,
            );
            return (
              <button
                className="lesson-card"
                key={l.id}
                onClick={() => setLesson(l)}
              >
                <div className="lesson-cover">
                  {item && <Media item={item} />}
                  <span className="lesson-count">
                    {l.targets.length}{" "}
                    {l.targets.length === 1 ? "source" : "sources"}
                  </span>
                </div>
                <div className="lesson-card-copy">
                  <span className="eyebrow">
                    {new Date(l.createdAt).toLocaleDateString()}
                  </span>
                  <h2>{l.answer.title}</h2>
                  <p>{l.question}</p>
                  <span className="read-lesson">
                    Revisit lesson
                    <ArrowUpRight size={15} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            query
              ? "No matching lessons"
              : "Your next discovery starts with a source"
          }
          action={
            !query && (
              <Button onClick={goLibrary}>
                Explore your library
                <ArrowUpRight size={14} />
              </Button>
            )
          }
        >
          {query
            ? "Try another word or clear your search."
            : "Ask a question about something you’ve saved, then keep the answer as a lesson."}
        </Empty>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {adding && (
        <Dialog title="Add a term" onClose={() => setAdding(false)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              saveTerm(term.trim(), definition.trim());
              setAdding(false);
              setTerm("");
              setDefinition("");
            }}
          >
            <label>
              Term
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                required
              />
            </label>
            <label>
              What it means
              <textarea
                rows={4}
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
                required
              />
            </label>
            <div className="form-actions">
              <Button onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="submit" primary>
                Save term
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </main>
  );
}
