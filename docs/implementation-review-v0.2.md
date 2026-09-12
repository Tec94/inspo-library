# Interface implementation review

Reviewed September 5, 2026.

## Scope and Coverage

The contract is to adapt the authored screens into a usable local reference and
learning interface, preserve their quiet visual character, and verify the
implemented journeys. This full interface review covers React/TypeScript,
semantic OKLCH CSS tokens, Lucide icons, native HTML controls, and restrained CSS
and Motion transitions. Native release readiness is a separate, open check.

The requested design, writing, accessibility, animation, and anti-slop skills
informed the implementation. The user's implementation request authorizes code
changes despite the animation advisor's default read-only posture. The earlier
technical blueprint remains a broader architecture proposal, not a list of
features claimed complete by this screen implementation.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native dialogs, source close/return focus, input labels, narrow navigation, source selection, keyboard move controls | Corrected focus restoration and off-screen navigation exposure; browser checks pass |
| Colors | Shared light/dark tokens and rendered dark settings | Semantic normal-text pairs pass WCAG AA 4.5:1; contrast test covers both themes |
| Layout | Masonry, source inspection, evidence rail, settings, capture; default desktop viewport and 390 × 844 narrow viewport | Narrow page width equals viewport width; inspector and settings remain scrollable |
| Typography | System UI font, headings, labels, notes, answer structure | Clear hierarchy; text uses real content and visible labels |
| UI | Capture, canvas drag/click, optional provider setup, evidence preview, answers, saved knowledge, backup preparation | Core browser journeys pass; native build and backup-download completion remain open |
| Writing | Onboarding, empty states, source provenance, provider/privacy messages, failures | Local versus remote behavior is explicit; model fixture is identified as a fixture |

## Findings

| # | Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | HIGH | Accessibility | `src/components.tsx`, Dialog | Closing a source under React Strict Mode could lose the original focus target | Preserve the original trigger across effect replay and restore focus after unmount | Escape now returns focus to the source button |
| 2 | MEDIUM | UI | `src/Gallery.tsx`, pointerUp | Pointer capture allowed dragging but swallowed a normal canvas card click | Handle the non-drag pointer release and suppress its duplicate click | Canvas references can be moved and then opened |
| 3 | MEDIUM | Accessibility | `src/App.tsx`, `src/styles.css`, narrow navigation | Off-screen navigation remained reachable; the compact Add control lost its name | Hide closed navigation from focus/accessibility, contain open-menu focus, name the Add control | Narrow layouts retain usable keyboard navigation |
| 4 | MEDIUM | UI | `src/Settings.tsx`, backup download | Automatic export reported completion without a download receipt in this browser | Prepare the backup and show an explicit download link; do not claim it was saved | **Open verification gap:** the Codex browser still did not expose a completed download |

The first three findings are closed. The fourth remains a verification gap in
the current browser environment. Native packaging is also blocked by a missing
system build prerequisite and is not presented as a completed check.

## Motion review

Motion lives in `src/styles.css`, `src/SourceView.tsx`, and the pointer-driven
camera in `src/Gallery.tsx`. The interface uses a short, non-bouncing source
entrance, a small button press response, and opacity/transform feedback. Panning
and dragging follow pointer input directly. The background library remains in
place while a source is open. Keyboard input and reduced-motion preferences
disable decorative transitions. The implementation does not reproduce the
reference product's transition choreography.

## Considered but Rejected

| Location | Candidate | Rejected because |
| --- | --- | --- |
| Library and canvas | Add staggered entrances to every image | Repeated scanning and rearrangement benefit from immediate access; the supplied interaction skills discourage animation on frequent actions |
| Provider setup | Add a prefilled simulated AI answer to make the screen look complete | An unconfigured provider must remain an honest setup state; the integration fixture is separate and explicitly labeled |
| Local architecture | Add the blueprint's extension, indexing workers, and relocation system during the screen build | These do not establish the requested screen journeys and would substantially expand the implementation contract |

## Verification

### Passed

- `npm run build`: TypeScript and Vite production build pass.
- `npm run lint`: required anti-slop rules pass without disabling individual
  rules or adding inline suppressions.
- `npm test`: seven tests pass, including database-state round trips, corrupt
  and missing-asset restore rejection, endpoint-bound credentials, source-label
  validation, and a real loopback HTTP request.
- Onboarding: advanced through the three steps and loaded the explicit sample
  library; reopening skipped completed onboarding.
- Import and reopen: imported `public/demo/space.svg` as an actual local file;
  after reload, search found it and the source used a local Blob URL.
- Source inspection: opened an image, displayed its inspector, and set a region
  through labeled numeric controls. The evidence review rendered the cropped
  chair image rather than the full source.
- Ask and learning: sent reviewed evidence to the explicitly labeled local QA
  fixture, rendered an anchored structured answer, saved a lesson and a term,
  and confirmed both counts after reload. This verifies the interface and
  request boundary, not model reasoning quality.
- Canvas: fit the full collection, dragged a reference, and confirmed changed
  coordinates. A subsequent click opened the source after the pointer fix.
- Collections: created a collection and reached its actionable empty state.
- Recovery through Trash: moved the imported test reference to Trash, restored
  it, and observed it return to Inbox.
- Keyboard: Escape closed the source and restored focus to `Open space`.
- Appearance: selected dark mode and Reduce motion. Both survived reopening.
- Responsive inspection: at 390 × 844, the document width remained 390px; the
  hidden sidebar was absent from the accessibility tree and Add retained its
  accessible name. The temporary viewport override was reset.
- Browser developer logs: no errors or warnings during the inspected flows.
- `npx tauri icon public/app-icon.svg`: generated native app icons, including
  `src-tauri/icons/icon.ico` and `icon.png`.

### Not verified

- `cargo check --manifest-path src-tauri/Cargo.toml` stops at
  **linker `link.exe` not found**. Rust installed successfully, but the Visual
  Studio Desktop development with C++ workload is absent. Native commands,
  credential storage, the SQLite runtime, and the installer therefore remain
  unverified on this machine.
- Backup preparation reaches a ready state with a Blob download link. Both
  automatic and explicit downloads failed to produce a download event in the
  Codex browser; no matching file was found in the ordinary Downloads folder.
  Confirm actual saving in a supported browser and the native WebView.
- A real local or hosted model was not configured. The local fixture tests no
  image-understanding capability.
- Native PDF rendering, video-frame playback/extraction, system failure recovery,
  and large-library performance were not exercised end to end.

## Verdict

The implemented browser journeys are usable. Native release readiness and
backup-download completion remain open, so the full local-app contract is not
yet proven on this machine.

Needs changes
