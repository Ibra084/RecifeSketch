# Recife Sketch — Project Plan

Lightweight phase plan for building Recife Sketch. See `CLAUDE.md` for
the permanent requirements every phase must respect, and
`DESIGN_SYSTEM.md` for the visual language each UI phase must follow.
Check off a phase only once its own checklist is actually verified — not
on the basis of code existing.

> **Note on numbering:** actual delivery was driven by separate, more
> detailed phase briefs numbered 1–4 that don't map 1:1 onto the phases
> below (brief Phase 1 covered plan Phases 1+2; brief Phase 2+3 covered
> the drawing/animation half of plan Phase 4; brief Phase 4 covered plan
> Phase 3 plus the non-multi-turn half of plan Phase 4). Checkboxes below
> are reconciled against what was actually verified, not against the
> brief numbers.

## Phase 0 — Inspection & setup (this phase)

- [x] Locate and read the existing Recife AI app source.
- [x] Extract verified design tokens, typography, components, motion and
      responsive conventions into `DESIGN_SYSTEM.md`.
- [x] Write `CLAUDE.md` with permanent product/engineering requirements.
- [x] Write this project plan.
- [ ] Human review of `DESIGN_SYSTEM.md`, `CLAUDE.md`, and this plan.

**No application code, dependencies, or scaffolding in this phase.**

## Phase 1 — Project scaffolding

- [x] Initialize the Next.js + TypeScript app at the repo root (App
      Router).
- [x] Install and configure Tailwind CSS using the tokens from
      `DESIGN_SYSTEM.md` §1 (as Tailwind v4 `@theme` or `tailwind.config`,
      matching current Tailwind tooling).
- [x] Install and configure shadcn/ui; set up `Button` variants per
      `DESIGN_SYSTEM.md` §4.
- [x] Add Inter font + `lucide-react`.
- [ ] Initialize git for this repo (the `RecifeAI/` reference app keeps
      its own separate git history and must not be touched). **Not done —
      no `.git` exists anywhere in this working directory yet.** Flagged,
      not actioned, pending the user's go-ahead.
- [x] Verify: dev server runs, a styled placeholder page renders with the
      correct font/colors.

## Phase 2 — Whiteboard shell

- [x] Integrate tldraw as the whiteboard canvas.
- [x] Build the desktop layout: ~75% whiteboard / ~25% collapsible chat
      panel, docked right.
- [x] Verify student-driven interaction: draw, select, erase, pan, zoom —
      manually tested in a browser, not just compiled.
- [x] Verify the chat panel collapses/expands without disturbing
      whiteboard state.

## Phase 3 — Chat panel & provider-agnostic LLM integration

- [x] Server-side route(s) for LLM calls; no API key ever reaches the
      client bundle (`loadAIConfig` only runs in `src/app/api/tutor/route.ts`
      and `src/lib/ai/*`, never imported from a client component).
- [x] Configurable AI provider (`AIProvider` interface in
      `src/lib/ai/provider.ts`; `GeminiProvider` is the initial, swappable
      implementation).
- [x] Zod schemas for request/response validation at the LLM boundary
      (`teachingPlanSchema`, reusing the Phase 2 `drawingActionSchema`).
- [x] Basic usage/cost guardrails (question-length cap, action-count cap,
      bounded retries, per-client rate limiter, approximate cost estimate
      logged server-side).
- [x] Verify: a chat message round-trips through the server to a real
      (missing-key error path confirmed live) or stubbed (unit-tested)
      provider and renders in the panel. **Full success round-trip against
      the live Gemini API is untested — no `GEMINI_API_KEY` is configured
      on this machine.**

## Phase 4 — AI-driven whiteboard authoring

- [x] Define the structured, editable drawing-primitive schema the model
      emits (shapes/labels/arrows/equations as tldraw-compatible objects,
      validated with Zod) — not free-form code or static images.
- [x] Deterministic plotting path for graphs (parametrized plotting
      library output, not model-generated code execution) — carried over
      from Phase 2's `plot_function`/`plotting.ts`, reused as-is by the AI.
- [x] Implement whiteboard persistence across chat turns (the board is
      never cleared between questions; each turn's object ids are
      namespaced so turns can never collide).
- [x] Implement **follow-up edits** to existing objects (a question that
      must change a previous turn's diagram in place, not just add a new
      one). The client sends a compact board/history summary
      (`src/lib/ai/context.ts`) with every request; the server resolves
      new-object id collisions without ever rewriting a genuine reference
      to an existing id (`resolveTeachingPlanIds`); the engine/adapter
      treat liveness as authoritative so a student deleting or moving an
      AI-created object is handled gracefully instead of crashing or
      silently going stale.

## Phase 5 — Persistent whiteboard intelligence

- [x] Compact, bounded visual + conversation context (not the whole
      tldraw document, not the whole chat transcript) sent with every
      follow-up (`MAX_CONTEXT_OBJECTS = 60`, `MAX_HISTORY_TURNS = 4`).
- [x] Follow-up capabilities (highlight/move/resize/relabel/delete/extend
      existing objects, add new ones) — all implemented in Phase 2/3's
      action protocol; Phase 5's job was making the model aware of real
      existing ids and making id resolution safe, not new action types.
- [x] Stable object ids preserved across turns; only a genuine new-id
      collision gets renamed, and never a reference to existing content.
- [x] Graceful handling of student-made changes to AI-created objects
      (deletion, move) - verified at the engine level with the live
      `FakeDrawingAdapter.simulateExternalRemoval` tests, and the tldraw
      adapter mirrors the same liveness-first logic in
      `getObjectBounds`/`summarizeObjects`.
- [x] Student manual editing is unaffected - the AI protocol can only
      ever address objects *it* created (tracked by id); it structurally
      cannot reference or `clear_region` over a student's hand-drawn shapes.
- [ ] **Real two-question acceptance test against a live model** —
      blocked: no `GEMINI_API_KEY` is configured on this machine. The
      scenario's plumbing (context reaching the model, cross-turn id
      stability, correct id resolution on both a highlight and a delete)
      is covered by an automated scripted-provider test
      (`src/app/api/tutor/acceptance-scenario.test.ts`), but that is
      explicitly **not** the same as a real model choosing to highlight
      the right coil or explain flux correctly. See the phase report.

## Phase 5 — Polish & hardening

- [ ] Apply `DESIGN_SYSTEM.md` motion/animation conventions
      (`--ease-premium`, short durations, `prefers-reduced-motion`
      support) across the new UI.
- [ ] Review cost/rate-limit guardrails under realistic usage.
- [ ] Full manual pass of the golden path + edge cases in a browser.
- [ ] Final `CLAUDE.md`-compliance check: no auth/dashboards/flashcards/
      payments/quizzes/analytics crept in; no paid-service activation,
      credential entry, or deployment happened without authorization.

---

Phases are sequential but not rigidly waterfall — a later phase may
surface a gap in an earlier one; when that happens, fix it in place and
note it in that phase's summary rather than silently deferring it.
