# Recife Design System (extracted from Recife AI)

Source: `RecifeAI/` (the existing Recife AI web app, nested inside this
working directory — see note in `CLAUDE.md`). This document records only
verified decisions, each with its source file. Recife Sketch reuses these
tokens and conventions, adapted to a whiteboard-first layout; it does not
copy page-level components.

Stack in the source app: Vite + React 19 + TypeScript + Tailwind CSS v4
(CSS-first `@theme`, no `tailwind.config.js`). No component library
(no shadcn/ui, no Radix) — every control is hand-rolled Tailwind.

## 1. Design tokens

Defined in `RecifeAI/src/index.css:9-34` as Tailwind v4 `@theme` custom
properties. This is the single source of truth in the original app.

```css
--color-ink: #18181b;              /* primary text */
--color-ink-secondary: #52525b;     /* secondary text */
--color-ink-muted: #8b8b94;         /* captions, meta */
--color-ink-faint: #d4d4d8;         /* faint/disabled text, hairlines */

--color-surface: #ffffff;           /* card/panel background */
--color-surface-subtle: #fafafa;    /* subtle recessed background */
--color-surface-sunken: #f5f5f6;    /* sunken wells (progress track bg) */

--color-border-subtle: #ececed;
--color-border: #e4e4e7;

--color-accent: #2563eb;            /* Tailwind blue-600 — the one reserved accent */
--color-accent-subtle: #eff6ff;     /* Tailwind blue-50 */

--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-xl: 18px;

--shadow-soft: 0 1px 2px rgba(24,24,27,0.04), 0 4px 14px rgba(24,24,27,0.05);
--shadow-popover: 0 8px 24px rgba(24,24,27,0.10), 0 2px 6px rgba(24,24,27,0.05);

--ease-premium: cubic-bezier(0.16, 1, 0.3, 1);
```

The CSS comment above this block (`index.css:5-7`) states the intent
directly: "a small set of ink/surface neutrals, one reserved accent, and
consistent radius/shadow/easing so every page reads as one product." Treat
this as the design philosophy to preserve in Recife Sketch.

**Note on raw Tailwind colors:** outside the token set, components also use
raw Tailwind gray/blue/red/green/amber utilities directly (see §5). The
`ink`/`surface` tokens and raw `gray-*`/`blue-*` utilities co-exist in the
source app rather than being fully unified — Recife Sketch should
standardize on the token names where a token exists, and fall back to the
same raw Tailwind scale (gray for neutrals, blue for accent, red/green/amber
for status) elsewhere, rather than introducing a third palette.

## 2. Typography

- **Font:** Inter, loaded via Google Fonts
  (`RecifeAI/src/index.css:2`, `RecifeAI/index.html:9`), with
  `system-ui, -apple-system, sans-serif` fallback
  (`RecifeAI/src/index.css:47`). No secondary/display font.
- **Monospace:** `ui-monospace, 'JetBrains Mono', 'Fira Code', monospace`
  for code (`RecifeAI/src/index.css:388`).
- **Headline scale** (landing hero, `RecifeAI/src/components/Hero.tsx:13`):
  42px mobile → 58px `sm` → 72px `lg`, tight line-height (0.98–1.05) and
  negative tracking (`-0.03em`), `font-bold`.
- **Body copy:** 17px with `leading-relaxed`
  (`RecifeAI/src/components/Hero.tsx:18`); long-form editor body text is
  17px/1.85 with `-0.006em` tracking (`RecifeAI/src/index.css:280-286`).
- **Captions/meta:** 12–13px, `--color-ink-muted`
  (`RecifeAI/src/index.css:75-79`).
- **Chat/panel UI text** runs smaller throughout —13–15px for messages,
  11.5–13px for labels (`RecifeAI/src/components/AIAssistantPanel.tsx:64-86`).
- Font smoothing is forced on: `-webkit-font-smoothing: antialiased`
  (`RecifeAI/src/index.css:37`).

## 3. Surfaces, cards, borders

- Standard card: `.surface-card` = white surface, 1px
  `--color-border-subtle`, `--radius-lg` (`RecifeAI/src/index.css:85-89`).
- Elevated card variant seen directly in components: `rounded-2xl
  bg-surface p-5` with `boxShadow: var(--shadow-soft)`
  (`RecifeAI/src/components/Features.tsx:37`).
- Hover lift on interactive cards: `translateY(-2px)` + stronger shadow +
  border darken, 180ms ease (`.card-hover`, `RecifeAI/src/index.css:217-225`).
- Popovers/menus use `--shadow-popover` and scale-in entrance animations
  (§6).

## 4. Buttons

Two patterns observed, both hand-built (no shared `<Button>` component in
the source app):

- **Primary (pill) CTA** — full rounded, accent fill, lift-on-hover:
  `h-[45px] px-[18px] rounded-full bg-blue-600 text-white hover:bg-blue-700
  hover:-translate-y-[1.5px]` with a tinted drop shadow
  (`RecifeAI/src/components/Navbar.tsx:92-96`).
- **Rectangular CTA** (pricing cards): `rounded-xl py-3.5 px-8
  font-semibold`, light-on-dark or dark-on-light depending on card contrast
  (`RecifeAI/src/components/Pricing.tsx:47`, `:73`).
- **Ghost/text button:** no background, muted gray text that darkens on
  hover (`RecifeAI/src/components/Navbar.tsx:86-91`).
