import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Trophy, Calendar, Users, CreditCard, ClipboardCheck, Megaphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const features = [
  { icon: Users, title: "Member & Team Management", desc: "Organize players, coaches, and parents with role-based access." },
  { icon: Calendar, title: "Smart Scheduling", desc: "Schedule practices, matches, and tryouts with conflict detection." },
  { icon: CreditCard, title: "Registration & Payments", desc: "Streamline sign-ups, waivers, and invoice tracking." },
  { icon: ClipboardCheck, title: "Attendance & RSVP", desc: "Track who's coming and who showed up — effortlessly." },
  { icon: Megaphone, title: "Team Communication", desc: "Post announcements and auto-notify on schedule changes." },
  { icon: Trophy, title: "Volleyball-First Design", desc: "Built specifically for volleyball clubs, not generic sports apps." },
];

export default function LandingPage() {
  const { user, role } = useAuth();
  if (user && role) {
    const path = role === "admin" ? "/admin" : role === "coach" ? "/coach" : role === "parent" ? "/parent" : "/player";
    return <Navigate to={path} replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <img src="/rallyriot.png" alt="RallyRiot" className="h-12 object-contain" />
          </div>
          <div className="flex items-center gap-2">
            <Link to="/register">
              <Button variant="outline">Sign Up</Button>
            </Link>
            <Link to="/login">
              <Button>Sign In</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="container mx-auto px-4 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm font-medium mb-6">
          🏐 Built for volleyball clubs
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 max-w-3xl mx-auto leading-tight">
          Stop juggling WhatsApp, spreadsheets & chaos
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          RallyRiot centralizes your volleyball club operations — members, schedules, payments, attendance, and communication — all in one place.
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/register">
            <Button size="lg" className="text-base px-8">Get Started</Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline" className="text-base px-8">Sign In</Button>
          </Link>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="stat-card">
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-4">
                <f.icon className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/50 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2026 RallyRiot. Built for volleyball clubs everywhere.
        </div>
      </footer>
    </div>
  );
}
