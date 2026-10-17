# Recife Sketch — Handoff (2026-10-16)

## Tutor availability diagnosis

Google returned HTTP 503 overload for `gemini-3.1-flash-lite`. `gemini-3.5-flash` answered a tiny request but subsequently also returned 503 for full tutor requests. Configured local `GEMINI_FALLBACK_MODEL=gemini-3.5-flash` (same existing key), used only on server 500/502/503/504 responses within the shared deadline. The fallback does not bypass 429 limits. Headers now carry the key instead of the URL. Added clearer 503 messaging and a retry-question button. Full live tutoring is still blocked by provider overload; do not claim restored service. 267 tests, TypeScript and ESLint pass.

## Spatial-awareness follow-up

- Main `/` already mounts `WhiteboardSection` → `Tldraw`, with the configured license key; the AI uses the same mounted editor through `TldrawDrawingAdapter`. The harness is not the production drawing path.
- At the user's explicit request, removed the main page's hidden-component overrides and custom toolbar. Main `/` now exposes the SDK's native tools, menus, style panel and navigation. Browser screenshot verified: `work/native-tldraw-main.png`. The Recife orb and AI adapter remain attached to this editor.
- `context.ts`, `use-tutor.ts`, `app-shell.tsx`: requests now include viewport, occupied bounds (including student shapes and images), and a clear area to the right of all current content. The prompt distinguishes new topics from edits and requests a camera focused on the current lesson. This improves planning but is not a hard collision guarantee for generated geometry.
- `app-shell.tsx`: comments are announced after all actions in their step complete, allowing actual text/plot bounds to be used.
- `use-floating-comments.ts`, `floating-comments.tsx`, `placement.ts`: initial placement avoids drawing bounds, searches other visible free space, and rechecks open bubbles against current geometry on pan/zoom. A completely full viewport can still force the fallback placement.
- `question-source.ts`: student snapshots include up to 80 exact shape bounds; outlines can use those instead of pixel estimates. A line within a single raster image still requires visual localization.
- `ai-companion.tsx`: question keystrokes stop propagating to canvas shortcuts; Escape closes the panel and IME composition does not submit.
- Verification: 265 tests pass, TypeScript and ESLint pass, production build passes. Main-page browser confirmed native tldraw canvas. Live Gemini graph request returned a temporary-unavailability error, so the revised generation layout is NOT visually signed off. Full mobile/drag/reduced-motion regression remains outstanding. No deploy or push performed in this follow-up.

---

Read `CLAUDE.md` first. Its rules are permanent:
- `RecifeAI/` is read-only.
- Never commit `.env.local` (it holds `GEMINI_API_KEY` and `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`).
- No public deploys and no paid services without the owner's OK.
- Never execute model-generated code.
- Never claim something works without running it.

**State:** last pushed commit is `0bafb08` on `main` (github.com/Ibra084/RecifeSketch). Everything below under "Improvements made" is **uncommitted** in the working tree (`git status`).

Checks on the working tree:
- `npx vitest run`: 263/263 pass.
- `npx tsc --noEmit`: clean.
- `npx eslint src`: clean.
- `next build`: **not run** for these changes.

---

## Improvements made (uncommitted)

### 1. Floating companion replaces the chat sidebar
The permanent chat panel is deleted (`src/components/chat/*`). `src/components/app-shell.tsx` now renders the whiteboard, the floating comments and the companion orb.

- **Orb:** `src/components/companion/ai-companion.tsx` and `use-companion-orb.ts`. A draggable blue orb.
  - States: idle (breathing, motion-safe only), thinking (dots), drawing (pen) and speaking (message icon).
  - Click opens a compact composer. Enter sends, Shift+Enter adds a newline, and Escape collapses it and returns focus.
  - Under 640px wide, the composer docks to the bottom.
  - Uses a 4px drag-vs-click threshold. Arrow keys move the orb 24px (Shift ×3).
  - The user's drag position persists in localStorage (`recife-sketch-orb-v1`).
  - During a turn the orb glides next to the step being explained, then returns home 2.5s after the turn ends.
  - The composer also has: attach image, "Show N closed comments" and "New topic".
- **Tutor hook:** `src/components/companion/use-tutor.ts` replaces `use-tutor-chat`.
  - Phases: idle, thinking, drawing.
  - Short status notes appear beside the orb instead of a chat log.

### 2. Floating contextual comments
Files: `src/components/companion/floating-comments.tsx`, `use-floating-comments.ts` and `src/lib/overlay/comments.ts`.

- Each step's commentary becomes a bubble anchored to that step's first action. It follows the live shape, and disappears if the shape is deleted.
- An SVG connector line and anchor dot link each bubble to its anchor. The line is dashed when the bubble is minimized.
- Controls:
  - **Minimize:** collapses to a 44px chip; tap the chip to reopen.
  - **Close:** never deletes drawings or AI context. Reopen via the orb badge or "Show N closed comments".
  - **Drag:** by the handle, or with the arrow keys (±16px, Shift ×3).
- Turn rules: at most 2 comments open per turn, and the previous turn's comments auto-minimize. The cap is 80 comments, dropping closed ones first.
- Persistence: localStorage key `recife-sketch-comments-v1`, validated with Zod.

