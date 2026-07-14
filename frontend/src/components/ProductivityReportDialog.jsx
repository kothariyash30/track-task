import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Printer } from "lucide-react";
import { format, parseISO } from "date-fns";

// A task still sitting in_progress hasn't closed its current session out into hours_logged
// yet (that only happens when it leaves in_progress — see server.py's update_task), so a
// live report has to add the running session's elapsed time on top to show an accurate total.
const liveHours = (task) => {
  const base = Number(task.hours_logged || 0);
  if (task.status !== "in_progress" || !task.in_progress_at) return base;
  const elapsedHours = (Date.now() - new Date(task.in_progress_at).getTime()) / 3_600_000;
  return base + Math.max(0, elapsedHours);
};

export default function ProductivityReportDialog({ open, onOpenChange, employees, tasks, timeLogs }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [reportDate, setReportDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const toggleEmployee = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAll = () => setSelectedIds(new Set(employees.map((e) => e.id)));
  const clearAll = () => setSelectedIds(new Set());

  const selectedEmployees = useMemo(
    () => employees.filter((e) => selectedIds.has(e.id)),
    [employees, selectedIds]
  );

  const reportRows = useMemo(() => {
    return selectedEmployees.map((emp) => {
      const empTasks = tasks.filter((t) => t.assignee_id === emp.id);
      const completedToday = empTasks
        .filter((t) => t.completed_at && t.completed_at.slice(0, 10) === reportDate)
        .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1));
      const inProgress = empTasks
        .filter((t) => t.status === "in_progress")
        .sort((a, b) => (a.in_progress_at < b.in_progress_at ? 1 : -1));
      const hoursToday = timeLogs
        .filter((l) => l.user_id === emp.id && l.created_at && l.created_at.slice(0, 10) === reportDate)
        .reduce((sum, l) => sum + Number(l.hours || 0), 0);
      return { emp, completedToday, inProgress, hoursToday };
    });
  }, [selectedEmployees, tasks, timeLogs, reportDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-md border-slate-200 sm:max-w-4xl" data-testid="productivity-report-dialog">
        <DialogHeader className="no-print">
          <DialogTitle className="font-display">Employee productivity report</DialogTitle>
        </DialogHeader>

        <div className="no-print flex flex-wrap items-end gap-4 border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-1">
            <Label className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Report date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" data-testid="report-date-trigger" className="h-9 w-44 justify-start rounded-md border-slate-300 text-left text-sm font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {format(parseISO(reportDate), "PP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={parseISO(reportDate)}
                  onSelect={(d) => d && setReportDate(format(d, "yyyy-MM-dd"))}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between">
              <Label className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Employees</Label>
              <div className="flex gap-2 text-[11px]">
                <button type="button" onClick={selectAll} className="text-klein hover:underline" data-testid="report-select-all">Select all</button>
                <button type="button" onClick={clearAll} className="text-slate-500 hover:underline" data-testid="report-clear-all">Clear</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-slate-300 bg-white px-3 py-2">
              {employees.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedIds.has(e.id)}
                    onCheckedChange={() => toggleEmployee(e.id)}
                    data-testid={`report-employee-option-${e.id}`}
                  />
                  {e.name}
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={() => window.print()}
            disabled={reportRows.length === 0}
            className="h-9 bg-klein hover:bg-kleinDark"
            data-testid="report-print-button"
          >
            <Printer size={14} /> Print
          </Button>
        </div>

        {reportRows.length === 0 ? (
          <div className="border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            Select one or more employees to generate the report.
          </div>
        ) : (
          <div className="print-area max-h-[65vh] overflow-y-auto p-1">
            <div className="mb-4">
              <h2 className="font-display text-xl font-bold text-slate-900">Employee Productivity Report</h2>
              <p className="text-sm text-slate-500">{format(parseISO(reportDate), "EEEE, MMMM d, yyyy")}</p>
            </div>

            {reportRows.length > 1 && (
              <table className="mb-8 w-full text-sm">
                <thead className="border-b border-slate-300 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Employee</th>
                    <th className="py-2 pr-3 font-medium">Completed</th>
                    <th className="py-2 pr-3 font-medium">In progress</th>
                    <th className="py-2 pr-3 font-medium">Hours logged</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map(({ emp, completedToday, inProgress, hoursToday }) => (
                    <tr key={emp.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-900">{emp.name}</td>
                      <td className="py-2 pr-3 font-mono">{completedToday.length}</td>
                      <td className="py-2 pr-3 font-mono">{inProgress.length}</td>
                      <td className="py-2 pr-3 font-mono">{hoursToday.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportRows.map(({ emp, completedToday, inProgress, hoursToday }, idx) => (
              <div key={emp.id} className={idx > 0 ? "print-page-break mt-8" : "mt-2"} data-testid={`report-section-${emp.id}`}>
                <div className="mb-3 flex items-baseline justify-between border-b border-slate-300 pb-2">
                  <h3 className="font-display text-lg font-semibold text-slate-900">{emp.name}</h3>
                  <span className="text-xs text-slate-500">{emp.email}</span>
                </div>

                <div className="mb-2 grid grid-cols-3 gap-3 text-center text-xs">
                  <div className="border border-slate-200 py-2">
                    <div className="font-display text-lg font-semibold text-emerald-700">{completedToday.length}</div>
                    <div className="uppercase tracking-[0.14em] text-slate-500">Completed</div>
                  </div>
                  <div className="border border-slate-200 py-2">
                    <div className="font-display text-lg font-semibold text-amber-700">{inProgress.length}</div>
                    <div className="uppercase tracking-[0.14em] text-slate-500">In progress</div>
                  </div>
                  <div className="border border-slate-200 py-2">
                    <div className="font-display text-lg font-semibold text-slate-900">{hoursToday.toFixed(1)}h</div>
                    <div className="uppercase tracking-[0.14em] text-slate-500">Hours logged today</div>
                  </div>
                </div>

                <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Completed tasks</h4>
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Task</th>
                      <th className="py-1.5 pr-3 font-medium">Priority</th>
                      <th className="py-1.5 pr-3 font-medium">Completed at</th>
                      <th className="py-1.5 pr-3 font-medium">Hours logged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedToday.length === 0 ? (
                      <tr><td colSpan={4} className="py-2 text-slate-400">No tasks completed on this date.</td></tr>
                    ) : completedToday.map((t) => (
                      <tr key={t.id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-3">{t.title}</td>
                        <td className="py-1.5 pr-3 capitalize">{t.priority}</td>
                        <td className="py-1.5 pr-3">{format(parseISO(t.completed_at), "h:mm a")}</td>
                        <td className="py-1.5 pr-3 font-mono">{Number(t.hours_logged || 0).toFixed(2)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Still in progress</h4>
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Task</th>
                      <th className="py-1.5 pr-3 font-medium">Priority</th>
                      <th className="py-1.5 pr-3 font-medium">In progress since</th>
                      <th className="py-1.5 pr-3 font-medium">Hours logged so far</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inProgress.length === 0 ? (
                      <tr><td colSpan={4} className="py-2 text-slate-400">No tasks currently in progress.</td></tr>
                    ) : inProgress.map((t) => (
                      <tr key={t.id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-3">{t.title}</td>
                        <td className="py-1.5 pr-3 capitalize">{t.priority}</td>
                        <td className="py-1.5 pr-3">{t.in_progress_at ? format(parseISO(t.in_progress_at), "MMM d, h:mm a") : "—"}</td>
                        <td className="py-1.5 pr-3 font-mono">{liveHours(t).toFixed(2)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
