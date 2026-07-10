import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const FIELD_LABELS = { title: "Title", status: "Status", priority: "Priority", due_date: "Due date", assignee_id: "Assignee" };
const STATUS_LABELS = { todo: "To Do", in_progress: "In Progress", done: "Done" };
const ACTION_LABELS = { created: "Created", updated: "Updated", deleted: "Deleted" };

function formatValue(field, value) {
  if (value == null || value === "") return "—";
  return field === "status" ? (STATUS_LABELS[value] || value) : value;
}

function describeChange(change) {
  const label = FIELD_LABELS[change.field] || change.field;
  return `${label}: ${formatValue(change.field, change.from)} → ${formatValue(change.field, change.to)}`;
}

export default function AuditLogDialog({ open, onOpenChange, task }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !task) return;
    setLoading(true);
    api.get(`/tasks/${task.id}/audit-log`)
      .then(({ data }) => setLogs(data))
      .catch((e) => toast.error(formatApiError(e)))
      .finally(() => setLoading(false));
  }, [open, task]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-md sm:max-w-lg" data-testid="audit-log-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">History — {task?.title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="mr-2 animate-spin" size={16} /> Loading history…
            </div>
          ) : logs.length === 0 ? (
            <div className="border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No history recorded yet.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="border-l-2 border-klein/40 pl-3" data-testid={`audit-entry-${log.id}`}>
                <div className="text-xs text-slate-400">
                  {format(parseISO(log.created_at), "MMM d, yyyy 'at' h:mm a")}
                </div>
                <div className="text-sm font-medium text-slate-900">
                  {ACTION_LABELS[log.action] || log.action} by {log.actor_name}
                </div>
                {log.changes?.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {log.changes.map((c, i) => (
                      <li key={i}>{describeChange(c)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
