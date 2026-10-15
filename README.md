# Recife Sketch

An AI-powered infinite whiteboard tutor for Year 7–11 students. A student
asks a question in natural language; a server-side LLM (Google Gemini,
provider-swappable) plans a short lesson and the whiteboard draws it
progressively — real editable shapes, arrows, labels, equations and
plotted graphs, never static images — while a chat panel shows the
teaching commentary alongside the drawing. Follow-up questions can
highlight, move, relabel, or delete objects from earlier in the same
session.

Built with Next.js (App Router), React, TypeScript, Tailwind CSS,
shadcn/ui, [tldraw](https://tldraw.dev) as the whiteboard canvas, and Zod
for end-to-end validation of every AI-generated drawing instruction.

## Running locally

```bash
npm install
cp .env.example .env.local   # then add your own GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

Other scripts: `npm run build` (production build), `npm start` (serve the
production build), `npm test` (Vitest unit/integration suite), `npm run
lint` (ESLint).

Without a `GEMINI_API_KEY` set, the whiteboard, chat UI, and every local
drawing-engine feature still work — the AI endpoint simply returns a
clear "not configured" error instead of a drawn lesson.

## Project docs

- `CLAUDE.md` — permanent product/engineering requirements for this repo.
- `DESIGN_SYSTEM.md` — the verified Recife design language this app reuses.
- `PROJECT_PLAN.md` — phase-by-phase delivery checklist.