### 3. Correct coordinate systems
`src/lib/overlay/coordinates.ts` defines branded `PagePoint`/`PageRect` (canvas) and `ViewportPoint`/`ViewportRect`/`ViewportOffset` (CSS px) types.

- Projection uses `editor.pageToViewport`. The old pins used `pageToScreen` and were offset by the 48px header.
- Placement logic is in `src/lib/overlay/placement.ts`: orb-near-anchor, comment ring placement with collision avoidance, viewport clamping and connector endpoints.

### 4. "Where did I go wrong?" (student-work mode)
- **AI authorship tagging:**
  - The engine wraps each action in `adapter.authored()`.
  - `TldrawDrawingAdapter` tags created shapes with `meta.recifeAi`.
  - `isStudentShape` in `src/lib/drawing/authorship.ts` separates student work from tutor drawings.
- **Capture:** `captureStudentWork` exports a JPEG of the student's work with exact bounds and no padding, so the image maps linearly onto the page region.
- **Prompt:** board mode in `src/lib/ai/question-source.ts` tells the model to:
  - find the **first** incorrect step only;
  - mark it with a thin unfilled outline;
  - give a hint, and not solve or rewrite the whole problem.

### 5. Fixes found during live browser testing (today)
- **Stuck "thinking" forever.**
  - Cause: each Gemini retry got its own 45s timeout, about 180s worst case, and the client had no timeout or cancel.
  - Fix:
    - One shared deadline (`AI_REQUEST_TIMEOUT_MS`) across all retries in `src/lib/ai/gemini-provider.ts`, with a new test `gemini-provider.test.ts`.
    - The client fetch is abortable, with a 60s safety timeout.
    - Stop now works while thinking.
- **Stop button vanished mid-drawing:** it was gated on `state === "drawing"`, which flips to "speaking" during comments. It now shows whenever the tutor is busy.
- **AI outline landed in the wrong place:** the capture included the whole board, so the student's equation was a tiny part of the image. The new `focusedStudentWork()` captures the selection first, then the student work in view, then everything.
- **Comment bubble covered its own outline:** the bubble was placed at step start, before the shape existed, beside a 1×1 point. The new `actionFocusRect()` uses the action's declared geometry instead.

### 6. Smaller items
- `toDisplayMath` renders `^2` as superscripts in comments.
- Prompt rule: each step's commentary appears beside its first action.
- The tldraw license key is wired via `licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}` and verified (no watermark).

---

## What still needs improving (priority order)

1. **Finish real-browser verification.** None of these have been verified since today's fixes:
   - The section-5 fixes: the outline lands on the right line, and the bubble doesn't cover the outline.
   - The orb glides to the anchor and returns home.
   - Minimize, close and reopen (badge and "Show N closed comments").
   - Comment drag (pointer and keys) keeps the connector correct.
   - Positions stay correct after pan/zoom.
   - Persistence across reload.
   - Mobile width (<640px composer docking, 44px touch targets).
   - `prefers-reduced-motion`.
   - Full keyboard-only flow.

   Then run `next build`, commit and push.
2. **Spatial accuracy of AI marks is still guesswork.** The model estimates fractions of an image. A more robust approach is to send the student's shapes as structured data (id, type, page bounds, text content; split text shapes into per-line bounds), and let the model reference a shape or line id to outline. The client then draws the outline from real bounds, so no pixel guessing is needed.
3. **Comment anchors for text and equations** are still a 1×1 point at step start, because their size is unknown until rendered. Re-run placement once the step's shapes exist (or after the step completes), and keep the user's manual offset if they've dragged the bubble.
4. **Keystrokes can leak into tldraw shortcuts.** If focus misses the composer textarea, typing triggers tool shortcuts (stray rectangles, eraser). Guard this, e.g. stop key propagation from the companion, and verify focus after expanding.
5. **Legacy AI shapes.** Shapes the AI drew before authorship tagging existed have no `meta.recifeAi` and are treated as student work. Consider a one-time migration, or a heuristic using `recifeObjectId`.
6. **No UI-level tests.** All 263 tests are lib/unit tests. Add Playwright (or React Testing Library) coverage for:
   - orb drag vs. click;
   - comment minimize, close and reopen;
   - projection after pan/zoom.
7. **Latency.** Gemini (`gemini-3.1-flash-lite`) varies from 2–20s+ and sometimes returns 503s. Consider streaming or progressive rendering of steps (an open item from the earlier engineering review), and a visible "still thinking…" message after about 10s.
8. **Earlier engineering review.** It had 9 findings:
   - invalid diagrams passing the quality gate;
   - text fitting;
   - edit actions and coordinates;
   - connector bindings;
   - persisted board vs. AI context;
   - playback outcomes;
   - plot discontinuities;
   - progressive rendering;
   - repair prompt and provider.

   Audit which of these are fully addressed in code before assuming they're done.
9. **Before any deployment** (needs the owner's approval):
   - The rate limiter is in-memory, per process, and keyed on a spoofable `x-forwarded-for`.
   - Usage limits and cost caps need review.
10. **Dev machine memory.** The dev server was killed by the host for low memory during testing. Keep this in mind for long browser sessions and builds.

## Useful commands
```
npm run dev            # http://localhost:3000
npx vitest run
npx tsc --noEmit
npx eslint src
npx next build
```
