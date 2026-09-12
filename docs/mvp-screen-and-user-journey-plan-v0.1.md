# MVP screen and user-journey plan v0.1

This brief turns the technical blueprint into the MVP's major product surfaces
and end-to-end journeys. It defines critical interactions and states without
committing to layouts, component positions, or a final visual system.

The product has two connected loops: users revisit saved references, and they
learn from those references using precise domain language. Onboarding begins the
first loop immediately by helping the user author a real local workspace and
save a first source.

## Feature summary

The product is a local-first reference and learning workspace for a learning
designer-developer. It helps the user:

- Capture and revisit design, project, and idea references.
- Inspect the useful part of a source rather than treating every reference as a
  flat bookmark.
- Ask grounded questions about one source or a labeled set of sources.
- Learn the accepted vocabulary for an observed effect, movement, pattern, or
  implementation technique.
- Turn an answer into durable personal knowledge through lessons, notes, and
  saved vocabulary.

AI learning is part of the shipped MVP, but model access is optional at runtime.
The library, source viewer, organization, and search remain useful without a
provider or network connection.

## Primary user action

The central action is moving from a saved source to a clearer understanding of
what it shows and how to apply it. The product should preserve source context as
the user moves through this loop:

```text
Find or capture a source
        ↓
Inspect the relevant part
        ↓
Ask with the source attached
        ↓
Learn the term, mechanism, and implementation approach
        ↓
Save the useful knowledge and return to the source later
```

The product is source-first rather than chat-first. A blank question box may be
available, but the user should always understand which saved evidence grounds
the question.

## Design direction

The product should feel spatial, fluid, and exploratory.

- **Spatial:** Sources, selected regions, related references, and learning
  artifacts should feel like places in one continuous workspace rather than
  disconnected records.
- **Fluid:** Moving from library to source to question to lesson should preserve
  context. State changes should feel continuous and reversible.
- **Exploratory:** The product should encourage following relationships,
  comparing sources, learning a neighboring term, and returning without losing
  the original path.
- **Authored:** Every meaningful preference should produce a visible and
  persistent consequence. The user should feel that the workspace reflects
  their interests, tools, and source material.
- **Grounded:** The source remains visible or readily recoverable. The product
  distinguishes observation, inference, uncertainty, and domain-backed terms.

Motion should explain continuity, hierarchy, and state change. It should not
decorate routine interactions or delay access to source material. All essential
flows must work with reduced motion.

## Screen architecture

The MVP needs a small set of durable destinations and several scoped working
surfaces. This is an information-architecture decision, not a layout decision.

- **Library** is the home for saved sources. Inbox, all items, collections,
  favorites, archive, and trash are views of the same library.
- **Learning** is the home for saved lessons and personal vocabulary.
- **Settings** owns workspace preferences, provider connections, capture policy,
  privacy, storage, backup, restore, and diagnostics.
- **Source workbench** is the focused state for one saved item.
- **Ask workspace** is attached to a working context that contains one or more
  source targets.
- **Search results** explicitly distinguish source results from learning
  results.
- **Capture** is an entry interaction shared by onboarding, the library, drag
  and drop, clipboard, file import, URL entry, and the browser extension.
- **Recovery surfaces** interrupt ordinary navigation only when the application
  cannot safely open, mutate, restore, or relocate the library.

## Major screens and critical interactions

Each screen family below identifies the user promise, the interactions required
for the MVP, and the states that the implementation must expose.

### Authored onboarding

Onboarding creates the real local workspace. It should feel like the user's
first productive session, not a form that precedes the product.

**User promise:** Every response changes something the user can see, persists
immediately, and remains editable after onboarding.

**Critical interactions:**

- Introduce the workspace as local and account-free.
- Ask for a display name and working context only when those answers personalize
  the experience.
- Let the user identify the design domains they want to study. Reflect those
  choices through relevant language packs, examples, and question starters in
  the live workspace preview.
