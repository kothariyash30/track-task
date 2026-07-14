import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Loader2, Plus, Users, ListChecks, Clock, CheckCircle2, Download, Trash2, KeyRound, History, Pencil, MoreVertical, UserCog } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import TaskDialog from "@/components/TaskDialog";
import TaskCard from "@/components/TaskCard";
import ResetPasswordDialog from "@/components/ResetPasswordDialog";
import AuditLogDialog from "@/components/AuditLogDialog";
import ReassignTaskDialog from "@/components/ReassignTaskDialog";
import TaskFilterBar from "@/components/TaskFilterBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { taskMatchesStatusFilter } from "@/lib/taskFilters";

const STATUS_COLORS = { todo: "#64748B", in_progress: "#F59E0B", done: "#10B981" };

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // The All Tasks tab's two panels (urgent table, remaining tiles) each get their own
  // fully independent filter state, separate from each other. The KPI tiles, Reports, and
  // Employees tabs below always reflect the complete, unfiltered task set.
  const [urgentFilterAssignee, setUrgentFilterAssignee] = useState("all");
  const [urgentFilterStatuses, setUrgentFilterStatuses] = useState([]);
  const [urgentFilterInProgressRange, setUrgentFilterInProgressRange] = useState(() => {
    const t = format(new Date(), "yyyy-MM-dd");
    return { from: t, to: t };
  });

  const [remainingQuery, setRemainingQuery] = useState("");
  const [remainingFilterAssignee, setRemainingFilterAssignee] = useState("all");
  const [remainingFilterPriority, setRemainingFilterPriority] = useState("all");
  const [remainingFilterStatuses, setRemainingFilterStatuses] = useState([]);
  // Defaults to "any date" (unlike the urgent panel's today default) so this general
  // browse view keeps showing everything until the admin explicitly narrows it.
  const [remainingFilterInProgressRange, setRemainingFilterInProgressRange] = useState({ from: "", to: "" });
  const [remainingOverdueOnly, setRemainingOverdueOnly] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [resettingUser, setResettingUser] = useState(null);
  const [historyTask, setHistoryTask] = useState(null);
  const [reassigningTask, setReassigningTask] = useState(null);
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

  const toggleUrgentStatus = (value) => setUrgentFilterStatuses((prev) =>
    prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
  );
  const resetUrgentFilters = () => {
    setUrgentFilterAssignee("all"); setUrgentFilterStatuses([]);
    setUrgentFilterInProgressRange({ from: "", to: "" });
  };
  const activeUrgentFilterCount = [
    urgentFilterAssignee !== "all" ? 1 : 0,
    urgentFilterStatuses.length > 0 ? 1 : 0,
    (urgentFilterInProgressRange.from || urgentFilterInProgressRange.to) ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const toggleRemainingStatus = (value) => setRemainingFilterStatuses((prev) =>
    prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
  );
  const resetRemainingFilters = () => {
    setRemainingQuery(""); setRemainingFilterAssignee("all"); setRemainingFilterPriority("all");
    setRemainingFilterStatuses([]); setRemainingFilterInProgressRange({ from: "", to: "" }); setRemainingOverdueOnly(false);
  };
  const activeRemainingFilterCount = [
    remainingQuery.trim() ? 1 : 0,
    remainingFilterAssignee !== "all" ? 1 : 0,
    remainingFilterPriority !== "all" ? 1 : 0,
    remainingFilterStatuses.length > 0 ? 1 : 0,
    (remainingFilterInProgressRange.from || remainingFilterInProgressRange.to) ? 1 : 0,
    remainingOverdueOnly ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const todayISO = format(new Date(), "yyyy-MM-dd");

  // "Completed today" / "Hours logged today" reflect actual activity that happened today —
  // using completed_at (set when a task's status flips to done) and time-log timestamps —
  // across the whole team (no filter UI narrows these anymore; the two All Tasks panels
  // below have their own independent filters instead).
  const completedToday = useMemo(() => {
    return tasks.filter((t) => t.completed_at && t.completed_at.slice(0, 10) === todayISO).length;
  }, [tasks, todayISO]);

  const hoursLoggedToday = useMemo(() => {
    return timeLogs
      .filter((l) => l.created_at && l.created_at.slice(0, 10) === todayISO)
      .reduce((sum, l) => sum + Number(l.hours || 0), 0);
  }, [timeLogs, todayISO]);

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
    for (const t of tasks) {
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
        tasks: tasks.length,
        employees: employees.filter((e) => e.role === "employee").length,
        completed: status_counts.done,
        hours_logged,
      },
      status_counts,
      per_user: Object.values(perUserMap),
    };
  }, [tasks, employees]);

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

  // The urgent table and the tile grid each run their own independent filter pass over
  // `tasks`, driven by their own independent filter state (urgent*/remaining* above) —
  // not a shared array — so filtering one panel can never affect the other.
  const urgentTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.priority !== "urgent") return false;
      if (urgentFilterAssignee !== "all" && t.assignee_id !== urgentFilterAssignee) return false;
      if (urgentFilterStatuses.length > 0 && !urgentFilterStatuses.some((s) => taskMatchesStatusFilter(t, s))) return false;
      if (urgentFilterInProgressRange.from || urgentFilterInProgressRange.to) {
        const d = t.in_progress_at?.slice(0, 10);
        if (d) {
          if (urgentFilterInProgressRange.from && d < urgentFilterInProgressRange.from) return false;
          if (urgentFilterInProgressRange.to && d > urgentFilterInProgressRange.to) return false;
        }
      }
      return true;
    });
  }, [tasks, urgentFilterAssignee, urgentFilterStatuses, urgentFilterInProgressRange]);

  // Sorted alphabetically by assignee name by default so tiles group naturally by employee.
  const nonUrgentTiles = useMemo(() => {
    const q = remainingQuery.trim().toLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const matches = tasks.filter((t) => {
      if (t.priority === "urgent") return false;
      if (q && !(t.title.toLowerCase().includes(q) || t.assignee?.name?.toLowerCase().includes(q))) return false;
      if (remainingFilterAssignee !== "all" && t.assignee_id !== remainingFilterAssignee) return false;
      if (remainingFilterPriority !== "all" && t.priority !== remainingFilterPriority) return false;
      if (remainingFilterStatuses.length > 0 && !remainingFilterStatuses.some((s) => taskMatchesStatusFilter(t, s))) return false;
      if (remainingFilterInProgressRange.from || remainingFilterInProgressRange.to) {
        // Same non-destructive rule as the urgent panel: a task with no in_progress_at
        // (never started) always bypasses the range rather than being hidden.
        const d = t.in_progress_at?.slice(0, 10);
        if (d) {
          if (remainingFilterInProgressRange.from && d < remainingFilterInProgressRange.from) return false;
          if (remainingFilterInProgressRange.to && d > remainingFilterInProgressRange.to) return false;
        }
      }
      if (remainingOverdueOnly) {
        if (!t.due_date || t.status === "done") return false;
        if (new Date(t.due_date) >= today) return false;
      }
      return true;
    });
    return matches.slice().sort((a, b) => (a.assignee?.name || "").localeCompare(b.assignee?.name || ""));
  }, [tasks, remainingQuery, remainingFilterAssignee, remainingFilterPriority, remainingFilterStatuses, remainingFilterInProgressRange, remainingOverdueOnly]);

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
          {/* Urgent panel is 25% narrower than an even 50/50 split (3fr vs 5fr = 37.5%/62.5%). */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_5fr]">
            <div className="border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h3 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Urgent tasks</h3>
                <span className="text-xs text-slate-400">{urgentTasks.length}</span>
              </div>
              <TaskFilterBar
                testidPrefix="urgent-filter"
                employees={employees}
                assignee={urgentFilterAssignee}
                onAssigneeChange={setUrgentFilterAssignee}
                statuses={urgentFilterStatuses}
                onToggleStatus={toggleUrgentStatus}
                onClearStatuses={() => setUrgentFilterStatuses([])}
                dateRange={urgentFilterInProgressRange}
                onDateRangeChange={setUrgentFilterInProgressRange}
                onClearDateRange={() => setUrgentFilterInProgressRange({ from: "", to: "" })}
                activeCount={activeUrgentFilterCount}
                onClearAll={resetUrgentFilters}
                resultCount={urgentTasks.length}
                totalCount={tasks.filter((t) => t.priority === "urgent").length}
              />
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-700"
                              data-testid={`urgent-task-menu-${t.id}`}
                            >
                              <MoreVertical size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => { setEditingTask(t); setDialogOpen(true); }} data-testid={`urgent-task-edit-${t.id}`}>
                              <Pencil size={14} /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setReassigningTask(t)} data-testid={`urgent-task-reassign-${t.id}`}>
                              <UserCog size={14} /> Reassign
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setHistoryTask(t)} data-testid={`urgent-task-history-${t.id}`}>
                              <History size={14} /> View history
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => removeTask(t)} className="text-red-600 focus:text-red-600" data-testid={`urgent-task-delete-${t.id}`}>
                              <Trash2 size={14} /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between border border-b-0 border-slate-200 bg-white px-4 py-3">
                <h3 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Remaining tasks</h3>
                <span className="text-xs text-slate-400">{nonUrgentTiles.length}</span>
              </div>
              <TaskFilterBar
                testidPrefix="remaining-filter"
                query={remainingQuery}
                onQueryChange={setRemainingQuery}
                employees={employees}
                assignee={remainingFilterAssignee}
                onAssigneeChange={setRemainingFilterAssignee}
                priority={remainingFilterPriority}
                onPriorityChange={setRemainingFilterPriority}
                statuses={remainingFilterStatuses}
                onToggleStatus={toggleRemainingStatus}
                onClearStatuses={() => setRemainingFilterStatuses([])}
                dateRange={remainingFilterInProgressRange}
                onDateRangeChange={setRemainingFilterInProgressRange}
                onClearDateRange={() => setRemainingFilterInProgressRange({ from: "", to: "" })}
                overdueOnly={remainingOverdueOnly}
                onOverdueChange={setRemainingOverdueOnly}
                activeCount={activeRemainingFilterCount}
                onClearAll={resetRemainingFilters}
                resultCount={nonUrgentTiles.length}
                totalCount={tasks.filter((t) => t.priority !== "urgent").length}
              />
              <div className="grid grid-cols-1 gap-[11px] border border-t-0 border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
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
                    onViewHistory={setHistoryTask}
                    showAssignee
                    compact
                    showInProgressDate
                  />
                ))}
              </div>
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

      <ReassignTaskDialog
        open={Boolean(reassigningTask)}
        onOpenChange={(o) => !o && setReassigningTask(null)}
        task={reassigningTask}
        employees={employees}
        onSaved={(t) => { upsert(t); load(); }}
      />
    </div>
  );
}
