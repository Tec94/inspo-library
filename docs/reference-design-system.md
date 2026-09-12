# Reference design system

Inspo Library's interface follows the library shown in
[Nur Praditya's video](https://x.com/nurpraditya/status/2052041217949765721).
The implementation replaces the existing interface and keeps its local data,
capture, inspection, learning, and recovery flows.

## Observations and implementation

The video was decoded for frame inspection, including its 60 fps search-opening
sequence. Colors below are sampled from decoded frames. Dimensions and easing
are visual estimates because the product's source CSS is unavailable.

| Element | Video evidence | Implementation |
| --- | --- | --- |
| Canvas | Flat `#fafafa` | `--bg: oklch(98.51% 0 0)`, equivalent neutral |
| Surfaces | White cards, sidebar, and palette | `--panel` and `--sidebar` |
| Selected row | `#f2f2f2` | `--selected: oklch(96.12% 0 0)` |
| Sidebar | Narrow floating panel, fine border, rounded corners | 200 px panel with 10 px corners |
| Gallery | Four columns, landscape previews, compact metadata | Four columns, 12 px gaps, 1.9:1 previews |
| Card labels | Small regular titles and bordered category chips | 13 px titles, 10 px chips, creation-date footer |
| Search | White dialog with search/Esc row, thumbnails, right-aligned tags | 640 px palette constrained to viewport width |
| Type | System sans serif; exact face unverified | Platform font stack with Segoe UI on Windows |

The grid reduces its column count as its container narrows. The breakpoints
follow the space needed for roughly 220 px cards, gaps, and metadata. The mobile
sidebar becomes a drawer; its top toolbar keeps navigation and capture visible.

## Motion

The reference's motion is brief and restrained. The dramatic zoom between
approximately 9 and 13 seconds is presentation-camera movement in the video.

| Interaction | Measured evidence | Implemented behavior |
| --- | --- | --- |
| Open search | First animated frame at 16.250 s; settled near 16.400 s | 160 ms ease-out, opacity 0 to 1, scale .96 to 1, y -8 px to 0 |
| Search backdrop | Canvas lightens and becomes blurred during opening | 160 ms white veil transition, 50% opacity, 8 px blur |
| Hover card | Small lift and soft shadow, settled in about 150 ms | 2 px upward movement over 150 ms |
| Hover controls | Trash and source-domain pill appear rapidly | 100 ms opacity transition |
| Category loading | Variable skeleton/text/image latency, about 100–700 ms | Immediate local filtering; entering cards fade without artificial waiting |

The CSS tokens `--motion-fast`, `--motion-hover`, and `--motion-reveal` document
the timings. Both the device preference and the app's **Reduce motion** setting
disable animated transitions. Keyboard search keeps the opening motion when
reduced motion is off.

## Files and scope

You can adjust the shell in `src/library-shell.css` and cards/search in
`src/library-cards.css`. Shared semantic colors live in `src/styles.css`.
`App.tsx` retains the existing persistence and action callbacks; `Gallery.tsx`
and `SearchPalette.tsx` provide the new card and search layouts.

The app uses your existing references, tags, collections, and local storage.
Saved links without a downloaded asset retain an honest text preview. The
reference's Notion database, Raycast extension, and automatic categorization
service are outside this interface replacement. Dark mode and the source
inspector adapt the shared visual system; those screens are not demonstrated in
the source video.

## Verification

The browser checks use a newly initialized sample library at
`http://127.0.0.1:1420/`, separate from the native library. The preview retains
the sample references after reversible checks.

- Category filtering, clearing filters, and sidebar collapse/expand work.
- Search supports empty results, matching tags, arrows, Enter, and Escape.
- Source inspection and favorite toggling work.
- Hover trash clears selection; the reference can be restored from Trash.
- Display options filter source types, and the capture dialog remains reachable.
- Light/dark themes render correctly; reduced motion reports zero-duration card
  transitions and no palette animation.
- Desktop and 390 px phone layouts were visually inspected. The phone document
  width equals its viewport width, with no horizontal overflow.
- Mobile navigation reaches learning pages, including their search field.
- The production build, lint, and all 12 existing tests pass, including semantic
  color-contrast tests.

This verification covers the browser interface. A native installer was not
rebuilt for this interface change.