- Let the user identify tools they use. Reflect those choices in the type of
  recreation guidance previewed beside later questions.
- Explain capture, storage, and network choices at the moment they change the
  previewed source behavior.
- Capture a first real URL, file, image, or note through the production capture
  use case. Show its durable saved state independently from enrichment.
- Complete into the same populated library the user has been shaping.
- Persist progress after each accepted choice and resume after restart.
- Offer AI connection when the user first chooses **Ask**, not as a gate before
  entering the library.

**Required states:** New local workspace, partially completed onboarding,
resumed onboarding, first-source capture in progress, source saved and
enriching, recoverable capture failure, and completed workspace.

**Implementation contract:** The preview reads `WorkspaceProfile` and real item
data. It must not use onboarding-only mock entities that disappear at
completion.

### Library workspace

The library is where the user surveys, revisits, and organizes saved sources.

**User promise:** The durable item appears immediately after capture, remains
findable during enrichment, and clearly communicates what is locally available.

**Critical interactions:**

- Browse Inbox, all items, collections, favorites, archive, and trash as views
  of one library.
- Add a URL, file, image, text note, or clipboard content through the shared
  capture flow.
- Distinguish **Saved locally** from **Preparing preview** and from a failed
  representation.
- Open a source without waiting for unrelated enrichment.
- Select sources for organization, archive, trash, or a multi-source question.
- Add and remove tags, flat collection membership, favorite state, and basic
  source relationships.
- Restore soft-deleted sources before permanent trash removal.
- Keep partial and reference-only sources usable rather than hiding them as
  failures.

**Required states:** Empty library, populated library, capture pending, saved
and enriching, partial enrichment failure, reference-only item, archived item,
trashed item, unavailable local representation, and unavailable library volume.

### Source workbench

The source workbench lets the user inspect one item deeply and turn a useful
part of it into question context.

**User promise:** The source, its provenance, and the selected evidence remain
understandable while the user annotates or asks about it.

**Critical interactions:**

- View the best safe local representation and its capture provenance.
- Open the original source externally when the user chooses.
- Edit title, description, note, tags, collection membership, favorite state,
  and basic relationships.
- Choose the whole source or a supported image crop, PDF page or region, text
  selection, frame, or time range.
- Start **Ask about this** with the selected target attached.
- Add the target to an existing question context for source comparison.
- Explain when the local representation is insufficient and offer an explicit
  preserve or bounded-fetch action under the user's policy.
- Preserve annotations and source metadata if a representation fails.

**Required states:** Fully local source, remote preview allowed, reference-only
source, representation preparing, independently failed representation, stale
selection, archived source, and source pending permanent deletion.

### Ask workspace

The Ask workspace supports grounded learning questions about one or several
saved sources.

**User promise:** The user knows what the model will receive, can trace the
answer back to the source context, and learns language they can reuse.

**Critical interactions:**

- Begin with one source target or add selected library sources to the working
  context.
- Give each target a stable label such as A, B, and C for the current turn.
- Show the source, representation, and selected region or range represented by
  each label.
- Let the user remove, replace, or reorder working targets before sending.
- Offer free-form questions and learning-oriented starters: **Name this**,
  **Describe it precisely**, **Explain why it works**, and **How would I
  recreate it?**
- Set up a provider at the first moment of value through a user-owned API key,
  local runtime, compatible endpoint, router, or Codex-managed sign-in.
- Review the provider, model, and prepared evidence before a remote send.
- Reject unsupported target and model combinations before sending content. Name
  the affected source label rather than failing the whole interaction vaguely.
- Stream progress without exposing raw provider output as the saved answer.
- Present observations, domain vocabulary, explanation, recreation guidance,
  and uncertainty as distinct parts of one answer.
- Link every source-specific or comparative claim to the correct source label
  and evidence anchor.
