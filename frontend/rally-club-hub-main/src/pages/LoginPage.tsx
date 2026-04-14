import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const demoAccounts = [
  { label: "Admin", email: "admin@rallyriot.com", password: "Password1!", color: "bg-primary" },
  { label: "Coach", email: "coach@rallyriot.com", password: "Password1!", color: "bg-info" },
  { label: "Parent", email: "parent1@rallyriot.com", password: "Password1!", color: "bg-success" },
  { label: "Player", email: "player1@rallyriot.com", password: "Password1!", color: "bg-warning" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, user, role } = useAuth();

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
    } catch (err: any) {
      toast.error("Demo account not set up yet. Please seed the database first.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img
            src="/rallyriot.png"
            alt="RallyRiot"
            className="h-24 mx-auto mb-4 object-contain"
          />
          <h1 className="text-2xl font-bold">Welcome to RallyRiot</h1>
          <p className="text-muted-foreground mt-1">Sign in to manage your volleyball club</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sign In</CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Demo Accounts</CardTitle>
            <CardDescription>Quick login to explore each role</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((d) => (
                <Button
                  key={d.label}
                  variant="outline"
                  className="justify-start"
                  disabled={isLoading}
                  onClick={() => handleDemoLogin(d.email, d.password)}
                >
                  <div className={`w-2 h-2 rounded-full ${d.color} mr-2`} />
                  {d.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              All demo accounts use password: <code className="bg-muted px-1 rounded">Password1!</code>
            </p>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">
          Demo accounts are admin-managed for this Sprint 1 build.
        </p>
      </div>
    </div>
  );
}
