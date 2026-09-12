import { useState, type FormEvent } from "react";
import { Server, Globe, KeyRound } from "lucide-react";
import { Button, Dialog } from "./components";
import { validateEndpoint, type Provider } from "./model";
import { desktop, setProviderKey } from "./storage";

export function ProviderSetup({
  provider,
  save,
  onClose,
}: {
  provider: Provider;
  save: (provider: Provider) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(provider);
  const [key, setKey] = useState("");
  const [replaceKey, setReplaceKey] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      validateEndpoint(draft);
      setBusy(true);
      if (replaceKey || key) await setProviderKey(draft, key);
      await save(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Connect a model"
      description="Your library works without one. Add a model when you want to ask about a source."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={draft.local}
            onClick={() =>
              setDraft({
                ...draft,
                local: true,
                endpoint: "http://localhost:11434/v1",
              })
            }
          >
            <Server size={16} /> On this device
          </button>
          <button
            type="button"
            aria-pressed={!draft.local}
            onClick={() =>
              setDraft({
                ...draft,
                local: false,
                endpoint: "https://api.openai.com/v1",
              })
            }
          >
            <Globe size={16} /> Cloud provider
          </button>
        </div>
        <label>
          API endpoint
          <input
            type="url"
            value={draft.endpoint}
            onChange={(e) =>
              setDraft({ ...draft, endpoint: e.target.value.trim() })
            }
            required
            aria-describedby="endpoint-help"
          />
          <small id="endpoint-help">
            An OpenAI-compatible API base URL, including /v1 if required.
          </small>
        </label>
        <label>
          Model name
          <input
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            placeholder="Enter your installed or hosted model"
            required
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.vision}
            onChange={(e) => setDraft({ ...draft, vision: e.target.checked })}
          />{" "}
          This model accepts images
        </label>
        <label>
          API key <span className="muted">(if required)</span>
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setReplaceKey(true);
            }}
            placeholder="Leave blank to keep the saved key"
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={replaceKey}
            onChange={(e) => setReplaceKey(e.target.checked)}
          />{" "}
          Replace saved key with this value
        </label>
        <div className="notice">
          <KeyRound size={16} />
          <p>
            {desktop
              ? "Keys stay in your operating system’s credential store."
              : "In this browser preview, a key stays in memory until the page closes. The desktop app uses the operating system’s credential store."}{" "}
            You’ll review the selected evidence before each request.
          </p>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button primary type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save connection"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
