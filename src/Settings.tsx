import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Monitor,
  Moon,
  Sun,
  Database,
  Check,
  Server,
  ArrowUpRight,
} from "lucide-react";
import { Button, Dialog } from "./components";
import { backupLibrary, desktop } from "./storage";
import { ProviderSetup } from "./ProviderSetup";
import { ImportSettingsPanel } from "./ImportSettingsPanel";
import type { Library } from "./model";

export function Settings({
  library,
  mutate,
  restoreBackup,
  report,
  retryImports,
  recheckImports,
}: {
  library: Library;
  mutate: (fn: (l: Library) => Library) => Promise<void>;
  restoreBackup: (file: File) => Promise<void>;
  report: (s: string) => void;
  retryImports?: () => Promise<void>;
  recheckImports?: () => Promise<void>;
}) {
  const [providerOpen, setProviderOpen] = useState(false);
  const [backup, setBackup] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(library.profile);
  const [prepared, setPrepared] = useState("");
  useEffect(
    () => () => {
      if (prepared) URL.revokeObjectURL(prepared);
    },
    [prepared],
  );
  async function updateProfile(e: FormEvent) {
    e.preventDefault();
    try {
      await mutate((l) => ({
        ...l,
        profile: {
          ...l.profile,
          name: profile.name.trim(),
          context: profile.context,
          tools: profile.tools,
        },
      }));
      report("Your learning context is saved.");
    } catch (err) {
      setError(String(err));
    }
  }
  async function exportBackup() {
    setBusy(true);
    setError("");
    try {
      setPrepared(URL.createObjectURL(await backupLibrary(library)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!backup) return;
    setBusy(true);
    setError("");
    try {
      await restoreBackup(backup);
      setBackup(undefined);
      report("Your library has been restored.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="content-page settings-page" id="main-content">
      <div className="page-heading">
        <span className="eyebrow">Make yourself at home</span>
        <h1>Settings</h1>
        <p>A quiet workspace, set up for the way you think.</p>
      </div>
      <ImportSettingsPanel
        settings={library.importSettings}
        save={(importSettings) => mutate((l) => ({ ...l, importSettings }))}
        retryImports={retryImports}
        recheckImports={recheckImports}
      />
      <section className="settings-section">
        <div>
          <h2>Appearance</h2>
          <p>Choose the light that suits your space.</p>
        </div>
        <div className="settings-controls">
          <div className="theme-choices" role="group" aria-label="Color theme">
            {[
              { name: "light", label: "Light", icon: Sun },
              { name: "dark", label: "Dark", icon: Moon },
              { name: "system", label: "System", icon: Monitor },
            ].map((t) => (
              <button
                key={t.name}
                aria-pressed={library.profile.theme === t.name}
                onClick={() => {
                  const theme =
                    t.name === "light"
                      ? "light"
                      : t.name === "dark"
                        ? "dark"
                        : "system";
                  void mutate((l) => ({
                    ...l,
                    profile: { ...l.profile, theme },
                  })).catch((err) => setError(String(err)));
                }}
              >
                <t.icon size={20} />
                <span>{t.label}</span>
                {library.profile.theme === t.name && <Check size={13} />}
              </button>
            ))}
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={library.profile.reduceMotion}
              onChange={(e) => {
                const reduceMotion = e.target.checked;
                void mutate((l) => ({
                  ...l,
                  profile: { ...l.profile, reduceMotion },
                })).catch((err) => setError(String(err)));
              }}
            />{" "}
            Reduce motion
          </label>
          <small>
            Your device’s reduced-motion setting is always respected.
          </small>
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Learning context</h2>
          <p>Included with questions you send to a model.</p>
        </div>
        <form className="form-stack" onSubmit={updateProfile}>
          <label>
            Library name
            <input
              required
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </label>
          <label>
            Your practice
            <input
              value={profile.context}
              onChange={(e) =>
                setProfile({ ...profile, context: e.target.value })
              }
            />
          </label>
          <label>
            Your tools
            <input
              value={profile.tools}
              onChange={(e) =>
                setProfile({ ...profile, tools: e.target.value })
              }
            />
          </label>
          <Button type="submit">Save context</Button>
        </form>
      </section>
      <section className="settings-section">
        <div>
          <h2>Model connection</h2>
          <p>
            Optional. Your sources stay local until you review and send
            evidence.
          </p>
        </div>
        <div className="settings-controls">
          <div className="connection-card">
            <Server size={22} />
            <div>
              <strong>{library.provider.model || "No model connected"}</strong>
              <p>
                {library.provider.model
                  ? `${library.provider.local ? "Local" : "Cloud"} · ${library.provider.endpoint}`
                  : "Connect a local or OpenAI-compatible model."}
              </p>
            </div>
          </div>
          <Button onClick={() => setProviderOpen(true)}>
            {library.provider.model ? "Edit connection" : "Connect a model"}
            <ArrowUpRight size={14} />
          </Button>
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Storage & backups</h2>
          <p>
            A portable copy includes your library and imported source files.
          </p>
        </div>
        <div className="settings-controls">
          <div className="connection-card">
            <Database size={22} />
            <div>
              <strong>
                {desktop ? "Stored on this device" : "Browser preview storage"}
              </strong>
              <p>
                {library.items.length} references · {library.lessons.length}{" "}
                lessons · {library.terms.length} terms
              </p>
              <small>
                {desktop
                  ? "SQLite library and local source files."
                  : "IndexedDB in this browser. Separate from the desktop library."}
              </small>
            </div>
          </div>
          <div className="inline-actions">
            <Button disabled={busy} onClick={() => void exportBackup()}>
              <ArrowDownToLine size={15} />
              {busy ? "Working…" : "Export backup"}
            </Button>
            <label className="button file-button">
              <ArrowUpFromLine size={15} />
              Import backup
              <input
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(e) => {
                  setBackup(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <small>Provider credentials are excluded from backups.</small>
        </div>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {providerOpen && (
        <ProviderSetup
          provider={library.provider}
          save={(provider) => mutate((l) => ({ ...l, provider }))}
          onClose={() => setProviderOpen(false)}
        />
      )}
      {prepared && (
        <Dialog
          title="Your backup is ready"
          description="This copy includes your references, imported files, lessons, and vocabulary. Provider keys are excluded."
          onClose={() => setPrepared("")}
        >
          <div className="form-actions">
            <Button onClick={() => setPrepared("")}>Close</Button>
            <a
              className="button primary"
              href={prepared}
              download={`inspo-library-${new Date().toISOString().slice(0, 10)}.json`}
            >
              Download backup
              <ArrowDownToLine size={15} />
            </a>
          </div>
        </Dialog>
      )}
      {backup && (
        <Dialog
          title="Restore this backup?"
          description={`${backup.name} will replace the current library. Export a backup first if you want to keep both.`}
          onClose={() => {
            if (!busy) setBackup(undefined);
          }}
        >
          <div className="form-actions">
            <Button disabled={busy} onClick={() => setBackup(undefined)}>
              Cancel
            </Button>
            <Button primary disabled={busy} onClick={() => void restore()}>
              {busy ? "Restoring…" : "Restore library"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </main>
  );
}
