import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const empty = { title: "", description: "", priority: "medium", status: "todo", due_date: "", assignee_id: "" };

export default function TaskDialog({ open, onOpenChange, task, employees = [], currentUser, onSaved }) {
  const isEdit = Boolean(task);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const isAdminCreating = !task && currentUser?.role === "admin";

  useEffect(() => {
    if (open) {
      setForm(task ? {
        title: task.title || "",
        description: task.description || "",
        priority: task.priority || "medium",
        status: task.status || "todo",
        due_date: task.due_date || "",
        assignee_id: task.assignee_id || currentUser?.id || "",
      } : {
        ...empty,
        priority: currentUser?.role === "admin" ? "urgent" : "medium",
        assignee_id: currentUser?.id || "",
      });
    }
  }, [open, task, currentUser]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.due_date) delete payload.due_date;
      if (!payload.assignee_id) delete payload.assignee_id;
      if (isEdit) {
        const { data } = await api.patch(`/tasks/${task.id}`, payload);
        toast.success("Task updated");
        onSaved?.(data);
      } else {
        const { data } = await api.post("/tasks", payload);
        toast.success("Task created");
        onSaved?.(data);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const canAssignOthers = currentUser?.role === "admin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-md border-slate-200 sm:max-w-lg" data-testid="task-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Title</Label>
            <Input data-testid="task-title-input" value={form.title} onChange={(e) => setField("title", e.target.value)} className="rounded-md border-slate-300" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Description</Label>
            <Textarea data-testid="task-description-input" rows={3} value={form.description} onChange={(e) => setField("description", e.target.value)} className="rounded-md border-slate-300" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setField("priority", v)} disabled={isAdminCreating}>
                <SelectTrigger className="rounded-md border-slate-300" data-testid="task-priority-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              {isAdminCreating && (
                <p className="text-xs text-slate-500">Admin-created tasks are always Urgent priority.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</Label>
              <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                <SelectTrigger className="rounded-md border-slate-300" data-testid="task-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Due date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" data-testid="task-due-date-trigger" className="w-full justify-start rounded-md border-slate-300 text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.due_date ? format(parseISO(form.due_date), "PP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={form.due_date ? parseISO(form.due_date) : undefined}
                    onSelect={(d) => setField("due_date", d ? format(d, "yyyy-MM-dd") : "")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Assignee</Label>
              <Select
                value={form.assignee_id}
                onValueChange={(v) => setField("assignee_id", v)}
                disabled={!canAssignOthers && !isEdit}
              >
                <SelectTrigger className="rounded-md border-slate-300" data-testid="task-assignee-select"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} {e.role === "admin" ? "(admin)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="task-cancel-button">Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-klein hover:bg-kleinDark" data-testid="task-save-button">
            {saving ? <Loader2 className="animate-spin" size={16} /> : isEdit ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
