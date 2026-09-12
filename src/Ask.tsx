import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  BookmarkPlus,
  Plus,
  X,
  ArrowUp,
  Square,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { Button, Dialog, Media } from "./components";
import { buildTargets, askModel } from "./analysis";
import { ProviderSetup } from "./ProviderSetup";
import {
  sourceLabel,
  type Answer,
  type Item,
  type Library,
  type Provider,
  type Selection,
  type Target,
  type Lesson,
} from "./model";

export function AnswerContent({
  answer,
  openSource,
  saveTerm,
  savedTerms,
}: {
  answer: Answer;
  openSource: (label: string) => void;
  saveTerm: (term: string, definition: string) => void;
  savedTerms: string[];
}) {
  return (
    <article className="answer-content">
      <span className="eyebrow">A closer look</span>
      <h1>{answer.title}</h1>
      <section>
        <h2>What’s happening</h2>
        {answer.observations.map((o, index) => (
          <div className="observation" key={`${index}-${o.text}`}>
            <p>{o.text}</p>
            <div className="observation-meta">
              <span className={`basis ${o.basis}`}>
                {o.basis === "observed"
                  ? "Observation"
                  : o.basis === "inferred"
                    ? "Inference"
                    : "Uncertain"}
              </span>
              {o.sources.map((label) => (
                <button
                  key={label}
                  onClick={() => openSource(label)}
                  className="source-citation"
                >
                  Source {label}
                  <ArrowUpRight size={11} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section>
        <h2>Words for what you see</h2>
        <div className="vocabulary-cards">
          {answer.vocabulary.map((v) => (
            <div className="vocabulary-card" key={v.term}>
              <div>
                <h3>{v.term}</h3>
                <p>{v.definition}</p>
              </div>
              <Button
                quiet
                label={
                  savedTerms.includes(v.term)
                    ? `${v.term} saved`
                    : `Save ${v.term}`
                }
                disabled={savedTerms.includes(v.term)}
                onClick={() => saveTerm(v.term, v.definition)}
              >
                {savedTerms.includes(v.term) ? <Check /> : <Plus />}
              </Button>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Why it works</h2>
        <p>{answer.explanation}</p>
      </section>
      <section className="recreation">
        <span className="eyebrow">Make it your own</span>
        <h2>Try recreating the principle</h2>
        <p>{answer.recreation}</p>
      </section>
      {answer.uncertainty && (
        <section className="uncertainty">
          <h2>What we can’t tell from this</h2>
          <p>{answer.uncertainty}</p>
        </section>
      )}
    </article>
  );
}

export function Ask({
  library,
  selections,
  setSelections,
  back,
  open,
  saveProvider,
  saveLesson,
  saveTerm,
}: {
  library: Library;
  selections: Selection[];
  setSelections: (s: Selection[]) => void;
  back: () => void;
  open: (item: Item) => void;
  saveProvider: (provider: Provider) => Promise<void>;
  saveLesson: (lesson: Lesson) => Promise<void>;
  saveTerm: (term: string, definition: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [review, setReview] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [running, setRunning] = useState(false);
  const [answer, setAnswer] = useState<Answer>();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const answerQuestion = useRef("");
  const snapshot = useRef<Target[]>([]);
  useEffect(() => {
    controller.current?.abort();
    setAnswer(undefined);
    setSaved(false);
    setTargets([]);
    setReview(false);
  }, [selections]);
  useEffect(() => () => controller.current?.abort(), []);
  async function prepare() {
    setError("");
    if (!library.provider.model.trim()) {
      setProviderOpen(true);
      return;
    }
    setPreparing(true);
    try {
      const prepared = await buildTargets(library.items, selections);
      setTargets(prepared);
      setReview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreparing(false);
    }
  }
  async function send() {
    setReview(false);
    setRunning(true);
    setError("");
    setAnswer(undefined);
    setSaved(false);
    answerQuestion.current = question;
    snapshot.current = targets;
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await askModel(
        {
          question,
          targets,
          provider: library.provider,
          context: `${library.profile.context}. Tools: ${library.profile.tools}. Interests: ${library.profile.interests.join(", ")}.`,
        },
        abort.signal,
      );
      if (!abort.signal.aborted) setAnswer(response);
    } catch (err) {
      setError(
        abort.signal.aborted
          ? "Analysis cancelled. Your sources are unchanged."
          : err instanceof TypeError
            ? "Could not reach the model. Check that it is running and accepts requests from this app."
            : err instanceof Error
              ? err.message
              : String(err),
      );
    } finally {
      setRunning(false);
      controller.current = null;
    }
  }
  async function keepLesson() {
    if (!answer) return;
    setSaving(true);
    try {
      await saveLesson({
        id: crypto.randomUUID(),
        question: answerQuestion.current,
        answer,
        targets: snapshot.current.map(({ image: _image, ...target }) => target),
        createdAt: new Date().toISOString(),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }
  const activeTargets = answer ? snapshot.current : targets;
  return (
    <div className="ask-page">
      <header className="page-toolbar">
        <Button quiet onClick={back}>
          <ArrowLeft size={16} /> Library
        </Button>
        <span className="toolbar-title">Source workbench</span>
        <Button quiet onClick={() => setProviderOpen(true)}>
          {library.provider.model || "Connect a model"}
          <span
            className={`status-dot ${library.provider.local ? "local" : ""}`}
          />
        </Button>
      </header>
      <div className="ask-layout">
        <aside className="evidence-rail">
          <div className="section-heading">
            <h2>Selected sources</h2>
            <span>{selections.length}</span>
          </div>
          {selections.map((s, index) => {
            const item = library.items.find((i) => i.id === s.itemId);
            if (!item) return null;
            return (
              <div className="evidence-card" key={`${s.itemId}-${index}`}>
                <button className="evidence-preview" onClick={() => open(item)}>
                  <Media item={item} />
                  <span className="source-letter">{sourceLabel(index)}</span>
                </button>
                <div className="evidence-title">
                  <strong>{item.title}</strong>
                  <Button
                    quiet
                    label={`Remove ${item.title} from question`}
                    disabled={running || !!answer}
                    onClick={() =>
                      setSelections(selections.filter((_, n) => n !== index))
                    }
                  >
                    <X />
                  </Button>
                </div>
                <small>
                  {s.crop
                    ? "Selected image region"
                    : s.text
                      ? "Selected text"
                      : s.time !== undefined
                        ? `Frame at ${s.time.toFixed(1)}s`
                        : "Whole source"}
                </small>
              </div>
            );
          })}
          <Button className="add-source" disabled={running} onClick={back}>
            <Plus size={16} /> Add another source
          </Button>
          <p className="muted evidence-help">
            Use Ctrl-click in the library to select references together.
          </p>
        </aside>
        <main className="ask-main" id="main-content">
          <div className="ask-scroll">
            {!answer && !running && (
              <div className="question-intro">
                <span className="eyebrow">
                  From collecting to understanding
                </span>
                <h1>What caught your attention?</h1>
                <p>
                  Follow a detail, compare two approaches, or find the words for
                  what you’re seeing.
                </p>
                <div className="question-starters">
                  {[
                    "Why does this feel so balanced?",
                    "What creates the visual hierarchy?",
                    "Compare how these sources use space.",
                    "How could I recreate this principle?",
                  ].map((q) => (
                    <button key={q} onClick={() => setQuestion(q)}>
                      {q}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {running && (
              <div className="analysis-progress" role="status">
                <div className="thinking-mark">
                  <span />
                  <span />
                  <span />
                </div>
                <h2>Looking at your selected evidence</h2>
                <p>
                  {library.provider.local
                    ? "Your local model is working on this."
                    : `Waiting for ${library.provider.model}.`}
                </p>
                <Button onClick={() => controller.current?.abort()}>
                  <Square size={12} /> Cancel
                </Button>
              </div>
            )}
            {answer && (
              <>
                <div className="answer-actions">
                  <span className="muted">{answerQuestion.current}</span>
                  <Button
                    disabled={saved || saving}
                    onClick={() => void keepLesson()}
                  >
                    {saved ? <Check size={15} /> : <BookmarkPlus size={15} />}
                    {saved
                      ? "Lesson saved"
                      : saving
                        ? "Saving…"
                        : "Save lesson"}
                  </Button>
                </div>
                <AnswerContent
                  answer={answer}
                  savedTerms={library.terms.map((t) => t.term)}
                  saveTerm={saveTerm}
                  openSource={(label) => {
                    const target = activeTargets.find((t) => t.label === label);
                    const item = library.items.find(
                      (i) => i.id === target?.itemId,
                    );
                    if (item) open(item);
                  }}
                />
              </>
            )}
            {error && (
              <div className="request-error" role="alert">
                <p>{error}</p>
                <Button
                  onClick={() => void prepare()}
                  disabled={!selections.length || !question.trim()}
                >
                  <RefreshCw size={14} /> Review and retry
                </Button>
              </div>
            )}
          </div>
          <form
            className="question-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void prepare();
            }}
          >
            <label htmlFor="question">Your question</label>
            <div>
              <textarea
                id="question"
                rows={2}
                value={question}
                disabled={running}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about the references beside you…"
                required
              />
              <Button
                label="Review evidence"
                primary
                type="submit"
                disabled={
                  running || preparing || !selections.length || !question.trim()
                }
              >
                <ArrowUp />
              </Button>
            </div>
            <p>
              <ShieldCheck size={13} /> Only reviewed evidence is sent.{" "}
              {preparing
                ? "Preparing your selection…"
                : "You choose what the model sees."}
            </p>
          </form>
        </main>
      </div>
      {providerOpen && (
        <ProviderSetup
          provider={library.provider}
          save={saveProvider}
          onClose={() => setProviderOpen(false)}
        />
      )}
      {review && (
        <Dialog
          title="Review what the model will see"
          description="These are the exact images and text included with your question."
          className="review-dialog"
          onClose={() => setReview(false)}
        >
          <div className="review-destination">
            <span className="status-dot local" />
            <div>
              <strong>{library.provider.model}</strong>
              <p>
                {library.provider.local ? "On this device" : "Cloud provider"} ·{" "}
                {new URL(library.provider.endpoint).host}
              </p>
            </div>
            <Button
              quiet
              onClick={() => {
                setReview(false);
                setProviderOpen(true);
              }}
            >
              Change
            </Button>
          </div>
          <p className="review-question">{question}</p>
          <div className="review-targets">
            {targets.map((t) => (
              <article key={t.label}>
                <div className="section-heading">
                  <h3>
                    Source {t.label} · {t.title}
                  </h3>
                  <span>{t.selection}</span>
                </div>
                {t.image && (
                  <img
                    src={t.image}
                    alt={`Evidence ${t.label}: ${t.selection}`}
                  />
                )}
                {t.text && <blockquote>{t.text}</blockquote>}
              </article>
            ))}
          </div>
          <div className="notice">
            <ShieldCheck size={16} />
            <p>
              {library.provider.local
                ? "This request goes to a model running on your device."
                : "The selected evidence will leave this device and be sent to your provider."}{" "}
              Your practice, tools, and interests are also included. The rest of
              your library stays here.
            </p>
          </div>
          {targets.some((t) => t.image) && !library.provider.vision && (
            <p className="error" role="alert">
              Choose an image-capable model before sending these sources.
            </p>
          )}
          <div className="form-actions">
            <Button onClick={() => setReview(false)}>Back to question</Button>
            <Button
              primary
              disabled={
                targets.some((t) => t.image) && !library.provider.vision
              }
              onClick={() => void send()}
            >
              Send selected evidence
              <ArrowUpRight size={14} />
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