- Save a term to personal vocabulary, save the answer as a lesson, add a note,
  or ask a follow-up against the same context snapshot.
- Treat the sent target set as immutable. Changes after send prepare a new turn
  and do not rewrite the old answer's evidence.

**Required states:** No provider connected, provider connection in progress,
working context, evidence preparation, send review, streaming, complete answer,
cancelled request, authentication failure, rate limit, unsupported capability,
malformed answer, stale anchor, and source removed after a lesson was saved.

### Search and results

Search lets the user rediscover both source material and learning artifacts
without blending their meanings.

**User promise:** The result explains why it matched and opens at the relevant
source or lesson context.

**Critical interactions:**

- Search library items by normalized title, description, notes, source fields,
  tags, and collection names.
- Search lessons and personal vocabulary through an explicit Learning scope.
- Show the matched field or safe highlighted fragment.
- Apply item-state and organizational filters without changing the underlying
  source records.
- Open a source result in the source workbench.
- Open a learning result with its saved context labels and evidence anchors.
- Communicate when an old lesson remains available but its source anchor no
  longer resolves.

**Required states:** No query, active query, results, no results, indexing or
rebuild unavailable, and matched lesson with unavailable evidence.

### Learning library

The Learning destination turns one-off model answers into a revisitable body of
personal knowledge.

**User promise:** A saved lesson retains what was learned, which sources
grounded it, and whether its terminology is domain-backed or provisional.

**Critical interactions:**

- Browse saved lessons independently from provider availability.
- Reopen a lesson with its question, context labels, normalized answer, provider
  snapshot, and evidence anchors.
- Browse personal vocabulary with canonical terms, aliases, definitions,
  distinctions, source examples, and user notes.
- Distinguish **Glossary-backed** terms from **Candidate terms**.
- Return from a lesson or term to every still-available source anchor.
- Ask a new question using the old lesson's sources without mutating the saved
  turn.
- Edit personal notes and remove saved learning artifacts without altering the
  source library.

**Required states:** No saved learning, saved lessons, saved vocabulary,
candidate term, updated domain-pack interpretation, disconnected provider, and
unavailable source anchor.

### Settings, connections, and data

Settings makes onboarding choices and system boundaries legible after first
use.

**User promise:** The user can understand and change how the local workspace,
capture, model access, and portable data behave without exposing credentials.

**Critical interactions:**

- Edit identity, working context, domain interests, and tool preferences from
  onboarding.
- Configure capture, preservation, remote preview, metadata, and network policy.
- Add, test, replace, or remove a provider profile while storing secrets only in
  the operating-system credential store.
- Sign in to and out of the isolated Codex connector without exposing a ChatGPT
  token to the application.
- View provider authentication, model capability, and availability as separate
  states.
- Change the active model deliberately; never silently fall back to another
  provider or model.
- Back up, restore, export, relocate, and inspect the local library.
- Generate redacted diagnostics that exclude keys and source content.
- State clearly when confidentiality depends on operating-system and volume
  security rather than application-level encryption.

**Required states:** Connected, disconnected, invalid credential, capability
mismatch, local model unavailable, Codex signed out, backup in progress,
verified backup, staged restore, relocation failure, and maintenance lock.

### Recovery and blocking states

Recovery is a system behavior rather than a content destination. It appears only
when continuing normally could hide, split, or corrupt the user's library.

**Critical interactions:**

- Explain an unavailable removable library without creating a hidden fallback
  library.
- Explain migration or maintenance and prevent conflicting writes.
- Validate a restore or relocation before switching the active library.
- Retain the previous library if a staged replacement cannot open.
- Offer safe retry, choose-library, diagnostic, or return actions appropriate to
  the actual error.
- Keep provider failures inside the Ask workspace because they do not block the
  local library.

## Cross-screen interaction rules

These rules preserve the product contract across every screen family.

