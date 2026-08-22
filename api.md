# Second Brain - API Reference

Base URL (dev): `http://localhost:4000/api`

All endpoints except `/auth/*` and `/health` require:
```
Authorization: Bearer <accessToken>
```

---

## Notes / known follow-ups

- **Calendar (`/api/calendar`) does not do timezone conversion itself.** It takes an exact `start`/`end` range and queries literally between those timestamps - no "today" computation happens here (unlike Dashboard). When the frontend Calendar page is built, **it** is responsible for converting the user's local month/week/day view into the correct UTC `start`/`end` before calling this endpoint. Not a bug, just an open responsibility to remember when that page gets built.
- **`refresh_tokens` rows are never purged.** Expired/revoked rows accumulate indefinitely - harmless at single-user scale, but a cleanup cron (similar to the existing Bin auto-purge cron) would be a reasonable addition later.
- **Profile cap is hardcoded to 5** in `profileController.js` (`MAX_PROFILES_PER_USER`). Change there if needed.

---

## Health

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | none |

---

## Auth (`/api/auth`)

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/auth/signup` | none | `{ email, password }` |
| POST | `/auth/login` | none | `{ email, password }` |
| POST | `/auth/refresh` | none | `{ refreshToken }` |
| POST | `/auth/logout` | none | `{ refreshToken }` |

- `signup`/`login` return `{ user, profile, accessToken, refreshToken }`.
- `refresh` returns a new `{ accessToken, refreshToken }`, scoped to the **same profile** the old refresh token belonged to (not re-derived from "default profile").
- `logout` revokes the given refresh token, returns `204`.

---

## Profiles (`/api/profiles`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/profiles` | - |
| POST | `/profiles` | `{ name }` |
| POST | `/profiles/:id/select` | - |

- `POST /:id/select` switches the active session to a different one of the caller's own profiles - issues a fresh `{ accessToken, refreshToken }` pair scoped to that profile.
- Max 5 profiles per user.
- Creating a profile also creates its `settings` row automatically.

---

## Tasks (`/api/tasks`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/tasks?urgent=&important=&status=` | - |
| GET | `/tasks/:id` | - |
| POST | `/tasks` | `{ title, description?, urgent?, important?, due_at? }` |
| PATCH | `/tasks/:id` | any of: `title, description, status, urgent, important, due_at` |
| DELETE | `/tasks/:id` | - (soft delete → Bin) |

---

## Notes (`/api/notes`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/notes?tags=work,ideas` | - |
| GET | `/notes/:id` | - |
| POST | `/notes` | `{ content, tags? }` |
| PATCH | `/notes/:id` | `{ content?, tags? }` |
| DELETE | `/notes/:id` | - (soft delete → Bin) |
| POST | `/notes/:id/convert` | - |

- `/:id/convert` creates a Task from the note's content and links it back via `converted_task_id`. Race-safe - a second concurrent convert on the same note gets `409`, no duplicate task left behind.

---

## Habits (`/api/habits`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/habits` | - |
| GET | `/habits/:id` | - |
| POST | `/habits` | `{ title, target_per_week? }` (default 7) |
| PATCH | `/habits/:id` | `{ title?, target_per_week? }` |
| DELETE | `/habits/:id` | - (soft delete → Bin; logs are kept) |
| POST | `/habits/:id/logs` | `{ date? }` (defaults to profile's local today) |
| DELETE | `/habits/:id/logs/:date` | - |
| GET | `/habits/:id/logs?start=&end=` | - |

- `GET /habits` and `GET /habits/:id` attach `this_week_count`, `weekly_goal_met`, and `streak` - all computed live in the profile's local timezone, honoring `settings.week_starts_on`.

---

## Reminders (`/api/reminders`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/reminders?is_done=` | - |
| GET | `/reminders/:id` | - |
| POST | `/reminders` | `{ title, remind_at, entity_type?, entity_id? }` |
| PATCH | `/reminders/:id` | `{ title?, remind_at?, is_done?, entity_type?, entity_id? }` |
| DELETE | `/reminders/:id` | - (soft delete → Bin) |

- `entity_type`/`entity_id` must be provided together (linking a reminder to a task/note/habit/calendar_event) or not at all.
- A cron job fires every minute, marking due reminders `is_done: true`.

---

## Calendar Events (`/api/calendar-events`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/calendar-events?start=&end=` | - |
| GET | `/calendar-events/:id` | - |
| POST | `/calendar-events` | `{ title, starts_at, ends_at?, location? }` |
| PATCH | `/calendar-events/:id` | `{ title?, starts_at?, ends_at?, location? }` |
| DELETE | `/calendar-events/:id` | - (soft delete → Bin) |

---

## Calendar - unified view (`/api/calendar`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/calendar?start=&end=` | - |

Returns `{ tasks, habitLogs, calendarEvents, reminders }` for the given range in one call - used for month/week/day calendar views. See "Notes" above re: timezone conversion.

---

## Dashboard (`/api/dashboard`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/dashboard` | - |

No query params - returns `{ today, tomorrow, next_7_days, overdue }`, all computed server-side in the profile's local timezone.

---

## Bin (`/api/bin`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/bin` | - |
| POST | `/bin/:id/restore` | - |
| DELETE | `/bin/:id` | - (permanent) |

- Entries auto-purge after their `auto_purge_at` timestamp via a daily cron.
- `restore` returns `404` if the original item was already hard-deleted elsewhere (doesn't silently remove the bin entry in that case).

---

## Settings (`/api/settings`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/settings` | - |
| PATCH | `/settings` | `{ timezone?, theme?, week_starts_on? }` |

- `timezone` validated against `Intl.supportedValuesOf('timeZone')` (must be a real IANA name).
- `theme` must be `light` or `dark`.
- `week_starts_on` must be `0` (Sunday) or `1` (Monday).

---

## AI Assistant (`/api/ai`) - requires auth

| Method | Path | Body |
|---|---|---|
| GET | `/ai/context` | - |
| POST | `/ai/chat` | `{ messages, providerConfig?, includeContext? }` |
| POST | `/ai/test` | `{ providerConfig }` |

- `GET /ai/context`: Returns formatted markdown context of active tasks by quadrant, habit streaks, notes, calendar events, and reminders along with count totals.
- `POST /ai/chat`: Injects profile context into the system prompt and forwards the query to the user's configured LLM provider (LiteLLM, OpenAI, Groq, OpenRouter, Ollama, or Custom URL).
- `POST /ai/test`: Pings the target LLM endpoint to verify network reachability and authentication.