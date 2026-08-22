# Second Brain 🧠

A personal second-brain application built with a modern **Neobrutalism** aesthetic. Capture notes, organize tasks on an Eisenhower matrix, track weekly habit streaks, maintain a unified calendar, set up recurring reminders, and recycle soft-deleted items through a 30-day bin — all secured behind a Netflix-style multi-profile login.

- **Backend:** Node.js & Express REST API backed by **Supabase (PostgreSQL)**.
- **Frontend:** Dependency-free vanilla JavaScript (ES Modules) with Bootstrap 5 and a custom Neobrutalist design system.

---

## ⚡ Quick Start: How to Run

### Prerequisites
- **Node.js 18+** installed ([Download Node.js](https://nodejs.org/))
- A free **Supabase** account ([supabase.com](https://supabase.com))

---

### Step 1: Install Dependencies
Open your terminal in the project root folder and run:
```bash
npm install
```

---

### Step 2: Set Up the Database
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard) and create or open a project.
2. Navigate to **SQL Editor** on the left menu.
3. Open [`db/schema.sql`](db/schema.sql), copy its entire content, paste it into the Supabase SQL editor, and click **Run**.
   *(This creates all necessary tables, constraints, functions, and indexes.)*

---

### Step 3: Configure Environment Variables
1. Copy the example environment file:
   - **Windows (PowerShell):**
     ```powershell
     Copy-Item .env.example .env
     ```
   - **macOS / Linux:**
     ```bash
     cp .env.example .env
     ```
2. Open `.env` and fill in your values:
   ```ini
   PORT=4000
   NODE_ENV=development

   # From Supabase: Project Settings > API
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key

   # Generate a 64-byte random string for JWT signing
   JWT_ACCESS_SECRET=your-random-secret-string
   JWT_ACCESS_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN_DAYS=30

   # Local frontend URL for CORS
   CORS_ORIGIN=http://localhost:5500
   ```

> 💡 **Tip:** Generate a secure random string for `JWT_ACCESS_SECRET` by running:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

### Step 4: Start the Servers

You will need **two terminal tabs/windows**:

#### 🟢 Terminal 1: Run the Backend API
```bash
npm run dev
```
*The API will start on **`http://localhost:4000`** (Health check: `http://localhost:4000/health`).*

#### 🔵 Terminal 2: Serve the Frontend
Serve the static `frontend/` directory on port **5500** (matches `CORS_ORIGIN`):
```bash
npx serve frontend -l 5500
```
*Alternative options:*
- **Python:** `python -m http.server 5500 --directory frontend`
- **VS Code:** Right-click `frontend/index.html` → "Open with Live Server" (set port to 5500).

---

### Step 5: Open the Application
Navigate to 👉 **`http://localhost:5500`** in your browser to sign up and begin using Second Brain!

---

## ✨ Features & Architecture

| Feature | Description |
|---|---|
| **Auth & Profiles** | Email/password authentication, refresh-token rotation, password changes. Up to **5 isolated profiles** per account (Netflix-style). |
| **Tasks (Eisenhower Matrix)** | 4-quadrant prioritization (*Do First*, *Schedule*, *Delegate*, *Eliminate*), task due dates, and completion status. |
| **Notes & Task Conversion** | Capture notes with tags and convert notes directly into tasks with automatic back-linking. |
| **Habits & Streaks** | Weekly-quota habits with live streak calculation computed directly from habit completion logs (capped at 52 weeks). |
| **Unified Calendar** | Day/week/month views combining tasks with due dates, habit checks, and standalone calendar events with DST-safe timezone handling. |
| **Reminders** | Standalone or linked reminders processed every minute by an internal cron job. |
| **Recycle Bin** | Centralized soft-delete recovery across all modules with a 30-day automated purge cron. |
| **Neobrutalism UI** | High-contrast solid borders, crisp hard drop shadows, tactile button mechanics, and responsive layouts. |

---

## 📁 Project Structure

```
├── db/
│   ├── schema.sql          # Postgres database schema (tables, constraints, indexes)
│   └── schema-erd.svg      # Entity-Relationship diagram
├── src/
│   ├── server.js           # Express app setup, routing, and background cron jobs
│   ├── config/             # Environment validation and Supabase client
│   ├── routes/             # REST API routes (auth, tasks, notes, habits, etc.)
│   ├── controllers/        # Request handling and response validation
│   ├── services/           # Database queries and business logic
│   ├── middleware/         # JWT authentication guard and rate limiters
│   └── utils/              # Token generation, password hashing, and timezone math
├── frontend/
│   ├── index.html          # Login and signup portal
│   ├── pages/              # dashboard, tasks, notes, habits, calendar, reminders, bin, settings
│   ├── js/                 # API client, auth flow, layout manager, and timezone utilities
│   └── css/app.css         # Neobrutalism design system and responsive styles
├── tests/                  # Deterministic stress & regression suite (in-memory mock)
├── api.md                  # Comprehensive API documentation
└── package.json
```

---

## 🧪 Testing

The repository includes a deterministic regression and stress-testing suite that runs against an **in-memory Supabase mock** ([`tests/mockSupabase.js`](tests/mockSupabase.js)). **No live database connection is required to run tests.**

Run individual tests:
```bash
node tests/stress-time.js        # DST-correct bounds over 2 years & multiple timezones
node tests/stress-habits.js      # Streak math vs spec reference across randomized patterns
node tests/stress-controllers.js # Full simulated year through controllers
node tests/frontend-dst.js       # Frontend timezone parity checks
```

Run all tests together:
```bash
node tests/stress-time.js ; node tests/stress-habits.js ; node tests/stress-controllers.js ; node tests/frontend-dst.js
```

---

## 🚀 Deployment

- **Backend (Render / Railway / VPS):**
  1. Create a new Node.js Web Service pointing to this repository.
  2. Set the environment variables in your hosting dashboard.
  3. Start command: `npm start`.
  4. Set `CORS_ORIGIN` to your frontend production URL.

- **Frontend (Netlify / Vercel / Cloudflare Pages):**
  1. Publish directory: `frontend/` (no build step needed).
  2. In [`frontend/js/api.js`](frontend/js/api.js), set `API_BASE_URL` to your live backend URL (e.g. `https://your-backend.onrender.com/api`).

---

## 📖 API Documentation

For the complete REST API specification, headers, request bodies, and responses, see **[`api.md`](api.md)**.
