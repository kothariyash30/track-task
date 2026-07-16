# TaskFlow — Project Requirements

Small-business task and workload tracker: employees manage their own work on a
personal Kanban board and log time against it; an admin gets a team-wide view of
workload, progress, and hours for compensation and staffing decisions.

This document describes the product as currently implemented (`backend/server.py`,
`frontend/src/`). See `memory/PRD.md` for the original problem statement and
open backlog items.

## 1. Roles

| Role | Description |
| --- | --- |
| **Admin** | Sees team-wide KPIs, charts, and every task. Creates/edits/reassigns/deletes any task, manages employee accounts, runs productivity reports, exports data. |
| **Employee** | Manages their own tasks on a Kanban board (To Do / In Progress / Done), logs time by moving tasks through statuses, edits their own tasks, cannot delete tasks or see other employees' work. |

Role is chosen at registration (`employee` or `admin`) and fixed thereafter —
there is no in-app promotion/demotion flow.

## 2. Authentication

- Email + password accounts. Passwords hashed with bcrypt, minimum 6 characters.
- JWT access token (24h) issued on register/login, carried both as an httpOnly
  cookie and as a bearer token in `localStorage` (the frontend sends the bearer
  token; the cookie is a fallback).
- A refresh token is minted and cookied on login/register but there is currently
  no `/auth/refresh` endpoint — sessions simply expire after 24h and require a
  fresh login.
- `/auth/logout` clears both cookies client- and server-side.
- No rate limiting on login/register.

## 3. Task management

### Fields
`title` (required), `description`, `priority` (`low` / `medium` / `high` /
`urgent`), `status` (`todo` / `in_progress` / `done`), `due_date`, `assignee_id`,
plus system-managed `hours_logged`, `created_at`, `updated_at`, `completed_at`,
`in_progress_at`.

### Rules
- Only admins can set or create a task with `urgent` priority.
- Every task an admin creates is automatically forced to `urgent` priority,
  regardless of what was submitted, so it surfaces immediately to whoever it's
  assigned to.
- Employees may create tasks for themselves only; admins may assign to anyone.
- Employees can edit their own tasks (title, description, priority except
  urgent, status, due date) but **cannot delete tasks or reassign them** —
  deletion and reassignment are admin-only.
- Reassigning a task (changing `assignee_id`) is admin-only; the edit dialog
  always resubmits the current `assignee_id`, so the check only blocks an
  actual change, not an unchanged echo.
- Moving status to `done` stamps `completed_at`; moving away from `done`
  clears it.

### Time tracking
- Hours are **not** manually entered. Moving a task out of `in_progress` (to
  `todo` or `done`) closes the current session and adds its elapsed wall-clock
  time to `hours_logged`, with an entry recorded in `time_logs`. Re-entering
  `in_progress` later starts a fresh session — pausing/resuming accumulates
  rather than resets.
- Hours are displayed everywhere as `Xh Ym` (e.g. `3h 30m`), never as a decimal
  fraction of an hour.

### Audit log
- Every create/update records a diff of tracked fields (`title`, `status`,
  `priority`, `due_date`, `assignee_id`) with actor, timestamp, and
  before/after values. Viewable per task (admin only) via a history dialog.

## 4. Employee dashboard (`/tasks`)

- Three-column Kanban (To Do / In Progress / Done), drag-and-drop between
  columns (optimistic update, rolls back and reloads on failure).
- KPI tiles: active tasks today, in-progress count, completed today, hours
  logged today.
- Search by title/description; filter by in-progress date range.
- Create/edit task dialog; delete is hidden for employees (admin-only).

## 5. Admin dashboard (`/admin`)

Three tabs:

**Reports**
- Stacked bar chart: workload (To Do / In Progress / Done) per employee.
- Pie chart: overall status breakdown.
- Entry point to the printable employee productivity report (see §6).