- A durable save acknowledgement is separate from enrichment progress.
- A source remains useful even when one representation or AI provider fails.
- The application never silently sends an authenticated URL, drops a question
  target, changes a model, or merges duplicate-looking items.
- Source labels and evidence snapshots become immutable when a question is
  sent.
- Destructive source actions remain reversible until the user permanently
  empties trash.
- Long-running processing, backup, restore, and relocation expose durable state
  and recover after interruption where the technical plan permits.
- Provider setup happens in context at the first Ask and remains manageable in
  Settings.
- Terms backed by a versioned local language pack look different from terms the
  model merely proposes.
- Keyboard access, semantic controls, focus recovery, readable status text, and
  reduced-motion behavior are acceptance criteria, not polish tasks.

## End-to-end MVP journeys

These journeys define the critical paths the MVP must support. They do not
prescribe screen positions or navigation chrome.

### First launch becomes first use

1. The application creates a local library and resumable workspace profile.
2. The user supplies identity and working context; the live workspace reflects
   the answer immediately.
3. The user chooses domains and tools; relevant language and recreation
   examples appear in the preview.
4. The user chooses capture and privacy preferences with a visible explanation
   of the resulting behavior.
5. The user captures a first real source.
6. The app confirms the durable save, then shows enrichment independently.
7. Completion opens the populated library the user has already authored.
8. If the user exits at any point, the app resumes from persisted progress and
   keeps the saved source.

### Capture and triage a reference

1. The user captures from the desktop or browser extension.
2. The shared capture use case commits the minimal item and jobs.
3. The capture surface confirms **Saved locally** without waiting for
   enrichment.
4. The source appears in Inbox with its representation state.
5. The user opens it, edits context, assigns organization, or leaves it for
   later.
6. If enrichment fails, the minimal item remains usable and offers an explicit
   retry or preservation action when appropriate.

### Revisit and annotate a saved source

1. The user browses or searches the Library scope.
2. A result explains why it matched.
3. The source opens with its best safe representation and provenance.
4. The user examines a region or range and adds a note, relationship, tag, or
   collection membership.
5. The user returns to the library without losing the durable changes.

### Learn the language for one source

1. The user selects a visible effect, movement, text passage, page region, or
   time range.
2. They choose **Name this** or write a question in their own words.
3. If no model is connected, the app explains the available connection paths at
   this moment of value.
4. The app prepares and previews the selected evidence.
5. The user sends deliberately.
6. The answer names the domain term, explains why it applies, contrasts nearby
   terms, and links claims to the selected evidence.
7. The user saves the term, annotates the source, or asks how to recreate the
   effect against the same anchored context.

### Compare and implement from sources A, B, and C

1. The user starts from one source or selects several sources in the library.
2. The Ask workspace labels the targets A, B, and C and shows what each label
   represents.
3. The user asks how to implement a shared or contrasting behavior.
4. Evidence review shows the prepared content for every label and identifies
   the provider and model.
5. Capability checks either accept every target or identify the incompatible
   label before anything is sent.
6. The answer separates per-source observations from comparative inference and
   implementation guidance.
7. Every comparative claim links to the applicable source anchors.
8. The saved lesson preserves the sent context snapshot even if the working
   context or original sources later change.

### Return to learned language

1. The user searches the Learning scope or browses personal vocabulary.
2. A lesson or term opens with its definition, distinctions, notes, and source
   anchors.
3. The user returns to an available source or starts a new question with the
   lesson's old source set.
4. If an anchor is unavailable, the lesson remains readable and marks the
   missing evidence without inventing a replacement.

### Recover without losing the core product

1. A provider fails, the library volume is unavailable, or maintenance is in
   progress.
2. The app classifies the failure at the boundary that owns it.
3. A provider failure stays inside Ask; the source library remains available.
4. A library safety failure blocks conflicting writes and presents the next
   safe action.
5. Retrying or restarting reconciles staged work according to the technical
   plan rather than creating duplicate items or hidden libraries.

