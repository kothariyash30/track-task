from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# ------------------------------------------------------------
# Setup
# ------------------------------------------------------------
def _required_env(key: str) -> str:
    val = os.environ.get(key)
    if not val:
        raise RuntimeError(
            f"Missing required environment variable '{key}'. "
            "Set it in your hosting provider (e.g. Railway → Service → Variables)."
        )
    return val


# MONGO_URL is the only env var that MUST be provided.
mongo_url = _required_env("MONGO_URL")
db_name = os.environ.get("DB_NAME") or "taskflow"

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# JWT_SECRET: prefer env var. If not set (single-instance trials), generate one
# at boot and warn — tokens won't survive a restart, but the app will start.
import secrets as _secrets  # local import to keep the top of file tidy
_jwt_env = os.environ.get("JWT_SECRET")
if not _jwt_env:
    _jwt_env = _secrets.token_hex(32)
    logging.getLogger("taskflow").warning(
        "JWT_SECRET not set — generated an ephemeral one. "
        "Set JWT_SECRET in env to keep sessions valid across restarts."
    )
JWT_SECRET = _jwt_env
JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 24  # 24h for convenience in this internal tool
REFRESH_TTL_DAYS = 7

app = FastAPI(title="TaskFlow API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("taskflow")


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(uid: str, email: str, role: str) -> str:
    payload = {
        "sub": uid,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(uid: str) -> str:
    payload = {
        "sub": uid,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=ACCESS_TTL_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=REFRESH_TTL_DAYS * 86400, path="/")


def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "role": u["role"],
        "avatar": u.get("avatar", ""),
        "created_at": u.get("created_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ------------------------------------------------------------
# Models
# ------------------------------------------------------------
class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=120)
    role: Literal["employee", "admin"] = "employee"


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = ""
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    status: Literal["todo", "in_progress", "done"] = "todo"
    due_date: Optional[str] = None  # ISO date string
    assignee_id: Optional[str] = None  # admin can assign; otherwise self


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high", "urgent"]] = None
    status: Optional[Literal["todo", "in_progress", "done"]] = None
    due_date: Optional[str] = None
    assignee_id: Optional[str] = None


class ResetPasswordBody(BaseModel):
    new_password: str = Field(min_length=6, max_length=120)


class BulkDeleteTasksBody(BaseModel):
    task_ids: List[str] = Field(min_length=1, max_length=500)
    password: str


# ------------------------------------------------------------
# Auth endpoints
# ------------------------------------------------------------
@api.post("/auth/register")
async def register(body: RegisterBody, response: Response):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "role": body.role,
        "avatar": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {**public_user(user), "access_token": access}


@api.post("/auth/login")
async def login(body: LoginBody, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {**public_user(user), "access_token": access}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


# ------------------------------------------------------------
# Users
# ------------------------------------------------------------
@api.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, _: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] != "employee":
        raise HTTPException(status_code=403, detail="Only employee accounts can be deleted")
    task_ids = [t["id"] for t in await db.tasks.find({"assignee_id": user_id}, {"id": 1}).to_list(2000)]
    if task_ids:
        await db.time_logs.delete_many({"task_id": {"$in": task_ids}})
        await db.audit_logs.delete_many({"task_id": {"$in": task_ids}})
        await db.tasks.delete_many({"assignee_id": user_id})
    await db.time_logs.delete_many({"user_id": user_id})
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


@api.post("/users/{user_id}/reset-password")
async def reset_password(user_id: str, body: ResetPasswordBody, _: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}


# ------------------------------------------------------------
# Tasks
# ------------------------------------------------------------
async def _enrich_tasks(tasks: List[dict]) -> List[dict]:
    user_ids = list({t["assignee_id"] for t in tasks if t.get("assignee_id")})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}).to_list(500) if user_ids else []
    user_map = {u["id"]: u for u in users}
    for t in tasks:
        a = user_map.get(t.get("assignee_id"))
        t["assignee"] = {"id": a["id"], "name": a["name"], "email": a["email"]} if a else None
    return tasks


@api.get("/tasks")
async def list_tasks(request: Request, scope: str = "mine", user: dict = Depends(get_current_user)):
    query: dict = {}
    if scope == "all":
        if user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
    else:
        query["assignee_id"] = user["id"]
    tasks = await db.tasks.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    tasks = await _enrich_tasks(tasks)
    return tasks


TRACKED_TASK_FIELDS = ["title", "status", "priority", "due_date", "assignee_id"]


