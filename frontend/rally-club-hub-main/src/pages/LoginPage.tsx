import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const demoAccounts = [
  { label: "Admin",  email: "admin@rallyriot.com", password: "Password1!", gradient: "from-orange-500 to-red-500" },
  { label: "Coach",  email: "ali@rallyriot.com",   password: "Password1!", gradient: "from-blue-500 to-cyan-500" },
  { label: "Parent", email: "ahmad@rallyriot.com", password: "Password1!", gradient: "from-green-500 to-emerald-500" },
  { label: "Player", email: "omar@rallyriot.com",  password: "Password1!", gradient: "from-yellow-500 to-amber-500" },
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
    if (!email || !password) { toast.error("Please fill in all fields"); return; }
    setIsLoading(true);
    try {
      await signIn(email, password);
      toast.success("Welcome back!");
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setIsLoading(true);
    try {
      await signIn(demoEmail, demoPassword);
      toast.success("Welcome to the demo!");
    } catch {
      toast.error("Demo account not set up yet. Please seed the database first.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-yellow-500/6 rounded-full blur-3xl pointer-events-none" />

      {/* Back button */}
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 flex items-center gap-2 text-orange-300/60 hover:text-orange-300 transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Logo */}
        <div className="text-center">
          <img src="/rallyriot.png" alt="RallyRiot" className="h-20 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-300 to-yellow-400 bg-clip-text text-transparent">
            Welcome Back
          </h1>
          <p className="text-orange-100/50 mt-1 text-sm">Sign in to manage your volleyball club</p>
        </div>

        {/* Sign In Form */}
        <div className="rounded-2xl bg-white/5 border border-orange-300/10 backdrop-blur-sm p-6 space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-orange-100/80 text-sm">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-white/5 border-orange-300/20 text-white placeholder:text-white/30 focus:border-orange-400/60 focus:ring-orange-400/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-orange-100/80 text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-white/5 border-orange-300/20 text-white placeholder:text-white/30 focus:border-orange-400/60 focus:ring-orange-400/20"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 disabled:opacity-50 text-black rounded-xl font-semibold transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/25 flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign In
            </button>
          </form>
        </div>

        {/* Demo Accounts */}
        <div className="rounded-2xl bg-white/5 border border-orange-300/10 backdrop-blur-sm p-6">
          <p className="text-orange-100/70 font-semibold text-sm mb-1">Demo Accounts</p>
          <p className="text-orange-100/40 text-xs mb-4">Quick login to explore each role</p>
          <div className="grid grid-cols-2 gap-3">
            {demoAccounts.map((d) => (
              <button
                key={d.label}
                disabled={isLoading}
                onClick={() => handleDemoLogin(d.email, d.password)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-orange-300/10 bg-white/3 hover:bg-white/8 hover:border-orange-300/25 transition-all duration-200 disabled:opacity-50 text-sm text-white/80 hover:text-white"
              >
                <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${d.gradient} flex-shrink-0`} />
                {d.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-orange-100/30 mt-4 text-center">
            All demo passwords:{" "}
            <code className="bg-white/10 px-1.5 py-0.5 rounded text-orange-200/60">Password1!</code>
          </p>
        </div>

        <p className="text-center text-xs text-orange-100/30">
          Demo accounts are admin-managed for this Sprint 1 build.
        </p>
      </div>
    </div>
  );
}
