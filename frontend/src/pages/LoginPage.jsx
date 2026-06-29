import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@taskflow.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (user) return <Navigate to={user.role === "admin" ? "/admin" : "/tasks"} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(email.trim(), password);
    setLoading(false);
    if (res.ok) {
      toast.success(`Welcome back, ${res.user.name}`);
      navigate(res.user.role === "admin" ? "/admin" : "/tasks");
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-grid bg-white">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 px-6 py-12 md:grid-cols-2 md:gap-16 md:py-24">
        <div className="hidden flex-col justify-between md:flex">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <span className="grid h-8 w-8 place-items-center bg-klein text-white"><Sparkles size={16} strokeWidth={2.5} /></span>
            TaskFlow
          </Link>
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Run your team like a clock.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-slate-600">
              Track tasks, log time, and reward effort. A focused workspace for small teams that want
              clarity over chaos.
            </p>
            <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden border border-slate-200 bg-slate-200">
              {[
                ["Tasks created", "1,240"],
                ["Hours logged", "8,930"],
                ["Teams using", "240+"],
                ["Avg. accuracy", "98%"],
              ].map(([k, v]) => (
                <div key={k} className="bg-white px-5 py-4">
                  <div className="font-display text-2xl font-semibold text-slate-900">{v}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{k}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-xs text-slate-400">© {new Date().getFullYear()} TaskFlow Labs</div>
        </div>

        <div className="flex items-center">
          <form
            onSubmit={onSubmit}
            data-testid="login-form"
            className="w-full border border-slate-200 bg-white p-8 md:p-10"
          >
            <h2 className="font-display text-2xl font-semibold text-slate-900">Sign in</h2>
            <p className="mt-2 text-sm text-slate-500">Use your team credentials to continue.</p>

            <div className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-[0.18em] text-slate-500">Email</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="login-email-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="rounded-md border-slate-300 focus-visible:ring-klein"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs uppercase tracking-[0.18em] text-slate-500">Password</Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="login-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="rounded-md border-slate-300 focus-visible:ring-klein"
                />
              </div>

              {error && (
                <div data-testid="login-error" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                data-testid="login-submit-button"
                className="h-11 w-full rounded-md bg-klein text-white hover:bg-kleinDark"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : "Sign in"}
              </Button>

              <p className="text-center text-sm text-slate-500">
                No account?{" "}
                <Link to="/register" className="font-medium text-klein hover:underline" data-testid="go-to-register">
                  Create one
                </Link>
              </p>
            </div>

            <div className="mt-8 border-t border-slate-200 pt-5 text-xs text-slate-500">
              <div className="mb-2 uppercase tracking-[0.18em]">Demo accounts</div>
              <div className="space-y-1 font-mono">
                <div>admin@taskflow.com · admin123</div>
                <div>maya@taskflow.com · employee123</div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
