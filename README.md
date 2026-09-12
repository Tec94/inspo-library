# Inspo Library

**[Download for Windows (x64)](https://github.com/Tec94/inspo-library/releases/latest/download/Inspo-Library-windows-x64-setup.exe)**
· [All releases](https://github.com/Tec94/inspo-library/releases)

Download the `.exe` installer and run it to install the desktop app. You don't
need Node.js, Rust, or build tools to use the installed app. The download link
becomes available after a stable release finishes building its installer.

A local reference library and source-based learning workspace. Paste links to
save sources immediately, capture available text and media, and review posts
flagged by your import rules. It uses React, TypeScript, Vite, and a Tauri/Rust
desktop shell. The interface includes a compact card library, category sidebar,
keyboard search, focused inspection, and light and dark themes. The
[reference design system](docs/reference-design-system.md) records the video's
colors, layout, motion measurements, and implementation scope.

## Run the browser preview

Install the dependencies and start the local preview:

```powershell
npm ci
npm run dev
```

Open [the browser preview](http://127.0.0.1:1420). Onboarding offers an empty
library or a sample collection. Imported files and library data persist in this
browser's IndexedDB.
Vite includes a local HTTP service for fetching public source metadata and
media. You don't need an account or a hosted application server. Different
origins, including `localhost` and `127.0.0.1`, have separate preview libraries.

## Run the Windows desktop app

The native build needs the prerequisites in the
[Tauri Windows guide](https://v2.tauri.app/start/prerequisites/#windows): Rust,
Microsoft's C++ build tools, the Windows SDK, and WebView2.

Rust and the Windows C++ build tools are installed on this machine. On another
machine, install the prerequisites before running the native commands. Stop a
separately running Vite preview before starting the desktop app:

```powershell
npm run desktop
```

The launcher adds the standard Rust installation directory to its child
process's PATH. It does not change your system PATH.

To produce a Windows NSIS installer:

```powershell
npm run desktop:build
```

The installer output belongs under `src-tauri/target/release/bundle/nsis/`.

### Release the Windows installer on GitHub

The [Windows installer workflow](.github/workflows/release.yml) builds the tagged
code and attaches `Inspo-Library-windows-x64-setup.exe` whenever you publish a
GitHub release. The stable filename keeps the download link above working across
versions. Node.js 26.5.0 matches the locally verified build environment.

To release a new version:

1. Update the version in `package.json`, `package-lock.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the app entry in
   `src-tauri/Cargo.lock`. Commit and push the changes, including this workflow.
2. Open [GitHub Releases](https://github.com/Tec94/inspo-library/releases), choose
   **Draft a new release**, and select or create a tag at the commit to release.
   Any tag name works, including the existing `release` tag.
3. Choose **Publish release**. Open
   [Actions → Windows installer](https://github.com/Tec94/inspo-library/actions/workflows/release.yml)
   to follow the build. Once it succeeds, the installer appears under the
   release's **Assets**. Prerelease installers are available on their own release
   pages; the download link above follows the latest stable release.

To attach an installer to an existing release, open that workflow, select
**Run workflow**, and enter its exact tag. The workflow must be on the default
branch for this button to appear. It builds the selected tag, not the branch
selected in the workflow menu. An existing, uploaded installer is left in place.

If the repository uses
[immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases),
push the tag first, save a release draft using that tag, and run the workflow
manually. Wait for the installer to appear in the draft's **Assets**, then
publish. GitHub locks those assets on publication; the automatic workflow skips
the installer already attached to the draft.

## Use the workspace

Collect sources, inspect them, and turn selected evidence into reusable notes:

- **Collect:** Import local images, videos, PDFs, text files, or other files.
  Paste one link, several links, prose containing links, or a JSON reference
  list. Automatic capture fetches available source text and images or videos.
  Existing links without captures are queued when you reopen the library.
  See [automatic imports and review](docs/automatic-imports.md) for supported
  sources, settings, and capture limitations.
- **Review:** Open **Review queue** to keep or trash flagged sources. Settings
  provides keyword, domain, author, and sensitive-content rules. These use local
  text and metadata comparisons, not an AI classifier.
- **Explore:** Search titles, tags, notes, URLs, and collections. Filter the
  card grid by category or source type, or open a collection from the sidebar.
- **Inspect:** Open a source, toggle its inspector, edit its title, tags, note,
  and collection membership, or favorite, archive, and restore it. Trash is
  recoverable; the app does not offer permanent deletion.
- **Ask:** Select a whole image, image region, note text, or paused video frame.
  Ctrl-click references to compare sources. Review the actual evidence and
  destination before sending a request.
- **Learn:** Save structured answers as lessons and keep vocabulary from an
  answer, or add your own terms. Observations, inferences, and uncertainty have
  distinct labels.
- **Back up:** Settings prepares a portable JSON file containing metadata and
  every locally saved attachment. Use the explicit download link to save it.
  Import validates asset hashes before replacing the current library.
  Credential values are excluded.

### Keyboard and motion

`Ctrl/Cmd + K` opens search; `Ctrl/Cmd + O` opens capture. In search, use the up
and down arrows to choose a result and Enter to inspect it. Escape closes a
dialog and returns focus to its trigger. Device reduced-motion preferences and
the app's Reduce motion setting are respected.

### Optional model connection

In Settings or Ask, enter an OpenAI-compatible API base URL and a model name.
Select **On this device** for a loopback endpoint, or **Cloud provider** for
HTTPS. Mark image support only when the selected model accepts images.

The app does not install a model or include credentials. A local model service
must already be running. Browser preview connections also require the provider
to accept the preview origin through CORS; the native request uses Rust HTTP.
Keys use the operating system credential store in the native implementation.
Preview keys remain in memory, are bound to their endpoint, and disappear when
the page closes.

Only the reviewed images/text, question, and displayed learning-context settings
are included in a model request. Automatic source capture is separate from
model analysis. You can select downloaded images, an attachment's video frame,
your notes, or captured source text as evidence. A URL alone isn't visual
evidence. For PDFs or other files, add a note or excerpt to provide text
evidence. Native PDF rendering depends on the WebView's PDF support.

## Storage and implementation boundaries

The native implementation stores `library.sqlite` and content-addressed source
files in Tauri's application-local-data directory for
`com.inspolibrary.desktop`. SQLite holds one versioned JSON library record,
written transactionally. It is not the complete relational schema or worker
architecture proposed in the earlier technical blueprint.

The frontend calls narrowly named native commands; it has no generic filesystem
or SQL bridge. Native asset paths accept only SHA-256 identifiers. Source
requests use dedicated public-URL fetch and download commands. HTTP redirects
are disabled for model requests. Imported originals are copied into library
storage; archive/trash operations preserve them.

This implementation covers the supplied screen families. Browser extensions,
Native Messaging capture, full-article extraction, OCR, full-video analysis,
background indexing, library relocation, and a downloaded local model are not
implemented. Capture runs while the app is open and resumes queued work after
reopening. Large-library performance and native startup recovery from a corrupt
SQLite file remain unverified.

## Verification

Run the frontend, transport, and native checks from the repository root:

```powershell
npm run build
npm run lint
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Tests cover state persistence, import parsing and duplicate handling, review
rules, capture state transitions, attachment preservation and backup integrity,
public network boundaries, evidence labels, endpoint credential isolation, HTTP
fixtures, and text contrast. The anti-slop Oxlint plugin is installed with its
required rules enabled. Use `npm run desktop:build` separately to build the
Windows release and installer.

The request/answer interface was exercised with
`tests/provider-fixture.mjs`, explicitly labeled as a test fixture. It is not a
model and is never selected automatically. Fixture responses don't establish
real-model answer quality or native credential-store behavior.

The [earlier interface verification report](docs/implementation-review-v0.2.md)
records the browser checks and limitations at that revision; it predates the
automatic import workflow. The original design exports remain in
`docs/prototypes/`, and the editable design remains `pencil-new.pen`.

## Visual assets

The sample library includes stock images exported from the authored Pencil
screens and six original SVG studies. Lucide supplies the interface icons; the
app icon uses the same visual language. No additional icon downloads are needed.
Sample studies and integration-fixture answers are labeled so they are not
mistaken for analyzed third-party work.
