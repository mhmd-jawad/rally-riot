import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Lock, Mail, Shield, Trophy, User, Users } from "lucide-react";
import { toast } from "sonner";

// Only accounts that exist in the seed.
const demoAccounts = [
  { label: "Admin", email: "admin@rallyriot.com", password: "Password1!", gradient: "from-orange-500 to-rose-500", icon: Shield },
  { label: "Parent (Ahmad)", email: "ahmad@rallyriot.com", password: "Password1!", gradient: "from-emerald-500 to-lime-500", icon: Users },
  { label: "Parent (Fatima)", email: "fatima@rallyriot.com", password: "Password1!", gradient: "from-teal-500 to-cyan-500", icon: Users },
  { label: "Parent (Nour)", email: "nour@rallyriot.com", password: "Password1!", gradient: "from-violet-500 to-purple-500", icon: Users },
];

export default function LoginPage() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp, user, role } = useAuth();
  const navigate = useNavigate();

  // Sign-in fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sign-up fields
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suRole, setSuRole] = useState("player");

  if (user && role) {
    const path = role === "admin" ? "/admin" : role === "coach" ? "/coach" : role === "parent" ? "/parent" : "/player";
    return <Navigate to={path} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Please fill in all fields"); return; }
    setIsLoading(true);
    try {
      await signIn(email, password);
      toast.success("Welcome back!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suName || !suEmail || !suPassword || !suConfirm) { toast.error("Please fill in all fields"); return; }
    if (suPassword !== suConfirm) { toast.error("Passwords do not match"); return; }
    if (suPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setIsLoading(true);
    try {
      await signUp(suName, suEmail, suPassword, suRole);
      toast.success("Account created! Welcome to RallyRiot.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
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
      toast.error(err instanceof Error ? err.message : "Demo login failed.");
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

        {/* ── Left hero panel ── */}
        <section className="login-hero-panel overflow-hidden rounded-2xl border border-white/10 p-6 text-white shadow-2xl backdrop-blur-xl md:p-8">
          <div className="flex items-center gap-4">
            <img src="/rallyriot.png" alt="RallyRiot" className="h-16 object-contain drop-shadow-[0_14px_28px_rgba(249,115,22,0.35)]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-200/80">Club Hub</p>
              <h1 className="text-3xl font-bold leading-tight md:text-5xl">
                Welcome{tab === "signup" ? "" : " back"} to{" "}
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

        {/* ── Right form panel ── */}
        <section className="login-card rounded-2xl border border-white/15 p-6 shadow-2xl backdrop-blur-xl md:p-8">

          {/* Tab switcher */}
          <div className="mb-6 flex rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              onClick={() => setTab("signin")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                tab === "signin"
                  ? "bg-white/15 text-white shadow"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setTab("signup")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                tab === "signup"
                  ? "bg-white/15 text-white shadow"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* ── Sign In form ── */}
          {tab === "signin" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">Enter the court</h2>
                <p className="mt-1 text-sm text-white/50">Use your club credentials to sign in.</p>
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-yellow-400 to-cyan-400 py-3 font-semibold text-slate-950 shadow-lg shadow-orange-500/25 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign In
                </button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">Demo Accounts</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map((d) => (
                  <button
                    key={d.label}
                    disabled={isLoading}
                    onClick={() => handleDemoLogin(d.email, d.password)}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-sm text-white/80 transition-all hover:border-orange-200/35 hover:bg-white/15 hover:text-white disabled:opacity-50"
                  >
                    <div className={`h-2 w-2 flex-shrink-0 rounded-full bg-gradient-to-r ${d.gradient}`} />
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-center text-xs text-white/35">
                All demo passwords:{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-orange-100">Password1!</code>
              </p>
              <p className="mt-3 text-center text-xs text-white/30">
                No account?{" "}
                <button onClick={() => setTab("signup")} className="text-orange-300 hover:text-orange-200 underline underline-offset-2">
                  Create one
                </button>
              </p>
            </>
          )}

          {/* ── Create Account form ── */}
          {tab === "signup" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">Join RallyRiot</h2>
                <p className="mt-1 text-sm text-white/50">Create a player or parent account to get started.</p>
              </div>

              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-white/75">Full Name</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-200/60" />
                    <Input
                      type="text"
                      value={suName}
                      onChange={(e) => setSuName(e.target.value)}
                      placeholder="Your full name"
                      className="h-12 border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/35 focus-visible:ring-orange-300/45"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-white/75">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-200/60" />
                    <Input
                      type="email"
                      value={suEmail}
                      onChange={(e) => setSuEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-12 border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/35 focus-visible:ring-orange-300/45"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-white/75">I am a</Label>
                  <Select value={suRole} onValueChange={setSuRole}>
                    <SelectTrigger className="h-12 border-white/15 bg-white/10 text-white focus:ring-orange-300/45">
                      <Trophy className="h-4 w-4 mr-2 text-orange-200/60" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="player">Player</SelectItem>
                      <SelectItem value="parent">Parent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-white/75">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-200/60" />
                    <Input
                      type="password"
                      value={suPassword}
                      onChange={(e) => setSuPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="h-12 border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/35 focus-visible:ring-orange-300/45"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-white/75">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-200/60" />
                    <Input
                      type="password"
                      value={suConfirm}
                      onChange={(e) => setSuConfirm(e.target.value)}
                      placeholder="Repeat your password"
                      className={`h-12 border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/35 focus-visible:ring-orange-300/45 ${
                        suConfirm && suConfirm !== suPassword ? "border-red-400/60" : ""
                      }`}
                    />
                  </div>
                  {suConfirm && suConfirm !== suPassword && (
                    <p className="text-xs text-red-400">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || (!!suConfirm && suConfirm !== suPassword)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-yellow-400 to-cyan-400 py-3 font-semibold text-slate-950 shadow-lg shadow-orange-500/25 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Account
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-white/35">
                Coach or admin? Ask your club administrator to create your account.
              </p>
              <p className="mt-3 text-center text-xs text-white/30">
                Already have an account?{" "}
                <button onClick={() => setTab("signin")} className="text-orange-300 hover:text-orange-200 underline underline-offset-2">
                  Sign in
                </button>
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
