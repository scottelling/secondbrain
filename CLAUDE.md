# CLAUDE.md — Second Brain

## Identity

Second Brain is a unified outliner, timeline planner, and AI thinking tool. It consolidates Legend, Eagle Eye, MD Workbench, and Capture Outliner into one standalone product. Built by Scott Elling. Live at secondbrain.scottelling.com.

## Current State

Single-file React JSX artifact (~5,000 lines) running via Babel in-browser transpilation. Storage is Claude artifact `window.storage`. Auth is mocked. AI chat calls Anthropic API directly from client (only works inside Claude artifact sandbox). Deployed as a single `index.html` on GitHub Pages.

**What works:** Outliner with zoom/collapse/indent, tabs (per-tab view format), drag-and-drop reorder, swipe actions (8 buttons), multi-select, search/filter, 8 node types (Note/Task/Event/Reference/Research/Idea/Project/Recurring), metadata editor, timeline view with drag-to-reschedule, board/kanban view, markdown view, AI chat with queue system, 7 built-in themes + custom themes, text/accent/background customization, copy/format/export, session management with mock auth.

**What needs production wiring:** Real auth (Supabase), real database (Supabase Postgres), API proxy for Claude chat, Stripe billing, Vite build system.

## Tech Stack (Target)

```
Frontend:     React 19 + Vite
Styling:      Inline styles (Purple Rain design tokens) — no Tailwind
State:        React hooks (useState, useCallback, useMemo, useRef)
Auth:         Supabase Auth (email, Google OAuth, Apple Sign-In)
Database:     Supabase Postgres
Storage:      Supabase client SDK
API Proxy:    Vercel Edge Functions
AI:           Anthropic Claude API (via server proxy)
Billing:      Stripe Checkout + Webhooks
Hosting:      Vercel (connected to GitHub repo)
Domain:       secondbrain.scottelling.com
```

## Project Structure (Target)

```
secondbrain/
├── CLAUDE.md
├── package.json
├── vite.config.js
├── vercel.json
├── .env.local                 # Local dev secrets (never committed)
├── .env.example               # Template for env vars
├── public/
│   └── favicon.ico
├── src/
│   ├── main.jsx               # React mount point
│   ├── App.jsx                # Root component — auth gate, router
│   ├── components/
│   │   ├── SecondBrain.jsx    # Main app shell (header, tab bar, view switching)
│   │   ├── Outliner.jsx       # Outline view (bullet rendering, text editing, swipe)
│   │   ├── TimelineView.jsx   # Daily calendar view
│   │   ├── ChatView.jsx       # AI chat panel
│   │   ├── BoardView.jsx      # Multi-column board view
│   │   ├── MarkdownView.jsx   # Rendered markdown view
│   │   ├── AuthSheet.jsx      # Login/signup/profile bottom sheet
│   │   ├── SettingsSheet.jsx  # Theme + account settings
│   │   ├── EditSheet.jsx      # Metadata editor bottom sheet
│   │   ├── TagSheet.jsx       # Tag management sheet
│   │   ├── SaveThemeSheet.jsx # Custom theme creator
│   │   ├── Toolbar.jsx        # Indent/outdent bar + select mode bar
│   │   ├── TabBar.jsx         # Tab bar with copy/format/export
│   │   ├── SearchFilter.jsx   # Search panel with filter chips
│   │   └── Sidebar.jsx        # Left drawer menu
│   ├── lib/
│   │   ├── db.js              # Storage abstraction (Supabase client)
│   │   ├── auth.js            # Auth abstraction (Supabase Auth)
│   │   ├── stripe.js          # Stripe client helpers
│   │   ├── tree.js            # Tree operations (find, insert, remove, update, flatten)
│   │   ├── converters.js      # toPlainText, toMarkdown, toJSON, toOPML
│   │   ├── nodes.js           # makeNode, NODE_TYPES, HIGHLIGHTS, PRIORITIES
│   │   └── tokens.js          # Design tokens (T), THEMES, DEFAULT_SETTINGS
│   ├── hooks/
│   │   ├── useAuth.js         # Auth context + hook
│   │   ├── usePersistence.js  # Auto-save debounced hook
│   │   └── useDrag.js         # Drag state machine hook
│   └── styles/
│       └── animations.css     # Keyframes (sheetUp, slideInLeft, fadeIn, bounce)
├── api/                        # Vercel serverless functions
│   ├── chat.js                # POST /api/chat — proxies Anthropic API
│   ├── stripe-webhook.js     # POST /api/stripe-webhook — handles payment events
│   └── create-checkout.js    # POST /api/create-checkout — creates Stripe session
└── supabase/
    └── migrations/
        └── 001_initial.sql    # Database schema
```

## Environment Variables

```bash
# .env.local (never commit)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...     # Server-side only
ANTHROPIC_API_KEY=sk-ant-...            # Server-side only (for pro users)
STRIPE_SECRET_KEY=sk_live_...           # Server-side only
STRIPE_WEBHOOK_SECRET=whsec_...         # Server-side only
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_... # Client-side OK
```

## Database Schema

See `supabase/migrations/001_initial.sql` (provided separately).

Tables: `profiles`, `documents`, `user_settings`, `chat_sessions`, `chat_messages`, `custom_themes`, `subscriptions`.

All tables have `user_id` foreign key to `auth.users`. Row-level security on everything — users can only read/write their own data.

## Storage Abstraction

The current code has a `db` object with three methods:

