import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function ReassignTaskDialog({ open, onOpenChange, task, employees = [], onSaved }) {
  const [assigneeId, setAssigneeId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setAssigneeId(task?.assignee_id || "");
  }, [open, task]);

  const submit = async () => {
    if (!assigneeId || assigneeId === task.assignee_id) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch(`/tasks/${task.id}`, { assignee_id: assigneeId });
      toast.success("Task reassigned");
      onSaved?.(data);
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-md border-slate-200 sm:max-w-sm" data-testid="reassign-task-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Reassign task</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {task?.title}
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Assignee</Label>
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className="rounded-md border-slate-300" data-testid="reassign-task-assignee-select">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name} {e.role === "admin" ? "(admin)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="reassign-task-cancel">Cancel</Button>
          <Button onClick={submit} disabled={saving || !assigneeId} className="bg-klein hover:bg-kleinDark" data-testid="reassign-task-submit">
            {saving ? <Loader2 className="animate-spin" size={16} /> : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
