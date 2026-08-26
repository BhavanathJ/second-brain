# Second Brain

A full-featured personal productivity and "second brain" system: capture rich notes, organize tasks on an interactive Eisenhower matrix, build weekly habits with streak analytics, view a unified timezone-aware calendar, schedule automated reminders, and recycle deleted items via a 30-day auto-purging bin — all secured behind a Netflix-style multi-profile authentication system.

The **backend** is an Express 4 REST API built on Node.js with direct **Supabase (PostgreSQL)** queries, JWT session management, background cron jobs, and production-ready rate limiting. The **frontend** is a responsive, dependency-free vanilla JavaScript (ES Modules) static web app with Bootstrap 5 and customized modern styling.

---

## Features

| Feature | Description |
|---|---|
| **Auth & Multi-Profile** | Secure email/password authentication with `bcryptjs`, JWT access tokens (15m) + refresh token rotation (30d), and password change. Supports up to **5 isolated profiles** per account with instant profile switching. |
| **Eisenhower Tasks Matrix** | Organize tasks by urgency and importance (Do First, Schedule, Delegate, Don't Do). Tasks with a `due_at` timestamp seamlessly sync with the calendar and dashboard. |
| **Notes & Task Conversion** | Rich markdown/text capture with flexible multi-tag filtering. **One-click conversion** links notes to tasks with pointer references (avoids data duplication and race conditions). |
| **Habit Tracking & Streaks** | Flexible weekly quota model (`target_per_week`, e.g., 7 = daily, 3 = 3×/week). Streaks and weekly completions are **dynamically computed** from raw daily logs across a 52-week window (zero drift). |
| **Unified Calendar** | Combined day, week, and month views displaying tasks with due dates, habit completions, standalone calendar events, and scheduled reminders. Fully DST and timezone-aware. |
| **Automated Reminders** | Set standalone reminders or attach them to tasks, habits, notes, or calendar events. A background cron job checks and triggers due reminders every minute. |
| **Recycle Bin (30-Day Auto-Purge)** | Universal soft-delete system across all entities. Restore items or permanently delete them. A midnight cron job automatically purges items older than 30 days. |
| **Profile Settings** | Per-profile IANA timezone selection, theme preferences (light/dark/system), and customizable first day of the week (Sunday vs. Monday). |
| **Dashboard** | Instant summary of tasks categorized into *Today*, *Tomorrow*, *Next 7 Days*, and *Overdue* relative to the profile's local midnight. |
| **Rate Limiting & Security** | Granular endpoint protection using `express-rate-limit` (login, signup, refresh, password change, global API) with automatic development bypass and reverse-proxy support. |

---

## Tech Stack

- **Backend Runtime:** Node.js (CommonJS, Node 18+)
- **API Framework:** Express 4.x
- **Database:** PostgreSQL via Supabase (`@supabase/supabase-js`, direct SQL schema in [`db/schema.sql`](db/schema.sql))
- **Authentication & Security:** `jsonwebtoken`, `bcryptjs`, `express-rate-limit`, CORS
- **Job Scheduling:** `node-cron` (every-minute reminder dispatch, daily bin cleanup)
- **Frontend:** Vanilla JavaScript (ES6+ modules), Bootstrap 5, Custom CSS, HTML5
- **Date & Time Engine:** Hand-rolled DST-accurate timezone computations (`Intl.DateTimeFormat`) in [`src/utils/profileTime.js`](src/utils/profileTime.js) and mirrored client-side in [`frontend/js/timeUtils.js`](frontend/js/timeUtils.js)

---

## Project Structure

```
├── db/
│   ├── schema.sql              # PostgreSQL DDL (tables, indexes, foreign keys, constraints)
│   ├── schema-erd.svg          # Visual Entity-Relationship Diagram (ERD)
│   ├── schema-erd.dot          # GraphViz DOT source for ERD
│   └── schema-erd.mmd          # Mermaid source for ERD
├── src/
│   ├── server.js               # Express application entrypoint, routes mounting, cron jobs
│   ├── config/
│   │   ├── env.js              # Environment variable validation and defaults
│   │   └── supabase.js         # Supabase client singleton (Service Role)
│   ├── routes/                 # Express routers for each domain resource
│   ├── controllers/            # Request parsing, status codes, and HTTP responses
│   ├── services/               # Business logic and database operations
│   ├── middleware/
│   │   ├── requireAuth.js      # JWT authentication and active profile resolution
│   │   └── rateLimiters.js     # Rate limit definitions and dev bypass
│   └── utils/
│       ├── jwt.js              # Access token signing and verification
│       ├── password.js         # bcrypt password hashing and comparison
│       ├── refreshToken.js     # Refresh token generation and lifecycle
│       └── profileTime.js      # DST-safe day/week/month boundary computations
├── frontend/
│   ├── index.html              # Landing, authentication (login/signup), and profile selection
│   ├── pages/                  # Static HTML templates
│   │   ├── dashboard.html      # Overview & upcoming agenda
│   │   ├── tasks.html          # Eisenhower matrix & task manager
│   │   ├── notes.html          # Tagged notes & task conversion
│   │   ├── habits.html         # Weekly quotas & streak visualization
│   │   ├── calendar.html       # Month/week/day calendar views
│   │   ├── reminders.html      # Reminder list & triggers
│   │   ├── bin.html            # Soft-deleted items & restore
│   │   ├── settings.html       # Timezone, theme, week start preferences
│   │   └── change-password.html# Authenticated password reset
│   ├── js/
│   │   ├── api.js              # Centralized fetch wrapper with auth header injection
│   │   ├── auth.js             # Client-side session storage & token refresh
│   │   ├── layout.js           # Shared navigation bar and profile dropdown
│   │   ├── timeUtils.js        # Client-side timezone & date formatting
│   │   ├── themeUtils.js       # Light / Dark theme management
│   │   ├── toast.js            # Notification alerts
│   │   ├── confirmDialog.js    # Modal confirmation helpers
│   │   └── pages/              # Page-specific frontend controllers
│   └── css/
│       └── app.css             # Main styling, design tokens, and components
├── api.md                      # Comprehensive API route and schema reference
└── package.json
```

---

## Rate Limiting & Security

The application includes multi-tier rate limiting via [`src/middleware/rateLimiters.js`](src/middleware/rateLimiters.js):

| Limiter | Target | Limit | Window | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Global API** | `/api/*` | 300 requests | 15 mins | Guard against runaway client loops and DDoS |
| **Login** | `/api/auth/login` | 10 attempts | 15 mins | Brute-force protection on user credentials |
| **Signup** | `/api/auth/signup` | 5 creations | 1 hour | Prevents automated account creation spam |
| **Token Refresh** | `/api/auth/refresh` | 60 requests | 15 mins | Multi-tab session safe; restricts token replay abuse |
| **Change Password**| `/api/auth/password`| 5 attempts | 15 mins | Protects against credential stuffing via active tokens |

> **Development Mode:** Rate limits are automatically bypassed when `NODE_ENV !== 'production'` to ensure smooth local testing and debugging.  
> **Reverse Proxy Support:** Express is configured with `app.set('trust proxy', 1)` to accurately detect client IP addresses behind hosting proxies like Render.

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher (developed and tested on Node 20+)
- **Supabase**: Free-tier project (or any Postgres instance with Supabase API support)

---

### 1. Installation

Clone the repository and install backend dependencies:

```bash
git clone <repository-url>
cd "Second Brain"
npm install
```

---

### 2. Database Setup

1. Log in to your [Supabase Dashboard](https://app.supabase.com) and create or open your project.
2. Go to the **SQL Editor** in the left sidebar.
3. Copy the entire contents of [`db/schema.sql`](db/schema.sql), paste into the editor, and click **Run**.
4. All required tables (`users`, `profiles`, `tasks`, `notes`, `habits`, `habit_logs`, `reminders`, `calendar_events`, `bin`, `settings`, `refresh_tokens`), indexes, and triggers will be created.

---

### 3. Environment Configuration

Create your `.env` file from the example:

```bash
cp .env.example .env
```

Populate the required environment variables:

```env
PORT=4000
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
JWT_ACCESS_SECRET=your-secure-random-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN_DAYS=30
CORS_ORIGIN=http://localhost:5500
```

> 🔑 **Generate a secure JWT secret:**  
> Run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

### 4. Running the Backend

Start the API server in development mode (with auto-reload):

```bash
npm run dev
```

Or run in standard mode:

```bash
npm start
```

- API server will listen on `http://localhost:4000`.
- Health check endpoint: `GET http://localhost:4000/health`.

---

### 5. Running the Frontend

The frontend is completely static and communicates with the backend via REST. Serve the `frontend/` directory using any local HTTP server on port **5500** (to match the default `CORS_ORIGIN`):

```bash
# Using npx serve:
npx serve frontend -l 5500

# Or Python:
cd frontend && python -m http.server 5500
```

Open `http://localhost:5500` in your browser, create an account, and get started!

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4000` | Port for the Express server to listen on |
| `NODE_ENV` | No | `development` | Environment mode (`development` or `production`). Governs rate limiting enforcement. |
| `SUPABASE_URL` | **Yes** | — | Your Supabase project URL (`https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | — | Supabase `service_role` secret (server-only; bypasses RLS) |
| `JWT_ACCESS_SECRET` | **Yes** | — | Cryptographic secret for signing access tokens |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Lifetime of short-lived JWT access tokens |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | No | `30` | Duration (in days) before refresh tokens expire |
| `CORS_ORIGIN` | No | `http://localhost:5500` | Allowed client origin for CORS headers |

---

## Deployment Guide

### Backend (Render / Railway / Fly.io)

1. Create a **Web Service** connected to your repository.
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Set the environment variables in the host dashboard (`NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_ACCESS_SECRET`, `CORS_ORIGIN=https://your-frontend.netlify.app`).

### Frontend (Netlify / Vercel / GitHub Pages)

1. Create a static site connected to the repository.
2. Publish Directory: `frontend`
3. Build Command: *None*
4. Ensure [`frontend/js/api.js`](frontend/js/api.js) points its `API_BASE_URL` to your production backend URL.

---

## Testing

The project has been **thoroughly validated** using a deterministic, in-memory test suite that ran against the real controllers and services with a mocked Supabase client — no database required.

### Test Coverage (476 assertions, 0 failures)

| Test Suite | Focus | Assertions |
|------------|-------|------------|
| **Timezone & DST** | Day/week/month bounds across 2 years × 4 timezones, local midnights, DST transitions | 19 |
| **Habit Streaks** | Weekly quota math vs independent spec reference (~2,300 randomized patterns), 52-week cap, missed-week resets | 247 |
| **Controller Integration** | Full simulated year through real controllers: habits, dashboard ranges, calendar, reminders cron, bin purge, note conversion, profile isolation, settings changes | 64 |
| **Frontend Time Utils** | Client-side `timeUtils.js` vs backend on DST days, weeks, months | 146 |

### How It Works
- **Deterministic**: All randomness seeded; time is injectable — runs are 100% reproducible
- **No external dependencies**: Uses an in-memory Supabase mock that mirrors Postgres semantics the code relies on (row defaults, unique constraints, filter operators, joins)
- **Real code paths**: Actual services and controllers execute unchanged — only the DB layer is swapped
- **CI-ready**: Runs in seconds with `node tests/stress-*.js` (no test runner needed)

The test suite validated core business logic (timezone math, streak computation, controller flows). For browser-based E2E testing, Playwright is configured — run `npx playwright test` with both servers running (`http://localhost:4000` backend, `http://localhost:5500` frontend).

---

## API Reference

Detailed endpoint specifications, request payloads, and query parameters are documented in **[`api.md`](api.md)**.

---

## License

ISC License. Built as an open, personal productivity system.
