import { useNavigate, Navigate } from "react-router-dom";
import { Users, Calendar, CreditCard, ClipboardCheck, Megaphone, Trophy, Shield, Zap, Globe } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Hero from "@/components/ui/animated-shader-hero";

const features = [
  { icon: Users, title: "Member & Team Management", desc: "Organize players, coaches, and parents with role-based access control." },
  { icon: Calendar, title: "Smart Scheduling", desc: "Schedule practices, matches, and tryouts with automatic conflict detection." },
  { icon: CreditCard, title: "Registration & Payments", desc: "Streamline sign-ups, waivers, and invoice tracking in one place." },
  { icon: ClipboardCheck, title: "Attendance & RSVP", desc: "Track who's coming and who showed up — effortlessly and accurately." },
  { icon: Megaphone, title: "Team Communication", desc: "Post announcements and auto-notify members on schedule changes." },
  { icon: Trophy, title: "Volleyball-First Design", desc: "Built specifically for volleyball clubs, not a generic sports platform." },
];

const stats = [
  { value: "4", label: "User Roles", icon: Shield },
  { value: "10+", label: "Features", icon: Zap },
  { value: "100%", label: "Volleyball Focused", icon: Globe },
];

export default function LandingPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  if (user && role) {
    const path = role === "admin" ? "/admin" : role === "coach" ? "/coach" : role === "parent" ? "/parent" : "/player";
    return <Navigate to={path} replace />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Floating Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 bg-black/30 backdrop-blur-md border-b border-orange-300/10">
        <div className="flex items-center gap-3">
          <img src="/rallyriot.png" alt="RallyRiot" className="h-10 object-contain" />
        </div>
        <button
          onClick={() => navigate("/login")}
          className="px-5 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-black rounded-full font-semibold text-sm transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-orange-500/30"
        >
          Sign In
        </button>
      </nav>

      {/* Hero Section */}
      <Hero
        trustBadge={{
          text: "Built exclusively for volleyball clubs.",
          icons: ["🏐"]
        }}
        headline={{
          line1: "Manage Your Club,",
          line2: "Rule the Court"
        }}
        subtitle="RallyRiot centralizes every aspect of volleyball club operations — members, schedules, payments, attendance, and communication — all in one powerful platform."
        buttons={{
          primary: {
            text: "Open Demo",
            onClick: () => navigate("/login")
          },
          secondary: {
            text: "Explore Features",
            onClick: () => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })
          }
        }}
      />

      {/* Stats Bar */}
      <section className="relative bg-black border-y border-orange-300/10 py-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto text-center">
            {stats.map((s) => (
              <div key={s.label} className="space-y-1">
                <p className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
                  {s.value}
                </p>
                <p className="text-sm text-orange-100/60 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-black py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-300/20 rounded-full text-sm text-orange-300 mb-6">
              ✨ Everything you need
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-orange-300 to-yellow-400 bg-clip-text text-transparent">
                All-in-One Club Platform
              </span>
            </h2>
            <p className="text-orange-100/60 text-lg max-w-2xl mx-auto">
              Stop juggling WhatsApp groups, spreadsheets, and paper forms. RallyRiot brings it all together.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="group p-6 rounded-2xl bg-white/5 border border-orange-300/10 hover:border-orange-400/30 hover:bg-orange-500/5 transition-all duration-300 hover:shadow-xl hover:shadow-orange-500/10"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-yellow-500/10 border border-orange-400/20 flex items-center justify-center mb-5 group-hover:from-orange-500/30 transition-all duration-300">
                  <f.icon className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2 text-white">{f.title}</h3>
                <p className="text-orange-100/60 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-black py-24 border-t border-orange-300/10">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to{" "}
            <span className="bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
              get started?
            </span>
          </h2>
          <p className="text-orange-100/60 text-lg mb-10 max-w-xl mx-auto">
            Explore the full demo — no account needed. Try every role and see how RallyRiot transforms club management.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="px-10 py-5 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-black rounded-full font-bold text-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/30"
          >
            Open Demo Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black border-t border-orange-300/10 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-orange-100/40">
          © 2026 RallyRiot. Built for volleyball clubs everywhere. 🏐
        </div>
      </footer>
    </div>
  );
}
