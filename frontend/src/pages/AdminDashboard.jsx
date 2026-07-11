import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Loader2, Plus, Search, Users, ListChecks, Clock, CheckCircle2, Download, Trash2, KeyRound, CalendarIcon, X, History, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import TaskDialog from "@/components/TaskDialog";
import TaskCard from "@/components/TaskCard";
import ResetPasswordDialog from "@/components/ResetPasswordDialog";
import AuditLogDialog from "@/components/AuditLogDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STATUS_COLORS = { todo: "#64748B", in_progress: "#F59E0B", done: "#10B981" };
const STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];
// "Not Started" isn't a real status field value — it means a task has never moved to
// in_progress (in_progress_at is unset), which is how the urgent tasks table already
// labels them. Selecting it lets admins isolate untouched urgent tasks specifically.
const taskMatchesStatusFilter = (task, statusValue) =>
  statusValue === "not_started" ? !task.in_progress_at : task.status === statusValue;

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  // Empty array = no status filter applied (matches every status).
  const [filterStatuses, setFilterStatuses] = useState([]);
  // Defaults to today->today so admins land on "what moved to in progress today" rather than every task ever created.
  const [filterInProgressRange, setFilterInProgressRange] = useState(() => {
    const t = format(new Date(), "yyyy-MM-dd");
    return { from: t, to: t };
  });
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [resettingUser, setResettingUser] = useState(null);
  const [historyTask, setHistoryTask] = useState(null);
  // Tracked explicitly (not an uncontrolled Tabs defaultValue) so the active tab survives
  // the full-page reload state that follows every create/edit/delete/status-change action.
  const [activeTab, setActiveTab] = useState("reports");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [t, u, l] = await Promise.all([
        api.get("/tasks", { params: { scope: "all" } }),
        api.get("/users"),
        api.get("/admin/time-logs"),
      ]);
      setTasks(t.data);
      setEmployees(u.data);
      setTimeLogs(l.data);
    } catch (e) {
      // Background refreshes fail silently rather than repeatedly toasting every 20s.
      if (!silent) toast.error(formatApiError(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Keep Reports, Employees, and All tasks in sync with the server without a manual refresh.
    const interval = setInterval(() => load({ silent: true }), 20_000);
    return () => clearInterval(interval);
  }, [load]);

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

  const removeEmployee = async (employee) => {
    if (!window.confirm(`Delete "${employee.name}"? This also removes their tasks and time logs.`)) return;
    try {
      await api.delete(`/users/${employee.id}`);
      setEmployees((prev) => prev.filter((e) => e.id !== employee.id));
      setTasks((prev) => prev.filter((t) => t.assignee_id !== employee.id));
      toast.success("Employee deleted");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  // Filtering drives everything below: the KPI tiles, both charts, and the
  // employee roster table all recompute from this same filtered task set so
  // they stay in sync with whatever the admin has selected.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return tasks.filter((t) => {
      if (q && !(t.title.toLowerCase().includes(q) || t.assignee?.name?.toLowerCase().includes(q))) return false;
      if (filterAssignee !== "all" && t.assignee_id !== filterAssignee) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterStatuses.length > 0 && !filterStatuses.some((s) => taskMatchesStatusFilter(t, s))) return false;
      if (filterInProgressRange.from || filterInProgressRange.to) {
        // Done work is always hidden while a date range is active — the filter is scoped
        // to in-progress/not-started work only. Below that, "not started" is defined the
        // same way the status filter defines it (no in_progress_at yet) so the two stay
        // consistent: a task the "Not Started" checkbox matches never gets hidden by the
        // date range, even if it's a legacy in_progress task from before this was tracked.
        if (t.status === "done") return false;
        const d = t.in_progress_at?.slice(0, 10);
        if (d) {
          if (filterInProgressRange.from && d < filterInProgressRange.from) return false;
          if (filterInProgressRange.to && d > filterInProgressRange.to) return false;
        }
      }
      if (overdueOnly) {
        if (!t.due_date || t.status === "done") return false;
        if (new Date(t.due_date) >= today) return false;
      }
      return true;
    });
  }, [tasks, query, filterAssignee, filterPriority, filterStatuses, filterInProgressRange, overdueOnly]);

  // Same filters as `filtered`, minus due-date/overdue: completion date and log date are about
  // when work happened, not a task's due date, so the "today" KPIs below stay accurate even
  // when the due-date filter (which defaults to today) narrows what's shown in the tiles.
  const filteredForActivity = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !(t.title.toLowerCase().includes(q) || t.assignee?.name?.toLowerCase().includes(q))) return false;
      if (filterAssignee !== "all" && t.assignee_id !== filterAssignee) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterStatuses.length > 0 && !filterStatuses.some((s) => taskMatchesStatusFilter(t, s))) return false;
      return true;
    });
  }, [tasks, query, filterAssignee, filterPriority, filterStatuses]);

  const toggleStatus = (value) => setFilterStatuses((prev) =>
    prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
  );

  const resetFilters = () => {
    setQuery(""); setFilterAssignee("all"); setFilterPriority("all");
    setFilterStatuses([]); setFilterInProgressRange({ from: "", to: "" }); setOverdueOnly(false);
  };
  const activeFilterCount = [
    query.trim() ? 1 : 0,
    filterAssignee !== "all" ? 1 : 0,
    filterPriority !== "all" ? 1 : 0,
    filterStatuses.length > 0 ? 1 : 0,
    (filterInProgressRange.from || filterInProgressRange.to) ? 1 : 0,
    overdueOnly ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const todayISO = format(new Date(), "yyyy-MM-dd");

  // "Completed today" / "Hours logged today" reflect actual activity that happened today —
  // using completed_at (set when a task's status flips to done) and time-log timestamps —
  // rather than lifetime totals, and still respect whatever filters are active.
  const completedToday = useMemo(() => {
    return filteredForActivity.filter((t) => t.completed_at && t.completed_at.slice(0, 10) === todayISO).length;
  }, [filteredForActivity, todayISO]);

  const hoursLoggedToday = useMemo(() => {
    const activityTaskIds = new Set(filteredForActivity.map((t) => t.id));
    return timeLogs
      .filter((l) => activityTaskIds.has(l.task_id) && l.created_at && l.created_at.slice(0, 10) === todayISO)
      .reduce((sum, l) => sum + Number(l.hours || 0), 0);
  }, [filteredForActivity, timeLogs, todayISO]);

  const stats = useMemo(() => {
    const perUserMap = {};
    employees.forEach((u) => {
      perUserMap[u.id] = {
        id: u.id, name: u.name, email: u.email, role: u.role,
        total_tasks: 0, todo: 0, in_progress: 0, done: 0, hours_logged: 0,
      };
    });
    const status_counts = { todo: 0, in_progress: 0, done: 0 };
    let hours_logged = 0;
    for (const t of filtered) {
      status_counts[t.status] = (status_counts[t.status] || 0) + 1;
      hours_logged += Number(t.hours_logged || 0);
      const pu = perUserMap[t.assignee_id];
      if (pu) {
        pu.total_tasks += 1;
        pu[t.status] = (pu[t.status] || 0) + 1;
        pu.hours_logged += Number(t.hours_logged || 0);
      }
    }
    return {
      totals: {
        tasks: filtered.length,
        employees: employees.filter((e) => e.role === "employee").length,
        completed: status_counts.done,
        hours_logged,
      },
      status_counts,
      per_user: Object.values(perUserMap),
    };
  }, [filtered, employees]);

  const workloadData = useMemo(() => {
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

  const urgentTasks = useMemo(() => filtered.filter((t) => t.priority === "urgent"), [filtered]);
  // Urgent tasks get their own table (above), so the tile grid only shows the rest — avoids showing them twice.
  // Sorted alphabetically by assignee name by default so tiles group naturally by employee.
  const nonUrgentTiles = useMemo(() => {
    return filtered
      .filter((t) => t.priority !== "urgent")
      .slice()
      .sort((a, b) => (a.assignee?.name || "").localeCompare(b.assignee?.name || ""));
  }, [filtered]);

  const statusPie = useMemo(() => {
    return [
      { name: "To Do", value: stats.status_counts.todo || 0, key: "todo" },
      { name: "In Progress", value: stats.status_counts.in_progress || 0, key: "in_progress" },
      { name: "Done", value: stats.status_counts.done || 0, key: "done" },
    ];
  }, [stats]);

  if (loading) {
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
      </div>

      <div className="flex flex-wrap items-end gap-3 border border-slate-200 bg-white p-4">
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
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                data-testid="filter-status"
                className="h-10 w-40 justify-start rounded-md border-slate-300 text-left font-normal"
              >
                {filterStatuses.length === 0
                  ? "Any status"
                  : filterStatuses.length === STATUS_OPTIONS.length
                    ? "All statuses"
                    : filterStatuses.map((v) => STATUS_OPTIONS.find((o) => o.value === v)?.label).join(", ")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
              <div className="space-y-1">
                {STATUS_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={filterStatuses.includes(o.value)}
                      onCheckedChange={() => toggleStatus(o.value)}
                      data-testid={`filter-status-option-${o.value}`}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              {filterStatuses.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterStatuses([])}
                  className="mt-1 w-full rounded-none border-t border-slate-200 text-slate-600"
                  data-testid="filter-status-clear"
                >
                  <X size={14} /> Clear statuses
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-[0.18em] text-slate-500">In progress date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                data-testid="filter-in-progress-date"
                className="h-10 w-52 justify-start rounded-md border-slate-300 text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filterInProgressRange.from
                  ? filterInProgressRange.to && filterInProgressRange.to !== filterInProgressRange.from
                    ? `${format(parseISO(filterInProgressRange.from), "MMM d")} – ${format(parseISO(filterInProgressRange.to), "MMM d, yyyy")}`
                    : format(parseISO(filterInProgressRange.from), "PP")
                  : "Any date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="range"
                selected={{
                  from: filterInProgressRange.from ? parseISO(filterInProgressRange.from) : undefined,
                  to: filterInProgressRange.to ? parseISO(filterInProgressRange.to) : undefined,
                }}
                onSelect={(range) => setFilterInProgressRange({
                  from: range?.from ? format(range.from, "yyyy-MM-dd") : "",
                  to: range?.to ? format(range.to, "yyyy-MM-dd") : "",
                })}
              />
              {(filterInProgressRange.from || filterInProgressRange.to) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterInProgressRange({ from: "", to: "" })}
                  className="w-full rounded-none border-t border-slate-200 text-slate-600"
                  data-testid="filter-in-progress-date-clear"
                >
                  <X size={14} /> Clear date range
                </Button>
              )}
            </PopoverContent>
          </Popover>
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

      <div className="grid grid-cols-2 gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-4">
        {[
          [Users, "Employees", stats.totals.employees],
          [ListChecks, "Total tasks", stats.totals.tasks],
          [CheckCircle2, "Completed today", completedToday],
          [Clock, "Hours logged today", hoursLoggedToday.toFixed(1)],
        ].map(([Icon, k, v]) => (
          <div key={k} className="bg-white px-5 py-4" data-testid={`kpi-${k.toLowerCase().replace(/\s/g, "-")}`}>
            <div className="flex items-center gap-2 text-slate-500"><Icon size={14} /> <span className="text-xs uppercase tracking-[0.18em]">{k}</span></div>
            <div className="mt-2 font-display text-3xl font-semibold text-slate-900">{v}</div>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="rounded-md border border-slate-200 bg-white p-1">
          <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
          <TabsTrigger value="employees" data-testid="tab-employees">Employees</TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-all-tasks">All tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4">
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
        </TabsContent>

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
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {stats.per_user.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setViewingEmployee(u)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  data-testid={`employee-row-${u.id}`}
                >
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
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-slate-700"
                        onClick={(e) => { e.stopPropagation(); setResettingUser(u); }}
                        data-testid={`employee-reset-password-${u.id}`}
                        title="Reset password"
                      >
                        <KeyRound size={14} />
                      </Button>
                      {u.role === "employee" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                          onClick={(e) => { e.stopPropagation(); removeEmployee(u); }}
                          data-testid={`employee-delete-${u.id}`}
                          title="Delete employee"
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h3 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Urgent tasks</h3>
                <span className="text-xs text-slate-400">{urgentTasks.length}</span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">Task</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium">Created</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium">In progress</th>
                    <th className="whitespace-nowrap px-3 py-3 font-medium">Assigned</th>
                    <th className="px-3 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {urgentTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                        No urgent tasks.
                      </td>
                    </tr>
                  ) : urgentTasks.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`urgent-task-row-${t.id}`}>
                      <td className="px-3 py-2.5 font-medium text-slate-900">{t.title}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{t.created_at ? format(parseISO(t.created_at), "MMM d, h:mm a") : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{t.in_progress_at ? format(parseISO(t.in_progress_at), "MMM d, h:mm a") : "Not started"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{t.assignee?.name || "—"}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-700"
                            onClick={() => { setEditingTask(t); setDialogOpen(true); }}
                            data-testid={`urgent-task-edit-${t.id}`}
                            title="Edit task"
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-700"
                            onClick={() => setHistoryTask(t)}
                            data-testid={`urgent-task-history-${t.id}`}
                            title="View history"
                          >
                            <History size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-[11px] sm:grid-cols-2">
              {nonUrgentTiles.length === 0 ? (
                <div className="col-span-full border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  No tasks match the filter.
                </div>
              ) : nonUrgentTiles.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onEdit={(task) => { setEditingTask(task); setDialogOpen(true); }}
                  onDelete={removeTask}
                  onChangeStatus={changeStatus}
                  onLogTime={() => toast.info("Use the My Tasks page to log time on your own tasks.")}
                  onViewHistory={setHistoryTask}
                  showAssignee
                  compact
                  showInProgressDate
                />
              ))}
            </div>
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

      <Dialog open={Boolean(viewingEmployee)} onOpenChange={(o) => !o && setViewingEmployee(null)}>
        <DialogContent className="rounded-md border-slate-200 sm:max-w-2xl" data-testid="employee-tasks-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">{viewingEmployee?.name}'s tasks</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
            {viewingEmployee && tasks.filter((t) => t.assignee_id === viewingEmployee.id).length === 0 ? (
              <div className="col-span-full border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No tasks assigned to this employee.
              </div>
            ) : (
              viewingEmployee && tasks
                .filter((t) => t.assignee_id === viewingEmployee.id)
                .map((t) => <TaskCard key={t.id} task={t} canEdit={false} />)
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ResetPasswordDialog
        open={Boolean(resettingUser)}
        onOpenChange={(o) => !o && setResettingUser(null)}
        user={resettingUser}
      />

      <AuditLogDialog
        open={Boolean(historyTask)}
        onOpenChange={(o) => !o && setHistoryTask(null)}
        task={historyTask}
      />
    </div>
  );
}
