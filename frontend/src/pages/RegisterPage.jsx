import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (user) return <Navigate to={user.role === "admin" ? "/admin" : "/tasks"} replace />;

  const onChange = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await register({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Account created");
      navigate(res.user.role === "admin" ? "/admin" : "/tasks");
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-grid bg-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <Link to="/" className="mb-10 flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <span className="grid h-8 w-8 place-items-center bg-klein text-white"><Sparkles size={16} strokeWidth={2.5} /></span>
          TaskFlow
        </Link>
        <form onSubmit={onSubmit} data-testid="register-form" className="border border-slate-200 bg-white p-8">
          <h2 className="font-display text-2xl font-semibold text-slate-900">Create your account</h2>
          <p className="mt-2 text-sm text-slate-500">Join your team workspace.</p>

          <div className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Full name</Label>
              <Input data-testid="register-name-input" value={form.name} onChange={onChange("name")} required className="rounded-md border-slate-300" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Email</Label>
              <Input type="email" data-testid="register-email-input" value={form.email} onChange={onChange("email")} required className="rounded-md border-slate-300" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Password</Label>
              <Input type="password" data-testid="register-password-input" value={form.password} onChange={onChange("password")} required minLength={6} className="rounded-md border-slate-300" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Role</Label>
              <div className="grid grid-cols-2 gap-2">
                {["employee", "admin"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    data-testid={`register-role-${r}`}
                    onClick={() => setForm({ ...form, role: r })}
                    className={`rounded-md border px-3 py-2 text-sm capitalize transition-colors ${
                      form.role === r ? "border-klein bg-klein text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div data-testid="register-error" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <Button type="submit" disabled={loading} data-testid="register-submit-button" className="h-11 w-full rounded-md bg-klein text-white hover:bg-kleinDark">
              {loading ? <Loader2 className="animate-spin" size={16} /> : "Create account"}
            </Button>
            <p className="text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-klein hover:underline" data-testid="go-to-login">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
