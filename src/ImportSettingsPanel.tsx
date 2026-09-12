import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw, ListFilter } from "lucide-react";
import { Button } from "./components";
import { importSettingsSchema, type ImportSettings } from "./model";
import "./import-settings.css";

export interface ImportSettingsPanelProps {
  settings: ImportSettings;
  save: (settings: ImportSettings) => Promise<void>;
  retryImports?: () => Promise<void>;
  recheckImports?: () => Promise<void>;
}

function editableFields(settings: ImportSettings) {
  return {
    preferredKeywords: settings.preferredKeywords.join("\n"),
    excludedKeywords: settings.excludedKeywords.join("\n"),
    blockedDomains: settings.blockedDomains.join("\n"),
    blockedAuthors: settings.blockedAuthors.join("\n"),
    maxDownloadMb: settings.maxDownloadMb?.toString() ?? "",
    requestTimeoutSeconds: settings.requestTimeoutSeconds?.toString() ?? "",
  };
}

function ruleEntries(value: string) {
  return [...new Set(value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean))];
}

export function ImportSettingsPanel({ settings, save, retryImports, recheckImports }: ImportSettingsPanelProps) {
  const [draft, setDraft] = useState(settings);
  const [fields, setFields] = useState(() => editableFields(settings));
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(settings);
    setFields(editableFields(settings));
  }, [settings]);

  async function persist() {
    const parsed = importSettingsSchema.safeParse({
      ...draft,
      preferredKeywords: ruleEntries(fields.preferredKeywords),
      excludedKeywords: ruleEntries(fields.excludedKeywords),
      blockedDomains: ruleEntries(fields.blockedDomains),
      blockedAuthors: ruleEntries(fields.blockedAuthors),
      maxDownloadMb: fields.maxDownloadMb.trim() ? Number(fields.maxDownloadMb) : null,
      requestTimeoutSeconds: fields.requestTimeoutSeconds.trim() ? Number(fields.requestTimeoutSeconds) : null,
    });
    if (!parsed.success) throw new Error("Download size and request timeout must be positive numbers, or left blank.");
    await save(parsed.data);
  }

  async function run(action: "save" | "retry" | "recheck") {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      await persist();
      if (action === "retry" && retryImports) {
        await retryImports();
        setMessage("Import settings saved. Missing and failed captures were sent for retry; progress appears on each reference.");
      } else if (action === "recheck" && recheckImports) {
        await recheckImports();
        setMessage("Import settings saved and existing references checked against your rules.");
      } else {
        setMessage("Import settings saved. New imports will use these rules.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run("save");
  }

  return (
    <section className="settings-section import-settings-section">
      <div>
        <h2>Imports & review</h2>
        <p>Save the source immediately, then capture its text and media in the background.</p>
        <p className="import-review-note">Rules use source text and metadata on this device. They do not use an AI classifier. Flagged or uncertain references go to the review queue; they are never deleted by a rule.</p>
      </div>
      <form className="form-stack import-settings-form" onSubmit={submit}>
        <fieldset disabled={Boolean(busy)} className="import-setting-group">
          <legend>Automatic capture</legend>
          <label className="import-toggle">
            <input type="checkbox" checked={draft.autoFetch} onChange={(e) => setDraft({ ...draft, autoFetch: e.target.checked })} />
            <span>Fetch source details automatically<small>Retrieve the title, text, author, and available media after a link is saved.</small></span>
          </label>
          <label className="import-toggle">
            <input type="checkbox" checked={draft.downloadMedia} onChange={(e) => setDraft({ ...draft, downloadMedia: e.target.checked })} />
            <span>Download images and videos<small>Save available source media on this device for later viewing.</small></span>
          </label>
          <label className="import-toggle">
            <input type="checkbox" checked={draft.allowEmbeds} onChange={(e) => setDraft({ ...draft, allowEmbeds: e.target.checked })} />
            <span>Allow supported embeds<small>Use the original player when supported. Embeds need an internet connection.</small></span>
          </label>
        </fieldset>
        <fieldset disabled={Boolean(busy)} className="import-setting-group">
          <legend>Review rules</legend>
          <p className="muted small">Use one phrase, domain, or author per line, or separate entries with commas.</p>
          <label>
            Preferred keywords
            <textarea rows={3} value={fields.preferredKeywords} onChange={(e) => setFields({ ...fields, preferredKeywords: e.target.value })} placeholder="Leave empty to accept any topic" />
            <small>When set, imports without a matching phrase go to review.</small>
          </label>
          <label>
            Excluded keywords
            <textarea rows={3} value={fields.excludedKeywords} onChange={(e) => setFields({ ...fields, excludedKeywords: e.target.value })} placeholder="Phrases you want to review before keeping" />
            <small>Matching imports go to review, even when they match a preferred keyword.</small>
          </label>
          <div className="import-rule-columns">
            <label>
              Blocked domains
              <textarea rows={3} value={fields.blockedDomains} onChange={(e) => setFields({ ...fields, blockedDomains: e.target.value })} placeholder="example.com" />
              <small>Sources from these domains go to review.</small>
            </label>
            <label>
              Blocked authors
              <textarea rows={3} value={fields.blockedAuthors} onChange={(e) => setFields({ ...fields, blockedAuthors: e.target.value })} placeholder="Author name or handle" />
              <small>Sources from these authors go to review.</small>
            </label>
          </div>
          <label className="import-toggle">
            <input type="checkbox" checked={draft.reviewSensitive} onChange={(e) => setDraft({ ...draft, reviewSensitive: e.target.checked })} />
            <span>Review sources marked as sensitive<small>Uses the source’s sensitive-content flag when available.</small></span>
          </label>
        </fieldset>
        <fieldset disabled={Boolean(busy)} className="import-setting-group">
          <legend>Optional download limits</legend>
          <p className="muted small">Leave these blank to use no app-defined size limit or request timeout. Host and network restrictions can still apply.</p>
          <div className="import-rule-columns">
            <label>
              Maximum file size (MB)
              <input type="number" min="0" step="any" inputMode="decimal" value={fields.maxDownloadMb} onChange={(e) => setFields({ ...fields, maxDownloadMb: e.target.value })} placeholder="No custom limit" />
            </label>
            <label>
              Request timeout (seconds)
              <input type="number" min="0" step="any" inputMode="decimal" value={fields.requestTimeoutSeconds} onChange={(e) => setFields({ ...fields, requestTimeoutSeconds: e.target.value })} placeholder="No custom timeout" />
            </label>
          </div>
        </fieldset>
        <div className="import-settings-actions">
          <Button type="submit" primary disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : "Save import settings"}</Button>
          {recheckImports && <Button disabled={Boolean(busy)} onClick={() => void run("recheck")}><ListFilter size={15} />{busy === "recheck" ? "Checking…" : "Save & recheck existing"}</Button>}
          {retryImports && <Button disabled={Boolean(busy)} onClick={() => void run("retry")}><RefreshCw size={15} />{busy === "retry" ? "Retrying…" : "Save & retry missing media"}</Button>}
        </div>
        {message && <p className="small" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </section>
  );
}
