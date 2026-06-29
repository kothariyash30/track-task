import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function TimeLogDialog({ open, onOpenChange, task, onLogged }) {
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const h = parseFloat(hours);
    if (!h || h <= 0 || h > 24) {
      toast.error("Enter hours between 0 and 24");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/tasks/${task.id}/time-logs`, { hours: h, note });
      toast.success(`Logged ${h}h`);
      setHours(""); setNote("");
      onLogged?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-md sm:max-w-md" data-testid="time-log-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Log time</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {task?.title}
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Hours</Label>
            <Input type="number" step="0.25" min="0.25" max="24" data-testid="time-log-hours-input" value={hours} onChange={(e) => setHours(e.target.value)} className="rounded-md border-slate-300" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Note (optional)</Label>
            <Textarea rows={2} data-testid="time-log-note-input" value={note} onChange={(e) => setNote(e.target.value)} className="rounded-md border-slate-300" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="time-log-cancel">Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-klein hover:bg-kleinDark" data-testid="time-log-submit">
            {saving ? <Loader2 className="animate-spin" size={16} /> : "Log time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
