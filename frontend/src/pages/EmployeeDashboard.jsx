import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import TaskDialog from "@/components/TaskDialog";
import TimeLogDialog from "@/components/TimeLogDialog";
import TaskCard from "@/components/TaskCard";

const COLUMNS = [
  { key: "todo", label: "To Do", accent: "bg-slate-100 text-slate-700" },
  { key: "in_progress", label: "In Progress", accent: "bg-amber-100 text-amber-800" },
  { key: "done", label: "Done", accent: "bg-emerald-100 text-emerald-800" },
];

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([user]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const [timeLogTask, setTimeLogTask] = useState(null);
  const [timeLogOpen, setTimeLogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/tasks", { params: { scope: "mine" } });
      setTasks(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (user?.role === "admin") {
      api.get("/users").then((r) => setEmployees(r.data)).catch(() => {});
    } else {
      setEmployees([user]);
    }
  }, [load, user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
  }, [tasks, query]);

  const grouped = useMemo(() => {
    const out = { todo: [], in_progress: [], done: [] };
    for (const t of filtered) out[t.status]?.push(t);
    return out;
  }, [filtered]);

  const totalHours = useMemo(() => tasks.reduce((s, t) => s + Number(t.hours_logged || 0), 0), [tasks]);

  const openCreate = () => { setEditingTask(null); setDialogOpen(true); };
  const openEdit = (t) => { setEditingTask(t); setDialogOpen(true); };

  const upsert = (saved) => setTasks((prev) => {
    const idx = prev.findIndex((x) => x.id === saved.id);
    if (idx === -1) return [saved, ...prev];
    const copy = [...prev]; copy[idx] = saved; return copy;
  });

  const changeStatus = async (task, status) => {
    try {
      const { data } = await api.patch(`/tasks/${task.id}`, { status });
      upsert(data);
      toast.success(`Moved to ${status.replace("_", " ")}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const removeTask = async (task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast.success("Task deleted");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const openTimeLog = (t) => { setTimeLogTask(t); setTimeLogOpen(true); };

  // --- Drag & drop ---
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const onDragStart = (task) => (e) => {
    setDraggingId(task.id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", task.id); } catch { /* noop */ }
  };
  const onDragEnd = () => { setDraggingId(null); setDragOverCol(null); };
  const onColDragOver = (col) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== col) setDragOverCol(col);
  };
  const onColDragLeave = () => setDragOverCol(null);
  const onColDrop = (col) => async (e) => {
    e.preventDefault();
    setDragOverCol(null);
    const id = draggingId || e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === col) return;
    // optimistic update
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: col } : t)));
    try {
      const { data } = await api.patch(`/tasks/${id}`, { status: col });
      upsert(data);
      toast.success(`Moved to ${col.replace("_", " ")}`);
    } catch (err) {
      toast.error(formatApiError(err));
      load();
    }
  };

  const stats = useMemo(() => ({
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    hours: totalHours,
  }), [tasks, totalHours]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Workspace</div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">My Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">Track work in progress and log your hours.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              data-testid="task-search-input"
              placeholder="Search tasks…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 rounded-md border-slate-300 pl-9 md:w-72"
            />
          </div>
          <Button onClick={openCreate} className="h-10 bg-klein hover:bg-kleinDark" data-testid="new-task-button">
            <Plus size={16} /> New task
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-4">
        {[
          ["Total", stats.total],
          ["In progress", stats.in_progress],
          ["Completed", stats.done],
          ["Hours logged", stats.hours.toFixed(1)],
        ].map(([k, v]) => (
          <div key={k} className="bg-white px-5 py-4">
            <div className="font-display text-3xl font-semibold text-slate-900" data-testid={`stat-${k.toLowerCase().replace(/\s/g, "-")}`}>{v}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{k}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="mr-2 animate-spin" size={16} /> Loading tasks…</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3" data-testid="kanban-board">
          {COLUMNS.map((col) => (
            <div key={col.key} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-widest ${col.accent}`}>{col.label}</span>
                  <span className="text-sm font-medium text-slate-500" data-testid={`col-count-${col.key}`}>{grouped[col.key].length}</span>
                </div>
              </div>
              <div
                className={`flex min-h-[120px] flex-col gap-3 rounded-md p-2 transition-colors ${
                  dragOverCol === col.key ? "bg-klein/5 ring-1 ring-klein" : ""
                }`}
                data-testid={`column-${col.key}`}
                onDragOver={onColDragOver(col.key)}
                onDragLeave={onColDragLeave}
                onDrop={onColDrop(col.key)}
              >
                {grouped[col.key].length === 0 ? (
                  <div className="border border-dashed border-slate-200 bg-white/60 p-6 text-center text-xs text-slate-400">
                    {dragOverCol === col.key ? "Drop here" : "No tasks here"}
                  </div>
                ) : (
                  grouped[col.key].map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onEdit={openEdit}
                      onDelete={removeTask}
                      onChangeStatus={changeStatus}
                      onLogTime={openTimeLog}
                      draggable
                      onDragStart={onDragStart(t)}
                      onDragEnd={onDragEnd}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        employees={employees}
        currentUser={user}
        onSaved={upsert}
      />
      <TimeLogDialog
        open={timeLogOpen}
        onOpenChange={setTimeLogOpen}
        task={timeLogTask}
        onLogged={load}
      />
    </div>
  );
}