async def _record_audit(task_id: str, actor: dict, action: str, changes: Optional[List[dict]] = None) -> None:
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "task_id": task_id,
        "actor_id": actor["id"],
        "actor_name": actor["name"],
        "action": action,
        "changes": changes or [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


@api.post("/tasks")
async def create_task(body: TaskCreate, user: dict = Depends(get_current_user)):
    assignee_id = body.assignee_id or user["id"]
    if assignee_id != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Cannot assign to others")
    # ensure assignee exists
    assignee = await db.users.find_one({"id": assignee_id})
    if not assignee:
        raise HTTPException(status_code=400, detail="Assignee not found")
    if user["role"] != "admin" and body.priority == "urgent":
        raise HTTPException(status_code=403, detail="Only admin can create urgent tasks")
    # Tasks created by an admin are always urgent priority, regardless of what
    # was submitted, so they surface immediately to whoever they get assigned to.
    priority = "urgent" if user["role"] == "admin" else body.priority
    task = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "description": body.description.strip(),
        "priority": priority,
        "status": body.status,
        "due_date": body.due_date,
        "assignee_id": assignee_id,
        "created_by": user["id"],
        "hours_logged": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "in_progress_at": None,
    }
    if task["status"] == "done":
        task["completed_at"] = task["updated_at"]
    if task["status"] == "in_progress":
        task["in_progress_at"] = task["updated_at"]
    await db.tasks.insert_one(task)
    await _record_audit(task["id"], user, "created", [
        {"field": "status", "from": None, "to": task["status"]},
        {"field": "priority", "from": None, "to": task["priority"]},
        {"field": "assignee_id", "from": None, "to": assignee["name"]},
    ])
    task.pop("_id", None)
    enriched = await _enrich_tasks([task])
    return enriched[0]