## Content requirements

Product language should teach system state and domain language with the same
care. Important copy contracts include:

- Use **Saved locally** only after the durable capture transaction commits.
- Use **Preparing preview** for enrichment that is not required for durability.
- Use **Ask about this** and **Add to question** to make source attachment
  explicit.
- Use **Review what will be sent** for provider, model, and evidence disclosure.
- Use **Glossary-backed** and **Candidate term** as visible epistemic labels.
- Use **Source changed since this lesson** or **Source no longer available**
  when an evidence anchor cannot resolve.
- Name the affected source label in multi-source failures.
- Explain whether a setting affects local storage, network transfer, provider
  access, or only presentation.
- Avoid conversational filler that hides uncertainty or makes a model-generated
  term sound authoritative.

## MVP boundary

The following behavior is required for the interaction model described here:

- Authored, resumable onboarding against a real local workspace.
- Unified capture and visible durable-versus-enrichment state.
- Library views, search, flat collections, tags, notes, favorites, archive,
  trash, restore, and basic relationships.
- A source workbench with supported evidence selection.
- Single- and multi-source Ask with provider setup, evidence review, structured
  learning answers, anchors, lessons, and personal vocabulary.
- Settings for profile, policies, providers, Codex sign-in, portability, and
  diagnostics.
- Recovery behavior for unavailable libraries, maintenance, provider failures,
  restore, and relocation.

The following behavior remains outside the MVP because it does not prove these
journeys:

- Accounts, sync, collaboration, public sharing, and mobile apps.
- Nested collections and automatic AI organization.
- Autonomous agents, provider browsing, model tools, and model-initiated file or
  process actions.
- Required OCR, embeddings, vector search, or automatic batch analysis.
- Authenticated browser-session media transfer.

## Implementation alignment

Screen behavior should be built against the application use cases and durable
states in the technical blueprint.

- Authored onboarding depends on workspace-profile settings and the real capture
  use case.
- Library and source workbench depend on items, representations, organization,
  jobs, storage policy, and search projections.
- Ask depends on ordered analysis targets, evidence bundles, provider profiles,
  domain packs, normalized learning answers, and vocabulary.
- Learning depends on analysis sessions and turns, target snapshots, term
  mentions, and personal terms.
- Settings depends on typed profile, policy, credential, backup, restore,
  relocation, and maintenance use cases.
- Recovery surfaces render stable application error codes and never infer state
  from provider strings or raw database errors.

## Recommended design references

Use the project's design guidance selectively during detailed interaction and
visual design:

- Interaction design guidance for selection, context preservation, reversible
  actions, and source-to-lesson transitions.
- Spatial design guidance for hierarchy and a navigable sense of place without
  turning the product into a canvas by default.
- Motion design guidance for continuity, state change, reduced motion, and
  interruption-safe transitions.
- UX writing guidance for capture durability, AI provenance, uncertainty,
  privacy, and recovery copy.
- Responsive design guidance so context remains understandable when the
  available window narrows.

## Open architecture questions

These questions change implementation or trust boundaries and need owner
decisions before the affected slices are finalized:

- Must the library and backups use application-level encryption, or may the MVP
  rely on operating-system account and volume security?
- Should the first distributable lane be Windows plus Chromium?
- What default storage and network behavior should onboarding author: reference,
  preserve, or a defined smart policy; metadata retrieval on or off; remote
  previews on or off?
- Does capture while the desktop is closed require durable queueing only, or
  immediate background enrichment through a separate daemon?
- Should release builds bundle the pinned Codex runtime, or require a compatible
  installed runtime?
- Must evidence review appear before every remote analysis, or may remembered
  consent apply to a provider profile and source privacy class?

## Confirmation gate

Confirm this brief before detailed layout, navigation chrome, or component work.
Confirmation locks the screen families, interaction contracts, and MVP journeys;
it does not lock visual composition or exact positions.