```javascript
// Current (artifact)
const db = {
  async save(key, data) { await window.storage.set(key, JSON.stringify(data)); },
  async load(key) { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; },
  async remove(key) { await window.storage.delete(key); },
};
```

Production swap:

```javascript
// Production (Supabase)
import { supabase } from './auth';

const db = {
  async save(key, data) {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return;
    await supabase.from('documents').upsert({
      user_id: user.user.id,
      key,
      data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });
  },
  async load(key) {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return null;
    const { data } = await supabase.from('documents').select('data').eq('user_id', user.user.id).eq('key', key).single();
    return data?.data || null;
  },
  async remove(key) {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return;
    await supabase.from('documents').delete().eq('user_id', user.user.id).eq('key', key);
  },
};
```

## Auth Abstraction

Current code has mock `auth` object with methods: `signIn`, `signUp`, `signInWithProvider`, `signOut`, `updateProfile`. Each has a comment showing the Supabase equivalent.

Production:

```javascript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// signIn → supabase.auth.signInWithPassword({ email, password })
// signUp → supabase.auth.signUp({ email, password, options: { data: { name } } })
// signInWithProvider → supabase.auth.signInWithOAuth({ provider: 'google' })
// signOut → supabase.auth.signOut()
// updateProfile → supabase.auth.updateUser({ data: updates })
```

## API Proxy — `/api/chat.js`

```javascript
// Vercel Edge Function
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { messages, model } = await req.json();

  // TODO: Validate user auth token from request headers
  // TODO: Check user plan (free users can't access AI chat)
  // TODO: Track token usage

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: 'You are a helpful thinking partner embedded in an outliner app called Second Brain. Keep responses concise and actionable. Use short paragraphs, not bullet lists.',
      messages,
    }),
  });

  return new Response(response.body, {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Stripe Integration

```javascript
// /api/create-checkout.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req) {
  const { userId, email } = await req.json();

  const session = await stripe.checkout.sessions.create({
    customer_email: email,
    line_items: [{ price: 'price_XXXXX', quantity: 1 }], // Pro plan price ID
    mode: 'subscription',
    success_url: 'https://secondbrain.scottelling.com?upgraded=true',
    cancel_url: 'https://secondbrain.scottelling.com',
    metadata: { userId },
  });

  return Response.json({ url: session.url });
}

// /api/stripe-webhook.js — updates user.plan in Supabase on payment success
```

## Node Data Model

```javascript
{
  id: "n1234abc",        // unique ID
  t: "Buy groceries",   // text content
  ch: [],               // children (recursive)
  col: false,           // collapsed
  star: false,          // starred
  hl: null,             // highlight color: null | "#69F0AE" | "#FFD740" | "#EA80FC"
  pri: null,            // priority: null | "low" | "med" | "high"
  tags: [],             // freeform tags: ["groceries", "personal"]
  type: null,           // null(note) | "task" | "event" | "reference" | "research" | "idea" | "project" | "recurring"
  done: false,          // completion state (task, recurring)
  sched: null,          // { date: "2026-03-21", time: "09:00", dur: 30 } | null
  note: "",             // freeform description
}
```

## Feature Gates

```javascript
const PLANS = {
  free: { maxNodes: 100, aiChat: false, customThemes: false, export: false },
  pro:  { maxNodes: Infinity, aiChat: true, customThemes: true, export: true },
};

// Gate check pattern:
if (!PLANS[user.plan].aiChat) { showToast("Upgrade to Pro for AI Chat"); return; }
```

## Design System — Purple Rain

```javascript
const T = {
  bg: "#121212",
  surface: "#1E1E2E",
  surfaceAlt: "#252536",
  border: "rgba(255,255,255,0.1)",
  text: "#E0E0E0",
  textDim: "#888",
  textFaint: "#555",
  accent: "#BB86FC",
  teal: "#03DAC6",
  red: "#CF6679",
  radius: 12,
  radiusSm: 8,
  radiusSheet: 28,
  font: "'Manrope', system-ui, -apple-system, sans-serif",
};
```

User-customizable: `settings.bgColor`, `settings.textColor`, `settings.accentColor`.

7 built-in themes: Default, Coder, Writer, Focus, Paper, Ocean, Vapor.

## iOS-Specific Rules (Critical)

- All `.focus()` calls MUST use `{ preventScroll: true }`
- Textareas always in DOM (not conditionally rendered) for iOS gesture-window focus
- `textarea:not(:focus)` CSS with `!important` for pointer-events/user-select
- Long-press drag: inject global `user-select: none !important` via style tag, remove on end
- Toolbar delayed 300ms on edit (iOS keyboard timing), instant for select mode
- Scroll position save/restore on select mode entry
- `contextmenu` suppression when not editing
- `touchmove` handlers must use `{ passive: false }` via addEventListener (not React onTouchMove) to allow preventDefault

## Build & Deploy

```bash
# Development
npm install
npm run dev          # http://localhost:5173

# Production
npm run build        # outputs to dist/
vercel deploy        # or push to GitHub → Vercel auto-deploys

# Environment
cp .env.example .env.local   # fill in secrets
```

## Migration Sequence

1. **Scaffold** — Vite + React, break into components, verify build works
2. **Supabase** — Auth + database, swap db/auth abstractions
3. **API Proxy** — /api/chat for Claude, /api/create-checkout for Stripe
4. **Stripe** — Billing integration, plan enforcement
5. **Polish** — Error handling, loading states, offline support, PWA
