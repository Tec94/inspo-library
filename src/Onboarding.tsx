import { useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import { Button, Dialog } from "./components";
import type { Profile } from "./model";

export function Onboarding({
  profile,
  save,
  finish,
}: {
  profile: Profile;
  save: (profile: Profile) => Promise<void>;
  finish: (sample: boolean, profile: Profile) => Promise<void>;
}) {
  const [draft, setDraft] = useState(profile);
  const [step, setStep] = useState(profile.step);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function next(sample?: boolean) {
    setBusy(true);
    setError("");
    try {
      if (sample !== undefined)
        await finish(sample, { ...draft, completed: true, step: 2 });
      else {
        const p = { ...draft, step: step + 1 };
        await save(p);
        setDraft(p);
        setStep(p.step);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  const interests = [
    "Interaction & motion",
    "Type & editorial",
    "Objects & spaces",
    "Color & composition",
    "Interfaces",
    "Architecture",
  ];
  return (
    <Dialog
      title="Make room for your references"
      className="onboarding-dialog"
      onClose={() => {
        if (!busy) void next(false);
      }}
    >
      <div className="onboarding-art" aria-hidden="true">
        <img src="/demo/A5Pce5.png" alt="" />
        <img src="/demo/type.svg" alt="" />
        <img src="/demo/VNEeQ.png" alt="" />
      </div>
      <div className="onboarding-copy">
        <div
          className="step-indicator"
          aria-label={`Setup step ${step + 1} of 3`}
        >
          {[0, 1, 2].map((n) => (
            <span key={n} className={step >= n ? "active" : ""} />
          ))}
        </div>
        <span className="eyebrow">Your own corner of the internet</span>
        <h1>
          {step === 0
            ? "Keep what catches your eye."
            : step === 1
              ? "What are you looking closer at?"
              : "Start with something that moves you."}
        </h1>
        <p className="onboarding-description">
          {step === 0
            ? "Images, fragments, and ideas. A quiet place to gather them, follow a thread, and figure out how they work."
            : step === 1
              ? "A little context helps a connected model explain things in your language. You can change this later."
              : "Bring in a reference of your own, or explore a small collection of images and original design studies."}
        </p>
        {step === 0 && (
          <div className="form-stack">
            <label>
              Library name
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="My library"
              />
            </label>
            <div className="local-assurance">
              <Check size={16} /> Stored on this device. No account needed.
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="form-stack">
            <label>
              Your practice
              <input
                value={draft.context}
                onChange={(e) =>
                  setDraft({ ...draft, context: e.target.value })
                }
                placeholder="Designer, developer, curious person…"
              />
            </label>
            <fieldset>
              <legend>What catches your eye?</legend>
              <div className="interest-choices">
                {interests.map((i) => (
                  <button
                    type="button"
                    key={i}
                    aria-pressed={draft.interests.includes(i)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        interests: draft.interests.includes(i)
                          ? draft.interests.filter((v) => v !== i)
                          : [...draft.interests, i],
                      })
                    }
                  >
                    {i}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Tools you work with
              <input
                value={draft.tools}
                onChange={(e) => setDraft({ ...draft, tools: e.target.value })}
                placeholder="Figma, CSS, SwiftUI…"
              />
            </label>
          </div>
        )}
        {step === 2 && (
          <div className="start-choices">
            <button disabled={busy} onClick={() => void next(false)}>
              <FolderOpen />
              <span>
                <strong>Bring my own references</strong>
                <small>
                  Start an empty library and add a file, link, or note.
                </small>
              </span>
              <ArrowRight size={18} />
            </button>
            <button disabled={busy} onClick={() => void next(true)}>
              <Sparkles />
              <span>
                <strong>Explore a sample library</strong>
                <small>14 references to get a feel for the space.</small>
              </span>
              <ArrowRight size={18} />
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="onboarding-footer">
          {step > 0 ? (
            <Button quiet disabled={busy} onClick={() => setStep(step - 1)}>
              <ArrowLeft size={15} /> Back
            </Button>
          ) : (
            <span className="muted">A library that stays yours.</span>
          )}
          {step < 2 && (
            <Button
              primary
              disabled={busy || !draft.name.trim()}
              onClick={() => void next()}
            >
              {busy ? "Saving…" : "Continue"}
              <ArrowRight size={15} />
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
