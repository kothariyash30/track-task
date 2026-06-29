import { useAuth } from "@/context/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, ListChecks, LogOut, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = user?.role === "admin";

  const navItems = [
    { to: "/tasks", label: "My Tasks", icon: ListChecks, show: true },
    { to: "/admin", label: "Admin", icon: LayoutDashboard, show: isAdmin },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight" data-testid="brand-link">
              <span className="grid h-7 w-7 place-items-center bg-klein text-white">
                <Sparkles size={14} strokeWidth={2.5} />
              </span>
              TaskFlow
            </Link>
            <nav className="hidden gap-1 md:flex">
              {navItems.filter((n) => n.show).map((n) => {
                const Icon = n.icon;
                const active = location.pathname.startsWith(n.to);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    data-testid={`nav-${n.to.replace("/", "")}`}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon size={14} /> {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right md:block">
              <div className="text-sm font-medium text-slate-900" data-testid="header-user-name">{user?.name}</div>
              <div className="text-xs text-slate-500">{user?.email}</div>
            </div>
            <Badge variant="outline" className="rounded-sm border-slate-300 text-[10px] uppercase tracking-widest" data-testid="header-user-role">
              {user?.role}
            </Badge>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-klein text-sm font-semibold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="logout-button" className="text-slate-600">
              <LogOut size={14} /> <span className="hidden sm:inline ml-1">Logout</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8 animate-fade-up">{children}</main>
    </div>
  );
}