@api.patch("/tasks/{task_id}")
async def update_task(task_id: str, body: TaskUpdate, user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if user["role"] != "admin" and task["assignee_id"] != user["id"] and task["created_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    # The edit dialog always submits assignee_id (even unchanged), so only block this when a
    # non-admin is actually trying to change it — not merely echoing back the current value.
    if "assignee_id" in updates and user["role"] != "admin" and updates["assignee_id"] != task.get("assignee_id"):
        raise HTTPException(status_code=403, detail="Only admin can reassign")
    if updates.get("priority") == "urgent" and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can set urgent priority")

    if updates.get("status") == "done" and task.get("status") != "done":
        updates["completed_at"] = datetime.now(timezone.utc).isoformat()
    if updates.get("status") and updates["status"] != "done":
        updates["completed_at"] = None
    if updates.get("status") == "in_progress" and task.get("status") != "in_progress":
        updates["in_progress_at"] = datetime.now(timezone.utc).isoformat()

    # Hours logged are computed, not user-entered: leaving in_progress (to todo or done)
    # closes out the current session and adds its elapsed time to the cumulative total.
    # Re-entering in_progress later (in_progress_at gets overwritten above) starts a fresh
    # session, so pausing and resuming a task accumulates rather than resets.
    if (
        task.get("status") == "in_progress"
        and updates.get("status")
        and updates["status"] != "in_progress"
        and task.get("in_progress_at")
    ):
        session_start = datetime.fromisoformat(task["in_progress_at"])
        now = datetime.now(timezone.utc)
        elapsed_hours = (now - session_start).total_seconds() / 3600.0
        if elapsed_hours > 0:
            await db.time_logs.insert_one({
                "id": str(uuid.uuid4()),
                "task_id": task_id,
                "user_id": user["id"],
                "hours": round(elapsed_hours, 4),
                "note": f"Auto-logged: in progress → {updates['status']}",
                "created_at": now.isoformat(),
            })
            updates["hours_logged"] = round(float(task.get("hours_logged") or 0) + elapsed_hours, 4)

    changes = []
    for field in TRACKED_TASK_FIELDS:
        if field in updates and updates[field] != task.get(field):
            changes.append({"field": field, "from": task.get(field), "to": updates[field]})
    if changes:
        for c in changes:
            if c["field"] == "assignee_id":
                old_user = await db.users.find_one({"id": c["from"]}) if c["from"] else None
                new_user = await db.users.find_one({"id": c["to"]}) if c["to"] else None
                c["from"] = old_user["name"] if old_user else c["from"]
                c["to"] = new_user["name"] if new_user else c["to"]
        await _record_audit(task_id, user, "updated", changes)

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    fresh = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    enriched = await _enrich_tasks([fresh])
    return enriched[0]


@api.delete("/tasks/{task_id}")
async def delete_task(task_id: str, _: dict = Depends(require_admin)):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.tasks.delete_one({"id": task_id})
    await db.time_logs.delete_many({"task_id": task_id})
    await db.audit_logs.delete_many({"task_id": task_id})
    return {"ok": True}


@api.post("/tasks/bulk-delete")
async def bulk_delete_tasks(body: BulkDeleteTasksBody, user: dict = Depends(require_admin)):
    # Re-checks the admin's own password on every purge call (not just once per session) so a
    # bulk, irreversible delete always requires a fresh, explicit confirmation of identity.
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect password")
    task_ids = list(dict.fromkeys(body.task_ids))
    result = await db.tasks.delete_many({"id": {"$in": task_ids}})
    await db.time_logs.delete_many({"task_id": {"$in": task_ids}})
    await db.audit_logs.delete_many({"task_id": {"$in": task_ids}})
    return {"ok": True, "deleted_count": result.deleted_count}


@api.get("/tasks/{task_id}/audit-log")
async def get_task_audit_log(task_id: str, _: dict = Depends(require_admin)):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    logs = await db.audit_logs.find({"task_id": task_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return logs


@api.get("/tasks/{task_id}/time-logs")
async def list_time_logs(task_id: str, user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if user["role"] != "admin" and task["assignee_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    logs = await db.time_logs.find({"task_id": task_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return logs


@api.get("/time-logs/mine")
async def list_my_time_logs(user: dict = Depends(get_current_user)):
    logs = await db.time_logs.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return logs


# ------------------------------------------------------------
# Admin dashboard
# ------------------------------------------------------------
@api.get("/admin/dashboard")
async def admin_dashboard(_: dict = Depends(require_admin)):
    employees = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(2000)

    # Stats per user
    per_user = {}
    for u in employees:
        per_user[u["id"]] = {
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "role": u["role"],
            "total_tasks": 0,
            "todo": 0,
            "in_progress": 0,
            "done": 0,
            "hours_logged": 0.0,
        }

    status_counts = {"todo": 0, "in_progress": 0, "done": 0}
    total_hours = 0.0
    for t in tasks:
        status_counts[t["status"]] = status_counts.get(t["status"], 0) + 1
        total_hours += float(t.get("hours_logged") or 0)
        uid = t.get("assignee_id")
        if uid in per_user:
            per_user[uid]["total_tasks"] += 1
            per_user[uid][t["status"]] = per_user[uid].get(t["status"], 0) + 1
            per_user[uid]["hours_logged"] += float(t.get("hours_logged") or 0)

    return {
        "totals": {
            "tasks": len(tasks),
            "employees": len([usr for usr in employees if usr["role"] == "employee"]),
            "completed": status_counts.get("done", 0),
            "hours_logged": round(total_hours, 2),
        },
        "status_counts": status_counts,
        "per_user": list(per_user.values()),
    }


@api.get("/admin/time-logs")
async def list_all_time_logs(_: dict = Depends(require_admin)):
    logs = await db.time_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return logs


@api.get("/admin/tasks/export.csv")
async def export_tasks_csv(_: dict = Depends(require_admin)):
    import csv
    import io

    tasks = await db.tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    user_ids = list({t.get("assignee_id") for t in tasks if t.get("assignee_id")})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}).to_list(500) if user_ids else []
    user_map = {u["id"]: u for u in users}

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "title", "description", "status", "priority",
        "due_date", "hours_logged", "assignee_name", "assignee_email",
        "created_at", "completed_at",
    ])
    for t in tasks:
        a = user_map.get(t.get("assignee_id")) or {}
        writer.writerow([
            t.get("id", ""),
            t.get("title", ""),
            (t.get("description") or "").replace("\n", " "),
            t.get("status", ""),
            t.get("priority", ""),
            t.get("due_date") or "",
            f"{float(t.get('hours_logged') or 0):.2f}",
            a.get("name", ""),
            a.get("email", ""),
            t.get("created_at") or "",
            t.get("completed_at") or "",
        ])

    filename = f"taskflow-tasks-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ------------------------------------------------------------
# Bootstrap
# ------------------------------------------------------------
DEMO_EMPLOYEES = [
    {"email": "maya@taskflow.com", "name": "Maya Hill", "password": "employee123"},
    {"email": "leo@taskflow.com", "name": "Leo Park", "password": "employee123"},
    {"email": "ava@taskflow.com", "name": "Ava Singh", "password": "employee123"},
]


async def seed_users():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@taskflow.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "avatar": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin user %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})

    for emp in DEMO_EMPLOYEES:
        e = await db.users.find_one({"email": emp["email"]})
        if e is None:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": emp["email"],
                "name": emp["name"],
                "password_hash": hash_password(emp["password"]),
                "role": "employee",
                "avatar": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Seeded employee %s", emp["email"])


