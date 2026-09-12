# Automatic imports and review

Inspo Library saves your source links immediately, then captures available text
and media while the app is open. Your library and downloaded attachments stay
on this device. Sources flagged by your rules wait in **Review queue**.

## Add sources

Use the same capture flow for one link or a group of links:

1. Select **Add reference**, or press `Ctrl/Cmd + O`.
2. In **Links**, paste URLs, text containing URLs, or a JSON reference list.
3. Optionally, open **Add context or import JSON** to add notes, tags, or a
   title, or choose a JSON file.
4. Choose a collection and select **Add references**.

Existing and repeated links are skipped, including links already in Archive
or Trash. X post aliases and tracking variations use the same duplicate check.
JSON entries can supply `url`, `title`, `body`, and `tags`:

```json
[
  {
    "url": "https://example.com/motion-study",
    "title": "Navigation motion study",
    "body": "Look at the transition between views.",
    "tags": ["motion", "navigation"]
  }
]
```

You can still import local files through **Files**, drop files into capture, or
write a note through **Note**.

## What gets captured

The importer reads public source metadata and available media. It doesn't use
your browser login or request credentials for a source account.

| Source | Capture behavior |
| --- | --- |
| Public X post | Requests post text, author, sensitive-content metadata, and media URLs through FxEmbed's third-party `api.fxtwitter.com` endpoint. Downloads available images and videos when enabled. |
| Web page | Reads the title, description, author, and supported Open Graph or Twitter-card media metadata. |
| Direct image or video URL | Downloads the source file when media downloads are enabled. |
| Plain-text source | Saves the returned text as captured source text. |
| Supported X, YouTube, or Vimeo URL | Can display the provider's embedded source when embeds are enabled. |

Generic page capture reads metadata, not the complete article or rendered page.
It doesn't run remote page scripts, perform OCR, or analyze a whole video.
Private, removed, unsupported, or unavailable sources can fail. A saved source
link remains available even when capture fails.

Embeds use provider-specific URLs in sandboxed frames. They require an internet
connection and contact the provider when opened. An embed isn't a downloaded
copy. When both are available, the source viewer lets you switch between the
downloaded media and the embedded source. Pending review items don't load
embeds.

## Configure capture and review

Open **Settings → Imports & review** and save the settings you want new imports
to use. Rule entries accept commas or new lines.

| Setting | Effect |
| --- | --- |
| Fetch source details automatically | Enables background retrieval after you save a link. |
| Download images and videos | Saves available media locally after metadata passes review. |
| Allow supported embeds | Enables online provider embeds in the source viewer. This is separate from automatic metadata retrieval. |
| Preferred keywords | If provided, source text must contain a matching phrase. Unmatched captures go to review. Failed capture with no matching local context also goes to review because relevance couldn't be checked. |
| Excluded keywords | Sends matching sources to review, even when a preferred phrase also matches. |
| Blocked domains | Sends matching domains and their subdomains to review. |
| Blocked authors | Sends matching author names or handles to review. |
| Review sources marked as sensitive | Uses the sensitive-content flag supplied by the source. |

These are local, case-insensitive text and metadata rules, not an AI classifier.
Keyword rules inspect the title, note, URL, tags, and captured text. Preferred
keywords are checked after metadata arrives; known exclusions can stop capture
earlier.

Select **Keep** in the review queue to approve a reference and continue capture
when automatic fetching is enabled. Approval overrides the rules for that
reference, including later rechecks. Select **Trash** to remove it from the
active library. Trash is recoverable, and rules never permanently delete a
source or its downloaded files.

**Maximum file size (MB)** and **Request timeout (seconds)** are optional. Leave
them blank for no app-defined size limit or request timeout. Host and network
restrictions can still apply. You choose any custom values; the app doesn't
apply fixed defaults.

## Follow progress and retry

Each reference shows its capture state. A locally saved link doesn't mean that
its media has finished downloading.

- Queued references wait for capture; fetching references are in progress.
- Ready means source capture completed. A source may have text or an embed
  without a downloadable attachment.
- Partial captures keep saved attachments and show the remaining errors.
- Failed captures keep the source and error so you can retry.
- Disabled captures resume when you enable automatic fetching.

Queued work resumes when you reopen the app. Existing active links without a
capture or local asset are queued on library load. Interrupted requests are
queued again; the app doesn't run a service while closed.

Use **Retry import** in a source viewer to retry that source. In Settings,
**Save & retry missing media** saves your settings and queues eligible failed,
partial, or uncaptured sources. **Save & recheck existing** applies your current
rules to existing active sources. Pending review sources wait for **Keep**.

## Storage and evidence

Browser previews store the library and downloaded files in IndexedDB. Their
local Vite service fetches public sources. The native app uses Rust commands,
SQLite, and content-addressed files in its application data directory. The two
libraries are separate.

All saved attachments are included in a portable backup, not just the card's
primary preview. Restore validates that referenced files are present and their
hashes match. Archive and Trash preserve those files.

Captured text stays separate from your own notes. In the source viewer, select
an attachment, image region, text excerpt, or paused video frame to ask about
it. The existing evidence review step still controls what you send to a model;
automatic import doesn't send sources to an AI provider.

## Verification on September 12, 2026

The production frontend build, lint, all 41 JavaScript/TypeScript tests, all six
Rust tests, and `cargo check` passed. The tests cover review gating, duplicate
handling, import recovery, concurrent edits, attachment integrity, public-network
validation, streaming downloads, and cancellation.

`npm run desktop:build` also passed and produced the release application and
`src-tauri/target/release/bundle/nsis/Inspo Library_0.2.0_x64-setup.exe`. The
installer includes the final media viewer changes. It has not been installed
over the existing desktop application.

Browser checks used a separate preview library. The supplied public X post
automatically saved a 25.17-second video, and a direct image URL saved a
1200 × 817 image. Both rendered from local blob URLs. Video playback and the
embedded X post worked. Disabling embeds retained local playback. Keyword
review, persistence after reload, Keep, Trash/Restore, failed-source recovery,
and the 390-pixel review layout were verified. Temporary test rules were cleared.
