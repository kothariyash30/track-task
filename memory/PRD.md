# TaskFlow — Small Business Task & Workload App

## Original Problem Statement
> this app is for small businesses, where a small group of employees can create and define there tasks and log progress against them. an admin dashboard can give an over view on tasks its progress and individual employe workload and total work done so that they can be compensated accordingly.

## User Choices
- Auth: JWT email/password
- Task fields: title, description, status (todo/in_progress/done), priority, due_date, time logged
- Compensation: completed tasks per employee + hours logged
- Admin dashboard: total completed per employee, hours per employee, status breakdown chart, workload comparison
- Seed: admin + 3 demo employees + sample tasks

## Architecture
- Backend: FastAPI + Motor (MongoDB). JWT in httpOnly cookies (`access_token`, `refresh_token`). Bcrypt password hashing. Single-file `server.py`.
- Frontend: React + react-router + shadcn/ui + Tailwind + Recharts. AuthContext + Protected routes.
- Design: Swiss/High-Contrast, Klein Blue (#002FA7), Outfit (display) + IBM Plex Sans (body).

## Personas
- **Admin** — sees team-wide KPIs, charts, employee compensation table, and can create/assign/edit any task.
- **Employee** — manages a personal Kanban (Todo / In Progress / Done), logs hours per task.

## What's Implemented (2026-06-29)
- POST/GET `/api/auth/{register,login,logout,me}` with cookie-based JWT
- `/api/users` (admin only), `/api/tasks` (mine/all), PATCH/DELETE, `/api/tasks/{id}/time-logs`, `/api/admin/dashboard`
- Seed: `admin@taskflow.com / admin123` + Maya/Leo/Ava (`employee123`) + 6 sample tasks
- Login + Register pages
- Employee Kanban dashboard (KPI tiles + 3-column Kanban + new/edit/delete/log-time)
- Admin dashboard (KPIs + stacked BarChart for workload + PieChart for status + employee table + all-tasks tab)
- TaskDialog (create/edit with calendar/priority/status/assignee), TimeLogDialog
- Sonner toasts on actions

## Test Credentials
See `/app/memory/test_credentials.md`.

## Backlog (P1 / P2)
- P1: Per-employee compensation calculator (hourly rate × hours, bonus per completed task)
- P1: Filter all-tasks view by assignee / priority / overdue
- P1: Task comments + activity log
- P2: CSV export of monthly hours per employee (for payroll)
- P2: Drag-and-drop between Kanban columns
- P2: Calendar view of due dates
- P2: Push notifications + email digests (Resend integration)