**Employees**
- Searchable/filterable table (by role, and by underlying task
  assignee/priority/status/created-date) of every account: total tasks, done,
  in progress, hours logged.
- Row click opens a read-only view of that employee's tasks.
- Per-employee actions: reset password, delete account (employee accounts
  only — admin accounts cannot be deleted, and deleting an employee cascades
  to their tasks, time logs, and audit logs).

**All tasks**
- Urgent tasks in a dedicated table (filterable by assignee, status,
  in-progress date range), with reassign and delete actions.
- Remaining (non-urgent) tasks as a tile grid (filterable by search, assignee,
  priority, status, in-progress date range, overdue-only), each tile showing
  assignee, hours, in-progress date, and a **status badge in the top-right
  corner** of the card.
- Multi-select across the remaining-tasks tiles, with a bulk **purge**
  (permanent delete) that requires the admin to re-enter their own password
  on every call, previews the tasks to be deleted, and cascades to their time
  logs and audit logs.
- CSV export of all tasks (title, status, priority, due date, hours, assignee,
  created/completed timestamps).

## 6. Employee productivity report

Printable, date-scoped report (from the Reports tab):
- Pick a report date and one or more employees via checkboxes.
- **Employees not currently working** — a standalone table, independent of
  the checkbox selection, listing every employee with no task in
  `in_progress` right now, along with their waiting to-do count and tasks
  completed on the selected date. Always visible, even before any employee is
  checked.
- Per-employee section (for checked employees): completed-today count,
  in-progress count, hours logged today, a table of tasks completed that day
  (title **and description**, priority, completion time, hours) and a table
  of tasks still in progress (title **and description**, priority, in-progress
  since, live hours-so-far).
- Multi-employee summary table when more than one employee is selected.
- Print via the browser's native print dialog (dedicated print stylesheet;
  screen-only controls are hidden when printing).

## 7. Non-functional

- **Security**: bcrypt password hashing, JWT auth, admin-only endpoints
  guarded server-side (not just hidden in the UI), destructive bulk actions
  re-confirm the admin's password. `.env` files are gitignored; `MONGO_URL` is
  required at boot, `JWT_SECRET` falls back to an ephemeral generated value
  with a warning if unset.
- **Known gaps**: no automated test suite (`tests/` is empty despite
  `pytest.ini` being configured), no rate limiting on auth endpoints, access
  token duplicated in `localStorage` alongside the httpOnly cookie, hard
  result caps instead of real pagination (`/api/users` 500, `/api/tasks`
  1000, `/api/admin/time-logs` 5000), dead refresh-token plumbing.
- **Scale**: sized for a small team (single-digit to low-hundreds of
  employees/tasks) — the caps above make this an explicit assumption, not
  just an oversight.

## 8. Tech stack

- **Backend**: FastAPI + Motor (MongoDB async driver), single `server.py`.
  JWT (`PyJWT`), bcrypt, pydantic v2 models.
- **Frontend**: React 19, react-router v7, shadcn/ui + Radix + Tailwind,
  Recharts (charts), react-hook-form + zod (available, not used everywhere),
  date-fns, axios, sonner (toasts).
- **Data store**: MongoDB (`users`, `tasks`, `time_logs`, `audit_logs`,
  `migrations` collections), UUID string primary keys.

## 9. Deployment

- Backend: Railway (Nixpacks, `uvicorn server:app`), health checks at
  `/health` and `/api/health`. See `RAILWAY_DEPLOY.md`.
- Frontend: Vercel (`create-react-app` build), project `track-task1`. See
  `frontend/vercel.json`.
- Both auto-deploy on push to `main` via their GitHub integrations.

## 10. Backlog (not yet built)

Carried over from `memory/PRD.md`:
- Per-employee compensation calculator (hourly rate × hours, bonus per
  completed task).
- Task comments / discussion thread.
- Calendar view of due dates.
- Push notifications / email digests.
- A real automated test suite (unit + integration + E2E) and pagination for
  the endpoints listed under §7.