async def seed_sample_tasks():
    # Only seed if there are no tasks at all
    count = await db.tasks.count_documents({})
    if count > 0:
        return
    employees = await db.users.find({"role": "employee"}).to_list(10)
    if not employees:
        return
    samples = [
        {"title": "Draft Q1 campaign brief", "description": "Outline messaging and channels for Q1 campaign.", "priority": "high", "status": "in_progress", "hours_logged": 3.5},
        {"title": "Audit onboarding flow", "description": "Review the new-user onboarding flow and propose UX fixes.", "priority": "medium", "status": "todo", "hours_logged": 0},
        {"title": "Ship release notes v1.4", "description": "Compile release notes and publish to the blog.", "priority": "low", "status": "done", "hours_logged": 1.5},
        {"title": "Customer interviews x5", "description": "Schedule and complete 5 customer discovery calls.", "priority": "high", "status": "in_progress", "hours_logged": 4.0},
        {"title": "Update pricing page", "description": "Reflect new tier in the public pricing page.", "priority": "medium", "status": "done", "hours_logged": 2.0},
        {"title": "Triage bug backlog", "description": "Re-prioritise the open bug backlog.", "priority": "low", "status": "todo", "hours_logged": 0},
    ]
    now = datetime.now(timezone.utc)
    for i, s in enumerate(samples):
        emp = employees[i % len(employees)]
        task = {
            "id": str(uuid.uuid4()),
            "title": s["title"],
            "description": s["description"],
            "priority": s["priority"],
            "status": s["status"],
            "due_date": (now + timedelta(days=3 + i)).date().isoformat(),
            "assignee_id": emp["id"],
            "created_by": emp["id"],
            "hours_logged": s["hours_logged"],
            "created_at": (now - timedelta(days=i)).isoformat(),
            "updated_at": (now - timedelta(days=i)).isoformat(),
            "completed_at": (now - timedelta(days=i)).isoformat() if s["status"] == "done" else None,
            "in_progress_at": (now - timedelta(days=i)).isoformat() if s["status"] in ("in_progress", "done") else None,
        }
        await db.tasks.insert_one(task)


async def migrate_reset_in_progress_sessions():
    """One-time, idempotent migration for the switch to automatic hours tracking.

    Tasks that were already sitting in "in_progress" before this feature existed have an
    in_progress_at from whatever paradigm came before it (or none at all) — closing that
    "session" later would credit the task with the full elapsed calendar time since then,
    not real work time. Reset in_progress_at to the migration moment for any task currently
    in_progress, so tracking starts clean for everyone. Guarded by a marker doc so this only
    ever runs once, even across repeated deploys/restarts.
    """
    marker_id = "reset_in_progress_sessions_v1"
    if await db.migrations.find_one({"id": marker_id}):
        return
    now = datetime.now(timezone.utc).isoformat()
    result = await db.tasks.update_many({"status": "in_progress"}, {"$set": {"in_progress_at": now}})
    await db.migrations.insert_one({"id": marker_id, "ran_at": now, "tasks_reset": result.modified_count})
    logger.info("Migration %s: reset in_progress_at on %d task(s).", marker_id, result.modified_count)


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.tasks.create_index("assignee_id")
        await db.tasks.create_index("status")
        await db.time_logs.create_index("task_id")
        await db.audit_logs.create_index("task_id")
        await seed_users()
        await seed_sample_tasks()
        await migrate_reset_in_progress_sessions()
        logger.info("Startup complete: indexes ensured and seeds run.")
    except Exception as exc:  # pragma: no cover - logs the connectivity issue
        logger.exception(
            "Startup database step failed (will continue serving but DB may be unreachable): %s", exc
        )


@app.get("/health")
async def health_root():
    return {"status": "ok"}


@api.get("/health")
async def health_api():
    try:
        await db.command("ping")
        return {"status": "ok", "db": "ok"}
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "degraded", "db": str(exc)})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# Mount router + CORS
app.include_router(api)

# CORS origins: comma-separated list in FRONTEND_URL env (or "*" for wildcard).
# When "*" is used we cannot allow credentials per CORS spec, but Bearer-token
# auth still works (token is sent in the Authorization header, not via cookies).
_frontend_env = os.environ.get("FRONTEND_URL", "http://localhost:3000")
_origins = [o.strip() for o in _frontend_env.split(",") if o.strip()]
_use_wildcard = "*" in _origins
if _use_wildcard:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    if "http://localhost:3000" not in _origins:
        _origins.append("http://localhost:3000")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
