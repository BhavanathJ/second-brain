# Second Brain

A personal second-brain app: capture notes, manage tasks on an Eisenhower matrix, track weekly habits, keep a unified calendar, set reminders, and recycle anything through a 30-day bin - all behind a Netflix-style multi-profile login.

Backend (this repo) is a Node.js/Express API backed by **Supabase (Postgres)**. The frontend is a dependency-free vanilla-JS static app served separately.

---

## Features

| Feature | What it does |
|---|---|
| **Auth & profiles** | Email/password signup & login, refresh-token sessions, logout, change password. Up to **5 profiles** per account (netflix-style), each with fully isolated data. |
| **Tasks** | Eisenhower matrix (urgent / important), `pending`/`done` status, due dates. A task with a `due_at` automatically appears on the calendar. |
| **Notes** | Free-text capture with tags. **Convert a note to a task** - it links (never copies), so the task keeps a pointer back to the note. |
| **Habits** | Weekly-quota model (`target_per_week`, e.g. 7 = daily, 3 = 3×/week). Log completions per day; streaks are **computed live** from `habit_logs` (never stored, so they can't drift), capped at a 52-week window. |
| **Calendar** | Unified day/week/month view combining tasks-with-due-dates, habit day checkboxes (read straight from `habit_logs`), and calendar-only events. Timezone/DST-correct day bounds. |
| **Reminders** | Standalone or attached to a task/habit/event/note. A cron job fires them every minute. |
| **Bin** | Every soft-delete across all features lands here; restore or permanently delete; **30-day auto-purge** via a midnight cron. |
| **Settings** | Per-profile timezone, theme (light/dark/system), and week start (Sunday/Monday). |
| **Dashboard** | Today / tomorrow / next-7-days / overdue summary of tasks due in your timezone. |

---

## Tech stack

- **Backend:** Node.js (CommonJS), Express 4, `jsonwebtoken` + `bcryptjs`, `node-cron`
- **Database:** Supabase - PostgreSQL (no ORM; direct Supabase JS queries against the schema in [`db/schema.sql`](db/schema.sql))
- **Frontend:** Vanilla ES-module JS, Bootstrap 5, single shared `app.css`, no build step
- **Timezone math:** hand-rolled, DST-correct (`Intl.DateTimeFormat` offset sampling) in [`src/utils/profileTime.js`](src/utils/profileTime.js), mirrored client-side in [`frontend/js/timeUtils.js`](frontend/js/timeUtils.js)

---

## Project structure

```
├── db/
│   ├── schema.sql          # Full Postgres schema (tables, indexes, constraints)
│   └── schema-erd.svg      # Visual ER diagram
├── src/
│   ├── server.js           # Express app, routes, cron jobs
│   ├── config/             # env.js (validated config), supabase.js (client)
│   ├── routes/             # One router per resource
│   ├── controllers/        # Request/response layer
│   ├── services/           # Business logic (Supabase queries)
│   ├── middleware/         # requireAuth (JWT bearer)
│   └── utils/              # jwt, password, refreshToken, profileTime
├── frontend/
│   ├── index.html          # Login / signup screen
│   ├── pages/              # dashboard, tasks, notes, habits, calendar,
│   │                       # reminders, bin, settings, change-password
│   ├── js/                 # api.js, auth.js, themeUtils.js, timeUtils.js, …
│   └── css/app.css
├── tests/                  # Deterministic stress/regression suite (no runner needed)
├── api.md                  # Full API reference
└── package.json
```

The backend does **not** serve the frontend - the two run independently (see [Running the frontend](#running-the-frontend)).

---

## Getting started

### Prerequisites

- Node.js **18+** (developed and tested on Node 24)
- A Supabase project (free tier is fine)

### 1. Install

```bash
npm install
```

### 2. Set up the database

Open your Supabase project → **SQL Editor** → paste and run [`db/schema.sql`](db/schema.sql). That creates every table, index, and constraint. (`db/schema-erd.svg` is a visual of the same schema.)

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in the values (see the [environment variables](#environment-variables) table). Find your Supabase URL and service-role key in **Supabase → Project Settings → API**.

> ⚠️ The service-role key bypasses Row-Level Security - keep it out of any client-side code. The API uses it because auth + RLS is delegated to the server layer.

### 4. Run the backend

```bash
npm run dev          # node --watch, auto-restarts on change
# or
npm start            # plain start
```

The API listens on `http://localhost:4000` (override with `PORT`). Health check: `GET /health`.

### 5. Run the frontend

The frontend is static - serve the `frontend/` directory with any static server on port **5500** (matches the default `CORS_ORIGIN`):

```bash
# from the project root
npx serve frontend -l 5500
# or VS Code "Live Server", or: cd frontend && python -m http.server 5500
```

Open `http://localhost:5500`, sign up, and log in.

> The frontend's API base URL is hard-coded to `http://localhost:4000/api` in [`frontend/js/api.js`](frontend/js/api.js) - change it for any non-local backend.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | no | `4000` | API port |
| `NODE_ENV` | no | `development` | `development` / `production` |
| `SUPABASE_URL` | **yes** | - | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | - | Supabase service-role key (server only) |
| `JWT_ACCESS_SECRET` | **yes** | - | Secret for signing access tokens. Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_ACCESS_EXPIRES_IN` | no | `15m` | Access-token lifetime (any `jsonwebtoken` expiresIn string) |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | no | `30` | Refresh-token lifetime in days |
| `CORS_ORIGIN` | no | `http://localhost:5500` | Allowed browser origin (set to your Netlify URL in prod) |

---

## Testing

No test runner is installed. The suite in [`tests/`](tests/) is plain Node scripts with a tiny assertion framework, and it runs against an **in-memory Supabase mock** ([`tests/mockSupabase.js`](tests/mockSupabase.js)) injected via `require.cache` - the *real* services and controllers execute unchanged, so **no database is needed**. All randomness is seeded and time is injectable, so runs are deterministic and reproducible.

```bash
node tests/stress-time.js        # 19 assertions - 2 years × 4 timezones of DST-correct
                                 #   day/week bounds, local midnights, range spans
node tests/stress-habits.js      # 247 assertions - streak math vs an independent
                                 #   spec reference (~2,300 randomized patterns),
                                 #   52-week cap, missed-week resets
node tests/stress-controllers.js # 64 assertions - a full simulated year driven through
                                 #   the real controllers: habits, dashboard ranges,
                                 #   calendar, reminders cron, bin purge, note conversion,
                                 #   profile isolation, settings changes
node tests/frontend-dst.js       # 146 assertions - the real frontend timeUtils.js vs the
                                 #   backend on DST days, weeks, and months
```

Run them all:

```bash
for f in tests/*.js; do node "$f"; done
```

**476 assertions, 0 failures** is the expected green state.

> The mock mirrors Postgres semantics the code relies on (row defaults, unique-constraint `23505`, filter operators, `habits(...)` join) but is **not** Postgres - type-coercion behaviors (e.g. rejecting a non-date string) only show up against a real database.

---

## Deployment

The repo is designed for **backend on Render** + **frontend on Netlify**.

**Backend (Render):**
1. Create a new Web Service pointing at this repo.
2. Set the environment variables (the same names as [above](#environment-variables)) in the Render dashboard - **no `.env` file on Render**.
3. Start command: `npm start`. `CORS_ORIGIN` = your Netlify URL.

**Frontend (Netlify):**
1. Build command: *none* (static site), publish directory: `frontend/`.
2. Update [`frontend/js/api.js`](frontend/js/api.js) `API_BASE_URL` to your Render URL.

---

## API

Full endpoint reference (auth, profiles, tasks, notes, habits, calendar, reminders, bin, settings, dashboard) lives in **[`api.md`](api.md)**.

All routes except `/api/auth/*` and `/health` require an `Authorization: Bearer <accessToken>` header.

---

## Known limitations & follow-ups

From a year-long stress-test audit (see [Testing](#testing)); none are crashes, but worth knowing:

- **No pagination** on list endpoints - tasks/notes/reminders/bin return everything (and done reminders accumulate). Fine at personal scale, slow at scale.
- **`datetime-local` inputs** (tasks, reminders, calendar pages) capture *browser-local* wall time, while the backend interprets streaks and dashboard ranges in the *profile's* configured timezone. Set the two the same, or due/reminder times will be interpreted in the wrong zone.
- **Habit streaks cap at 52 weeks** - a 100-week perfect streak reports 52 (the query window is deliberately bounded).
- **Validation gaps** documented in the stress suite: an event `UPDATE` can set `ends_at < starts_at` (create validates, update doesn't), and habit-log dates aren't validated for format/future dates.
- **`refresh_tokens` rows are never purged** - expired/revoked rows accumulate (harmless at single-user scale; a cleanup cron would be a reasonable addition).
