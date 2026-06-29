import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Loader2, Plus, Search, Users, ListChecks, Clock, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import TaskDialog from "@/components/TaskDialog";
import TaskCard from "@/components/TaskCard";

const STATUS_COLORS = { todo: "#64748B", in_progress: "#F59E0B", done: "#10B981" };

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, u] = await Promise.all([
        api.get("/admin/dashboard"),
        api.get("/tasks", { params: { scope: "all" } }),
        api.get("/users"),
      ]);
      setStats(s.data);
      setTasks(t.data);
      setEmployees(u.data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upsert = (saved) => setTasks((prev) => {
    const idx = prev.findIndex((x) => x.id === saved.id);
    if (idx === -1) return [saved, ...prev];
    const copy = [...prev]; copy[idx] = saved; return copy;
  });

  const changeStatus = async (task, status) => {
    try { const { data } = await api.patch(`/tasks/${task.id}`, { status }); upsert(data); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const removeTask = async (task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast.success("Task deleted");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return tasks.filter((t) => {
      if (q && !(t.title.toLowerCase().includes(q) || t.assignee?.name?.toLowerCase().includes(q))) return false;
      if (filterAssignee !== "all" && t.assignee_id !== filterAssignee) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (overdueOnly) {
        if (!t.due_date || t.status === "done") return false;
        if (new Date(t.due_date) >= today) return false;
      }
      return true;
    });
  }, [tasks, query, filterAssignee, filterPriority, filterStatus, overdueOnly]);

  const resetFilters = () => {
    setQuery(""); setFilterAssignee("all"); setFilterPriority("all");
    setFilterStatus("all"); setOverdueOnly(false);
  };
  const activeFilterCount = [
    query.trim() ? 1 : 0,
    filterAssignee !== "all" ? 1 : 0,
    filterPriority !== "all" ? 1 : 0,
    filterStatus !== "all" ? 1 : 0,
    overdueOnly ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const workloadData = useMemo(() => {
    if (!stats) return [];
    return stats.per_user
      .filter((u) => u.role !== "admin" || u.total_tasks > 0)
      .map((u) => ({
        name: u.name.split(" ")[0],
        Done: u.done || 0,
        "In Progress": u.in_progress || 0,
        "To Do": u.todo || 0,
        Hours: Number((u.hours_logged || 0).toFixed(1)),
      }));
  }, [stats]);

  const statusPie = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "To Do", value: stats.status_counts.todo || 0, key: "todo" },
      { name: "In Progress", value: stats.status_counts.in_progress || 0, key: "in_progress" },
      { name: "Done", value: stats.status_counts.done || 0, key: "done" },
    ];
  }, [stats]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 animate-spin" size={16} /> Loading dashboard…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin</div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Team Overview</h1>
          <p className="mt-1 text-sm text-slate-500">Workload, progress and compensation signals across the team.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={async () => {
              try {
                const res = await api.get("/admin/tasks/export.csv", { responseType: "blob" });
                const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
                const a = document.createElement("a");
                a.href = url;
                const dispo = res.headers?.["content-disposition"] || "";
                const m = /filename="?([^";]+)"?/i.exec(dispo);
                a.download = m ? m[1] : "taskflow-tasks.csv";
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                toast.success("CSV downloaded");
              } catch (e) {
                toast.error(formatApiError(e));
              }
            }}
            variant="outline"
            className="h-10 rounded-md border-slate-300"
            data-testid="admin-export-csv-button"
          >
            <Download size={16} /> Export CSV
          </Button>
          <Button onClick={() => { setEditingTask(null); setDialogOpen(true); }} className="h-10 bg-klein hover:bg-kleinDark" data-testid="admin-new-task-button">
            <Plus size={16} /> New task
          </Button>
        </div>
      </div>      <div className="grid grid-cols-2 gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-4">
        {[
          [Users, "Employees", stats.totals.employees],
          [ListChecks, "Total tasks", stats.totals.tasks],
          [CheckCircle2, "Completed", stats.totals.completed],
          [Clock, "Hours logged", stats.totals.hours_logged.toFixed(1)],
        ].map(([Icon, k, v]) => (
          <div key={k} className="bg-white px-5 py-4" data-testid={`kpi-${k.toLowerCase().replace(/\s/g, "-")}`}>
            <div className="flex items-center gap-2 text-slate-500"><Icon size={14} /> <span className="text-xs uppercase tracking-[0.18em]">{k}</span></div>
            <div className="mt-2 font-display text-3xl font-semibold text-slate-900">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="border border-slate-200 bg-white p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Workload by employee</h3>
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Tasks per status</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="2 2" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94A3B8" allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 4, border: "1px solid #E2E8F0", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="To Do" stackId="a" fill="#94A3B8" />
                <Bar dataKey="In Progress" stackId="a" fill="#F59E0B" />
                <Bar dataKey="Done" stackId="a" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Status breakdown</h3>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} stroke="#fff">
                  {statusPie.map((s) => (
                    <Cell key={s.key} fill={STATUS_COLORS[s.key]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 4, border: "1px solid #E2E8F0", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="rounded-md border border-slate-200 bg-white p-1">
          <TabsTrigger value="employees" data-testid="tab-employees">Employees</TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-all-tasks">All tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="mt-4 border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Tasks</th>
                <th className="px-4 py-3 font-medium">Done</th>
                <th className="px-4 py-3 font-medium">In Progress</th>
                <th className="px-4 py-3 font-medium">Hours</th>
              </tr>
            </thead>
            <tbody>
              {stats.per_user.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`employee-row-${u.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-klein text-xs font-semibold text-white">
                        {u.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{u.name}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="rounded-sm border border-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-widest text-slate-600">{u.role}</span></td>
                  <td className="px-4 py-3 font-mono">{u.total_tasks}</td>
                  <td className="px-4 py-3 font-mono text-emerald-700">{u.done}</td>
                  <td className="px-4 py-3 font-mono text-amber-700">{u.in_progress}</td>
                  <td className="px-4 py-3 font-mono">{Number(u.hours_logged || 0).toFixed(1)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="relative w-full md:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input data-testid="admin-task-search" placeholder="Search tasks or assignees…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 rounded-md border-slate-300 pl-9" />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Assignee</Label>
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="h-10 w-44 rounded-md border-slate-300" data-testid="filter-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Priority</Label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="h-10 w-36 rounded-md border-slate-300" data-testid="filter-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any priority</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-10 w-36 rounded-md border-slate-300" data-testid="filter-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-slate-300 px-3 h-10">
              <Switch id="overdue-only" checked={overdueOnly} onCheckedChange={setOverdueOnly} data-testid="filter-overdue" />
              <Label htmlFor="overdue-only" className="text-sm text-slate-700">Overdue only</Label>
            </div>

            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="filter-reset" className="h-10 text-slate-600">
                Clear ({activeFilterCount})
              </Button>
            )}

            <div className="ml-auto text-sm text-slate-500" data-testid="filter-result-count">
              {filtered.length} of {tasks.length} tasks
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.length === 0 ? (
              <div className="col-span-full border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No tasks match the filter.
              </div>
            ) : filtered.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onEdit={(task) => { setEditingTask(task); setDialogOpen(true); }}
                onDelete={removeTask}
                onChangeStatus={changeStatus}
                onLogTime={() => toast.info("Use the My Tasks page to log time on your own tasks.")}
                showAssignee
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        employees={employees}
        currentUser={user}
        onSaved={(t) => { upsert(t); load(); }}
      />
    </div>
  );
}
