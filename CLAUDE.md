# Recife Sketch — Project Instructions

Recife Sketch is an AI-powered infinite whiteboard tutor for Year 7–11
students. These are the permanent product and engineering requirements for
this repository. They do not expire at the end of a phase — re-read this
file at the start of future work here.

## Repository layout note

`RecifeAI/` in this working directory is the **existing Recife AI web
app** (the marketing site + study-tools product), cloned here for
reference. It is **strictly read-only**: never edit it, never copy its
secrets/credentials/user data, and never treat its code as something this
project ships. Its verified, reusable design language has already been
extracted into `DESIGN_SYSTEM.md` — consult that file instead of
re-reading `RecifeAI/` source for styling decisions.

(The original task briefing referred to this reference app as living at
`C:\Projects\recife-original`; that path does not exist on this machine —
the actual app is nested at `RecifeAI/` inside this repo instead. Treat
`RecifeAI/` as the canonical location going forward.)

All new Recife Sketch product code lives at the root of this repository,
as a separate app from `RecifeAI/`.

## Product requirements (permanent)

- Recife Sketch's primary interface is an **infinite editable whiteboard**.
  The AI teaches by progressively drawing figures, diagrams, labels,
  equations, arrows, graphs and annotations onto it.
- **Desktop layout:** ~75% whiteboard, ~25% collapsible AI chat panel,
  docked right.
- Students must be able to **draw, select, erase, pan and zoom** on the
  whiteboard themselves.
- The AI must create **arbitrary illustrations using editable drawing
  primitives** — never static generated images, and never a hardcoded
  library of subject-specific diagrams it picks from.
  - Exception (approved by the owner, 2026-10-17): a **component kit** of
    standard lab apparatus (`draw_apparatus`: beaker, flasks, tubes,
    burette, thermometer, Bunsen burner, tripod & gauze, clamp stand…) is
    allowed — like circuit symbols, these are individual components
    generated as editable shapes from parameters (position, size, fill),
    which the AI composes into setups itself. Whole canned diagrams or
    lessons remain forbidden.
- The whiteboard **persists across chat turns**: follow-up questions must
  be able to modify existing objects on the board, not just add new,
  disconnected ones.
- **Deterministic plotting** for mathematically precise graphs (e.g. a
  charting/plotting library driven by structured parameters). **Never
  execute arbitrary model-generated code** to produce a graph or diagram.
- The AI provider is **configurable**, not hardcoded into the
  architecture — the initial provider is a config choice, not an
  assumption baked into call sites.
- API keys must be protected (server-side only, never shipped to the
  client), with usage limits and cost-minimizing inference choices.
- The app inherits the **verified Recife AI design language**
  (`DESIGN_SYSTEM.md`), adapted to a whiteboard-first layout — it is a
  visual sibling of Recife AI, not a visual departure from it.

## Out of scope

Flashcards, payments, quizzes, analytics. Do not add these even
incidentally while building whiteboard/chat/AI features — if a task seems
to require one of these, stop and raise it rather than building it in.

Brought into scope by the owner (2026-10-17): **authentication** (Supabase
Auth — personal-email accounts plus administrator-issued student alias
accounts, school email domains blocked server-side) and a **minimal
student dashboard** (start / list / rename / delete saved whiteboards,
account settings, sign out). Keep both minimal: no social features,
and collect no personal data beyond what sign-in needs (no real names).
The owner also approved (2026-10-17) a minimal **admin page** (`/admin`) for
managing student alias accounts only (create, reset password, delete), visible
only to accounts with the server-set `app_metadata.role = "admin"` flag. Keep
it to alias management; no analytics or student-content access.

## Tech stack (required)

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, tldraw, Zod, and
server-side LLM integration. See `DESIGN_SYSTEM.md` for the specific
design tokens (colors, type scale, radii, shadows, motion) to carry into
the Tailwind/shadcn setup.

## Engineering rules

- Prefer simple, maintainable, production-quality implementations over
  speculative abstraction.
- Use installed Claude Code plugins and specialist tools where useful.
- Preserve existing working code — don't rewrite something that already
  works as a side effect of an unrelated task.
- Work autonomously on routine engineering decisions; stop and ask for
  anything listed below under "Requires authorization."
- Run the relevant checks (typecheck/lint/tests/build, as applicable)
  after each phase of work, and report their actual results.
- **Never claim a test passed, or a feature works, without having
  actually run it.** If something wasn't verified, say so explicitly.
- At the end of each phase, summarize: changed files, what was tested and
  how, outstanding issues, and the next phase.

## Requires authorization (stop and ask first)

- Activating any paid service or external API.
- Entering or generating credentials/secrets.
- Any irreversible change (e.g. destructive data operations).
- Public deployment.
- Anything else whose blast radius extends outside this local repo.

## Project plan

See `PROJECT_PLAN.md` for the phase breakdown and completion checklist.
