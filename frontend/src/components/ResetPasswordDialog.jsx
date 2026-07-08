import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function ResetPasswordDialog({ open, onOpenChange, user }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { new_password: password });
      toast.success(`Password reset for ${user.name}`);
      setPassword("");
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setPassword(""); onOpenChange(o); }}>
      <DialogContent className="rounded-md sm:max-w-md" data-testid="reset-password-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Reset password</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {user?.name} <span className="text-slate-400">·</span> {user?.email}
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">New password</Label>
            <Input
              type="password"
              minLength={6}
              data-testid="reset-password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border-slate-300"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="reset-password-cancel">Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-klein hover:bg-kleinDark" data-testid="reset-password-submit">
            {saving ? <Loader2 className="animate-spin" size={16} /> : "Reset password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
