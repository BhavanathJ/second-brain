# Second Brain

**Live:** [second-brain-1-glct.onrender.com](https://second-brain-1-glct.onrender.com)

A full-featured personal productivity system: capture notes, organize tasks on an interactive Eisenhower matrix, build weekly habits with streak analytics, view a unified timezone-aware calendar, schedule automated reminders, and recycle deleted items via a 30-day auto-purging bin — all behind a Netflix-style multi-profile account system with cross-profile filtering.

The **backend** is an Express 4 REST API on Node.js with direct **Supabase (PostgreSQL)** queries, JWT session management, background cron jobs, and rate limiting. The **frontend** is a dependency-free vanilla JavaScript (ES Modules) static app with Bootstrap 5 and a custom Neobrutalist design system — served by the same Express process as a single deployed unit.

---

## Features

| Feature | Description |
|---|---|
| **Auth & Multi-Profile** | Email/password auth with `bcryptjs`, optional unique username, JWT access tokens (15m) + refresh token rotation (30d, single-use, hashed at rest), password change (revokes all sessions). Unlimited isolated profiles per account, each with a name and color, instant switching. |
| **Cross-Profile Filtering** | Dashboard, Tasks, Notes, Habits, Reminders, Calendar, and Bin all support viewing a single profile, an explicit set of profiles, or all owned profiles at once, via a shared filter bar that persists your selection. |
| **Eisenhower Tasks Matrix** | Organize tasks by urgency and importance (Do First, Schedule, Delegate, Don't Do). Tasks with a `due_at` sync with the calendar and dashboard. Completed tasks sort to the bottom of their quadrant. |
| **Notes & Task Conversion** | Free-text capture with multi-tag filtering. One-click conversion links a note to a new task by reference (no data duplication). |
| **Habit Tracking & Streaks** | Weekly quota model (`target_per_week`, e.g. 7 = daily, 3 = three times a week). Streaks and weekly completion are computed from raw daily logs across a 52-week window. The week strip is calendar-aligned to your profile's `week_starts_on` setting, not a rolling trailing window. |
| **Unified Calendar** | Day, week, and month views combining task due dates, habit completions, standalone events, and reminders. DST- and timezone-aware throughout. |
| **Automated Reminders** | Standalone or attached to a task, habit, note, or calendar event. A cron job checks for due reminders every minute. |
| **Recycle Bin (30-day auto-purge)** | Soft-delete across every entity type. Restore or permanently delete an item regardless of which of your profiles it belongs to. A daily cron job purges anything older than 30 days. |
| **Settings** | Per-profile IANA timezone (with legacy-name normalization), theme (light/dark/system, with live favicon switching and cross-tab sync), first day of the week, profile rename/recolor (including your currently active profile). |
| **Dashboard** | Tasks grouped into *Today*, *Tomorrow*, *Next 7 Days*, and *Overdue*, plus habits and reminders, all in one aggregated view (a single request, parallelized server-side). |
| **Rate Limiting** | Per-endpoint limits on login, signup, refresh, and password change, plus a global API limiter. See [Security](#security) below for the current gaps. |

---

## Tech Stack

- **Backend Runtime:** Node.js (CommonJS)
- **API Framework:** Express 4.x — also serves the static frontend directly (`express.static`), so the whole app is one deployable unit, one process, one URL
- **Database:** PostgreSQL via Supabase (`@supabase/supabase-js`, schema in [`db/schema.sql`](db/schema.sql)), accessed with the **service-role key** (see [Security](#security) — this means Postgres Row Level Security is not the authorization layer; all ownership checks are enforced in application code)
- **Auth:** `jsonwebtoken` (HS256 access tokens), `bcryptjs` (password hashing, 10 rounds), SHA-256-hashed refresh tokens with rotation
- **Rate Limiting:** `express-rate-limit`
- **Job Scheduling:** `node-cron` (every-minute reminder dispatch, daily bin purge) — runs in-process, which is why the deployment host must not spin the service down (see Deployment)
- **Frontend:** Vanilla JavaScript (ES modules), Bootstrap 5, custom CSS — no build step, no framework, fetches relative to its own origin (`/api/...`) so it works unmodified in any environment
- **Date & Time:** Hand-rolled DST-accurate boundary computations (`Intl.DateTimeFormat`) in [`src/utils/profileTime.js`](src/utils/profileTime.js), mirrored client-side in [`frontend/js/timeUtils.js`](frontend/js/timeUtils.js)

---

## Project Structure

```
├── db/
│   ├── schema.sql              # PostgreSQL DDL — tables, indexes, constraints.
│   │                             # Must be followed by an explicit service_role
│   │                             # grant (see Database setup below) on any project
│   │                             # created with "Automatically expose new tables"
│   │                             # turned off.
│   └── schema-erd.{svg,dot,mmd} # Entity-relationship diagram (regenerate via mermaid-cli
│                                 # after schema changes: npx mmdc -i db/schema-erd.mmd -o db/schema-erd.svg)
├── src/
│   ├── server.js               # Express entrypoint: API routes, static frontend
│   │                             # serving, cron jobs, CORS/rate-limit wiring, 404
│   │                             # fallback — all in one process
│   ├── config/
│   │   ├── env.js              # Environment variable parsing and defaults
│   │   └── supabase.js         # Supabase client singleton (service role)
│   ├── routes/                 # Express routers, one per resource
│   ├── controllers/            # Request parsing, ownership checks, status codes
│   ├── services/               # Business logic and database queries
│   ├── middleware/
│   │   ├── requireAuth.js      # JWT verification, attaches userId/profileId/username to req
│   │   └── rateLimiters.js     # Limiter definitions (disabled outside NODE_ENV=production)
│   └── utils/
│       ├── jwt.js               # Access token signing/verification
│       ├── password.js          # bcrypt hashing/comparison
│       ├── refreshToken.js      # Refresh token generation and hashing
│       ├── profileAccess.js     # verifyProfileOwnership + resolveProfileIds — the core
│       │                         # security pattern; see Security section below
│       └── profileTime.js       # DST-safe day/week/month boundary computations
├── frontend/
│   ├── index.html              # Login/signup
│   ├── 403.html / 404.html     # Static error pages, served by server.js's own
│   │                             # fallback handler (see Security section)
│   ├── pages/                  # One HTML file per feature (dashboard, tasks, notes, habits,
│   │                             # calendar, reminders, bin, settings, change-password)
│   ├── js/
│   │   ├── api.js              # Fetch wrapper: auth header injection, token refresh,
│   │   │                         # stale cross-profile-filter self-heal on 403.
│   │   │                         # API_BASE_URL is '/api' — relative, works in any env.
│   │   ├── layout.js            # Shared navbar, profile switcher, theme selector
│   │   ├── themeUtils.js        # Theme resolution, favicon updates, cross-tab sync
│   │   ├── timeUtils.js         # Client-side timezone/date formatting
│   │   ├── utils.js              # escapeHtml, shared profile-badge rendering
│   │   ├── profileFilter.js     # Cross-profile filter bar component
│   │   ├── toast.js / confirmDialog.js
│   │   └── pages/               # Page-specific controllers, one per frontend/pages/*.html
│   └── css/
│       └── app.css              # The only stylesheet — Neobrutalist design system
├── tests/                       # In-memory test suite — see Testing section
├── api.md                       # API route and schema reference
└── package.json
```

---

## Security

This section exists because the security model has real, specific tradeoffs worth understanding rather than assuming.

**Ownership pattern.** Every single-item GET/PATCH/DELETE across all 8 resource controllers (task, note, habit, reminder, calendar event, calendar, dashboard, bin) fetches the row by ID *alone*, then separately verifies the caller owns its `profile_id` via `verifyProfileOwnership`. On failure it returns **404, never 403** — so a request for something that exists but isn't yours looks identical to a request for something that doesn't exist at all. Cross-profile aggregation endpoints (dashboard, calendar) route through `resolveProfileIds` instead, which validates every requested profile ID against what the caller actually owns and throws 403 only when an explicitly-named profile ID isn't theirs.

**That 403 case is the only place the backend ever returns 403.** In practice it only fires when the frontend's cross-profile filter bar has a stale profile ID cached in `localStorage` (e.g. a profile was deleted in another tab). `api.js` detects this specific case and self-heals — clears the stale selection and retries — rather than showing an error page. `403.html`/`404.html` are served directly by `server.js`'s own fallback handler, after every API route — there is no separate hosting-platform redirect involved.

**No database-level RLS policies, but access is deny-by-default at the database too.** The Supabase client connects with the **service-role key**, which always bypasses RLS regardless of policy state — so RLS policies, if written, would have zero effect on this backend's own traffic. The production Supabase project has "Automatically expose new tables" **disabled** and automatic RLS **enabled**, meaning the `anon`/`authenticated` roles (which this app's frontend never actually uses — it talks only to this Express backend, never to Supabase directly) have no implicit access to anything. `service_role`'s own access is granted explicitly, since disabling auto-expose removes its implicit grants too — see Database setup below. Every real authorization guarantee for this app's actual users still lives entirely in the application code described above; this is a second lock on a door nobody currently uses, not a second line of defense for the door that matters. Given this exact ownership pattern has been silently dropped by tooling more than once in this project's history, treat any change touching `profileAccess.js` or a controller's single-item handlers as security-critical and verify it by actually running an adversarial cross-account request, not by reading the diff.

**Rate limiting is disabled outside `NODE_ENV=production`.** This is intentional for local development, but it means **you must explicitly confirm `NODE_ENV=production` is set on your deployment host** — some platforms don't default it, and if it's missing, login/signup/refresh ship with zero brute-force protection with no visible symptom until it's exploited. `PATCH /auth/username` currently has no rate limiter at all, unlike every other mutating auth-adjacent endpoint.

**Dependency vulnerabilities.** `npm audit` is clean except for one deliberately-deferred item: `uuid` (moderate, via `node-cron`) requires bumping `node-cron` to a new major version, which is a breaking change to the cron job API. Test that upgrade against the actual reminder/purge cron jobs before taking it.

**Account recovery.** There's no self-service "forgot password" flow — not planned at the current scale (a handful of known users). Password resets are handled by a manual script, kept in a separate private repository (never committed here), which hashes a new password with the same `bcrypt` logic as the app and revokes all of that user's existing refresh tokens. It's run locally against the production Supabase project directly, with no exposed endpoint.

---

## Getting Started

### Prerequisites

- **Node.js** 18+
- A **Supabase** project (or any Postgres instance reachable via the Supabase client)

### 1. Install

```bash
git clone <repository-url>
cd second-brain
npm install --omit=dev
```

### 2. Database

Open your Supabase project's SQL Editor and run `db/schema.sql`, then — **only if you created the project with "Automatically expose new tables" turned off** (the recommended, current setting) — also run:

```sql
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
```

Skipping this on a fresh project results in `permission denied for table ...` errors on every request, including a silent cron failure you'll only see in server logs.

### 3. Environment

```bash
cp .env.example .env
```

Fill in the values — see the table below. Generate a JWT secret with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | No | `4000` | Set automatically by most hosting platforms — don't override in production |
| `NODE_ENV` | No | `development` | **Set to `production` on your deploy host** — see Security section |
| `SUPABASE_URL` | Yes | — | |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Bypasses RLS — see Security section |
| `JWT_ACCESS_SECRET` | Yes | — | Use a different value per environment; dev and prod secrets should never match |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | No | `30` | |
| `CORS_ORIGIN` | No | several localhost ports | Largely irrelevant in production now that the frontend is served same-origin; still used by local dev tooling that hits the API from a different port |

### 4. Run it

```bash
npm run dev    # auto-reload
npm start      # standard
```

One process serves everything — API and frontend together. Open `http://localhost:4000`. Health check: `GET /health`.

---

## Testing

In-memory test suite — real controllers and services run unchanged against a mocked Supabase client, no live database needed. Deterministic (seeded randomness, injectable time).

```bash
node tests/stress-auth.js
node tests/stress-bin.js
node tests/stress-controllers.js
node tests/stress-habits.js
node tests/stress-profiles.js
node tests/stress-security.js
node tests/stress-settings.js
node tests/stress-time.js
node tests/frontend-dst.js
```

| Suite | Focus | Assertions |
|---|---|---|
| `stress-time` | Day/week/month bounds across timezones and DST transitions | 19 |
| `stress-habits` | Weekly quota math vs. an independent reference spec, ~2,300 randomized patterns | 247 |
| `stress-controllers` | A full simulated year through real controllers: dashboard ranges, calendar, reminder cron, bin purge, note conversion, profile isolation | 64 |
| `stress-auth` | Login/signup/refresh/logout/password-change flows, token rotation, enumeration resistance | 27 |
| `stress-profiles` | Profile creation, rename, color validation, delete restrictions | 35 |
| `stress-security` | CORS origin handling, cross-account ownership checks | 29 |
| `stress-settings` | Timezone normalization, week-start validation, settings field allowlisting | 38 |
| `stress-bin` | Bin listing/restore/hard-delete, including cross-profile restore for a non-active-but-owned profile | 17 |
| `frontend-dst` | Client-side `timeUtils.js` vs. backend on DST boundary days | 146 |

**622 assertions total, 0 failures**, verified at time of writing.

There's currently no browser-based end-to-end suite (Playwright/Cypress) — UI-level flows are tested manually.


---

## Deployment

Live at **https://second-brain-1-glct.onrender.com**, on **Render**, as a single Web Service 

- **Build Command:** `npm install --omit=dev` (plain `npm install` would also pull the `mermaid-cli` devDependency and its bundled Chromium download, unnecessarily)
- **Start Command:** `npm start`
- Env vars as in the table above, with `NODE_ENV=production` and a production-only `JWT_ACCESS_SECRET`
- `CORS_ORIGIN` isn't meaningfully used in this deployment shape — the frontend is served by this same process, same origin, so cross-origin requests don't occur in the first place

Database is a Supabase project in the `ap-southeast-1` (Singapore) region — chosen to co-locate with the backend's own region, since backend↔database round trips happen far more often per request than the single user↔backend hop, so pairing backend and DB regions matters more for latency than matching either one individually to end-user location.

No separate frontend deployment — `frontend/` is served by `express.static` from within `server.js`, so there's exactly one Render service, one URL, one thing to keep awake.

---

## Roadmap / Known Gaps

- **`node-cron` / `uuid` upgrade:** deferred breaking change, see Security section.
- **Browser-based E2E tests:** not yet implemented; see Testing section.
- **Self-service password reset:** not implemented by design at current scale; see Security section's Account Recovery note.
- **Row Level Security policies:** not written — `service_role` bypasses RLS regardless, so the database relies on explicit grants plus application-layer ownership checks, not RLS policies, as its actual authorization model.

## API Reference

See [`api.md`](api.md) for endpoint specs, request payloads, and query parameters.

---

## License

ISC.