- **Press feedback:** `.btn-press:active { transform: scale(0.96) }`, 80ms
  (`RecifeAI/src/index.css:229-232`) — applied to most buttons via class.
- All transitions target 150–220ms with `ease`/`ease-out`, never longer.

Recife Sketch should formalize these as shadcn/ui `Button` variants
(`default` = pill accent, `secondary`/`outline` = rectangular, `ghost` =
text) rather than inventing a new taxonomy.

## 5. Color usage in practice

Tallied across `src/components/**` and `src/pages/**`
(most-frequent utility classes):

| Role | Classes | Frequency pattern |
|---|---|---|
| Primary text | `text-gray-900`, `text-gray-800` | high |
| Secondary/meta text | `text-gray-400`, `text-gray-500`, `text-gray-600` | highest |
| Neutral fills | `bg-gray-50`, `bg-gray-100` | highest |
| Accent (brand/interactive) | `bg-blue-600`, `text-blue-600`, `bg-blue-50` | high, reserved for CTAs, active nav, links |
| Destructive/error | `bg-red-50`, `text-red-500`/`text-red-600` | moderate |
| Success | `bg-green-50`, `text-green-600`/`text-green-700` | moderate |
| Warning | `bg-amber-50` | low |

Blue is deliberately scarce and reserved for interactive/brand moments —
confirmed by the index.css comment in §1. Red/green/amber are status-only,
never decorative.

## 6. Motion

All custom animation is defined in `RecifeAI/src/index.css:96-702` using
the shared `--ease-premium` curve (`cubic-bezier(0.16, 1, 0.3, 1)`) almost
everywhere, at short durations:

| Animation | Duration | Use |
|---|---|---|
| `popover-in` / `context-menu-in` | 110–120ms | menus, popovers scale+fade in from a corner |
| `ai-panel-in` | 180ms | AI panel open |
| `panel-in` / `fade-in` | 200ms | auth overlay |
| `page-in` | 240ms | page transitions |
| `step-in` | 420ms | landing product-preview step change |
| `rise-in` | 380ms | staggered list items (flashcards) |
| `bottom-sheet-in` / `drawer-in` | 220–260ms | mobile sheets/drawers |

`prefers-reduced-motion: reduce` collapses fade/panel animations to 1ms
(`RecifeAI/src/index.css:146-152`) — Recife Sketch must carry this
accessibility behavior forward for any custom animation it adds.

## 7. Navigation

Floating/inset top nav, not a full-width bar: rounded `20px` pill
container inset from the viewport edges, glassmorphic
(`backdrop-filter: blur`), border and shadow strengthen on scroll
(`RecifeAI/src/components/Navbar.tsx:48-60`). Active section link gets
`text-blue-600 bg-blue-50/80`; inactive links are gray with a subtle hover
background (`:73-77`).

This exact floating-pill chrome is a marketing-page pattern; it does not
map directly to an app shell. For Recife Sketch's whiteboard app shell, the
reusable pieces are the *tokens and interaction feel* (pill shape for
floating controls, glass blur for overlay toolbars, blue-600 active state),
not the literal landing nav.

## 8. Icons

`lucide-react` is the icon library, used throughout (e.g.
`RecifeAI/src/components/AIAssistantPanel.tsx:10-13`). Use the same
library in Recife Sketch for visual consistency — it is also shadcn/ui's
default icon set, so no conflict with the new stack.

## 9. Responsive conventions

- Mobile-first; breakpoint usage is almost entirely `sm:` (the dominant
  breakpoint), with `md:` for nav/layout switches and `lg:` sparingly for
  hero-scale typography.
- Touch targets: explicit `.tap-target` utility enforcing the 44px Apple
  HIG minimum (`RecifeAI/src/index.css:689-694`).
- Form inputs are forced to `font-size: 16px` on screens ≤767px to prevent
  iOS Safari auto-zoom (`RecifeAI/src/index.css:698-700`).
- Safe-area insets handled explicitly for notch/home-indicator devices via
  `.pt-safe`/`.pb-safe`/etc. (`RecifeAI/src/index.css:637-640`) and a
  dedicated mobile tab-bar height constant (`:644-652`).

Recife Sketch is desktop-first per its own requirements (75/25 whiteboard
layout), but these mobile-safety conventions (tap targets, safe-area
insets, 16px form inputs) should still be reused wherever a touch viewport
is supported.

## 10. What Recife Sketch reuses vs. does not

**Reuse directly:**
- The full token set in §1 (colors, radii, shadows, easing).
- Inter typeface + the monospace fallback stack.
- `lucide-react` as the icon library.
- The `--ease-premium` curve and short-duration animation philosophy (§6),
  including the `prefers-reduced-motion` behavior.
- Button variant taxonomy (§4), reimplemented as shadcn/ui variants.
- Mobile-safety utilities (§9) if/when a touch viewport is supported.

**Do not reuse:**
- Any specific page or feature component (flashcards, study plan,
  onboarding, notes editor, etc.) — out of scope per `CLAUDE.md`.
- The floating marketing navbar as a literal component — only its visual
  language (§7).
- `src/lib/openai.ts`'s client-side OpenAI call pattern
  (`dangerouslyAllowBrowser: true`, API key in a `VITE_`-prefixed env var
  exposed to the browser). This is a security anti-pattern the original
  app uses for its landing/demo AI features; Recife Sketch's permanent
  requirements mandate server-side LLM integration with protected API
  keys, so this must not be replicated.
