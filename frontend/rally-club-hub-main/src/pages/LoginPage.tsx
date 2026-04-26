import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ClipboardCheck, Loader2, Lock, Mail, Shield, Trophy, Users } from "lucide-react";
import { toast } from "sonner";

const demoAccounts = [
  { label: "Admin", email: "admin@rallyriot.com", password: "Password1!", gradient: "from-orange-500 to-rose-500", icon: Shield },
  { label: "Coach", email: "ali@rallyriot.com", password: "Password1!", gradient: "from-cyan-500 to-blue-500", icon: ClipboardCheck },
  { label: "Parent", email: "ahmad@rallyriot.com", password: "Password1!", gradient: "from-emerald-500 to-lime-500", icon: Users },
  { label: "Player", email: "omar@rallyriot.com", password: "Password1!", gradient: "from-yellow-400 to-orange-500", icon: Trophy },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, user, role } = useAuth();
  const navigate = useNavigate();

  if (user && role) {
    const path = role === "admin" ? "/admin" : role === "coach" ? "/coach" : role === "parent" ? "/parent" : "/player";
    return <Navigate to={path} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setIsLoading(true);
    try {
      await signIn(email, password);
      toast.success("Welcome back!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setIsLoading(true);
    try {
      await signIn(demoEmail, demoPassword);
      toast.success("Welcome to the demo!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Demo login failed.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <button
        onClick={() => navigate("/")}
        className="absolute left-6 top-6 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-md transition-colors hover:border-orange-300/40 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="relative z-10 grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="login-hero-panel overflow-hidden rounded-2xl border border-white/10 p-6 text-white shadow-2xl backdrop-blur-xl md:p-8">
          <div className="flex items-center gap-4">
            <img src="/rallyriot.png" alt="RallyRiot" className="h-16 object-contain drop-shadow-[0_14px_28px_rgba(249,115,22,0.35)]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-200/80">Club Hub</p>
              <h1 className="text-3xl font-bold leading-tight md:text-5xl">
                Welcome back to{" "}
                <span className="bg-gradient-to-r from-orange-200 via-yellow-200 to-cyan-200 bg-clip-text text-transparent">
                  RallyRiot
                </span>
              </h1>
            </div>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {demoAccounts.map((d) => {
              const Icon = d.icon;
              return (
                <button
                  key={d.label}
                  disabled={isLoading}
                  onClick={() => handleDemoLogin(d.email, d.password)}
                  className="group rounded-xl border border-white/10 bg-white/10 p-4 text-left backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/15 disabled:opacity-50"
                >
                  <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${d.gradient} text-black shadow-lg transition-transform group-hover:scale-105`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="font-semibold text-white">{d.label}</p>
                  <p className="mt-1 text-xs text-white/55">{d.email}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-8 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-orange-300/20 bg-orange-400/10 px-3 py-4">
              <p className="text-2xl font-bold text-orange-200">4</p>
              <p className="text-xs uppercase tracking-wide text-orange-100/55">Roles</p>
            </div>
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-4">
              <p className="text-2xl font-bold text-cyan-200">Live</p>
              <p className="text-xs uppercase tracking-wide text-cyan-100/55">Teams</p>
            </div>
            <div className="rounded-xl border border-lime-300/20 bg-lime-400/10 px-3 py-4">
              <p className="text-2xl font-bold text-lime-200">Demo</p>
              <p className="text-xs uppercase tracking-wide text-lime-100/55">Ready</p>
            </div>
          </div>
        </section>

        <section className="login-card rounded-2xl border border-white/15 p-6 shadow-2xl backdrop-blur-xl md:p-8">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-200/75">Sign In</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Enter the court</h2>
            <p className="mt-2 text-sm text-white/55">Use your club account or jump into a demo role.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-white/75">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-200/60" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-12 border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/35 focus-visible:ring-orange-300/45"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-white/75">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-200/60" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="h-12 border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/35 focus-visible:ring-orange-300/45"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-yellow-400 to-cyan-400 py-3 font-semibold text-slate-950 shadow-lg shadow-orange-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-cyan-500/20 disabled:opacity-50"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign In
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs uppercase tracking-[0.2em] text-white/40">Demo Accounts</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {demoAccounts.map((d) => (
              <button
                key={d.label}
                disabled={isLoading}
                onClick={() => handleDemoLogin(d.email, d.password)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/80 transition-all duration-200 hover:border-orange-200/35 hover:bg-white/15 hover:text-white disabled:opacity-50"
              >
                <div className={`h-2 w-2 flex-shrink-0 rounded-full bg-gradient-to-r ${d.gradient}`} />
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-5 text-center text-xs text-white/40">
            All demo passwords:{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-orange-100">Password1!</code>
          </p>
        </section>
      </div>
    </div>
  );
}
