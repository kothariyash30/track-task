import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const PREVIEW_LIMIT = 20;

export default function PurgeConfirmDialog({ open, onOpenChange, tasks, onPurged }) {
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const close = () => { setPassword(""); onOpenChange(false); };

  const submit = async () => {
    if (!password) {
      toast.error("Enter your password to confirm");
      return;
    }
    setDeleting(true);
    try {
      const { data } = await api.post("/tasks/bulk-delete", {
        task_ids: tasks.map((t) => t.id),
        password,
      });
      toast.success(`Deleted ${data.deleted_count} task${data.deleted_count === 1 ? "" : "s"}`);
      setPassword("");
      onPurged?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setPassword(""); onOpenChange(o); }}>
      <DialogContent className="rounded-md border-slate-200 sm:max-w-md" data-testid="purge-confirm-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-red-700">
            <AlertTriangle size={18} /> Delete {tasks.length} task{tasks.length === 1 ? "" : "s"}?
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-sm" data-testid="purge-task-preview">
          {tasks.slice(0, PREVIEW_LIMIT).map((t) => (
            <div key={t.id} className="truncate text-slate-700">{t.title}</div>
          ))}
          {tasks.length > PREVIEW_LIMIT && (
            <div className="text-xs text-slate-500">+ {tasks.length - PREVIEW_LIMIT} more</div>
          )}
        </div>

        <p className="text-sm text-slate-600">
          This permanently deletes these tasks along with their time logs and history. This cannot be undone.
        </p>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Confirm your password</Label>
          <Input
            type="password"
            autoFocus
            data-testid="purge-password-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border-slate-300"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} data-testid="purge-cancel-button">Cancel</Button>
          <Button
            onClick={submit}
            disabled={deleting || !password}
            className="bg-red-600 hover:bg-red-700"
            data-testid="purge-confirm-button"
          >
            {deleting ? <Loader2 className="animate-spin" size={16} /> : `Delete ${tasks.length} permanently`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
