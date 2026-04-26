import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/layouts/AppLayout";
import { AiChat } from "@/components/AiChat";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminTeams from "./pages/admin/AdminTeams";
import AdminLinks from "./pages/admin/AdminLinks";
import AdminRegistrations from "./pages/admin/AdminRegistrations";
import AdminFinance from "./pages/admin/AdminFinance";
import AdminAttendance from "./pages/admin/AdminAttendance";
import AdminEvents from "./pages/admin/AdminEvents";
import CoachDashboard from "./pages/coach/CoachDashboard";
import CoachEvents from "./pages/coach/CoachEvents";
import CoachAttendance from "./pages/coach/CoachAttendance";
import CoachAnnouncements from "./pages/coach/CoachAnnouncements";
import ParentDashboard from "./pages/parent/ParentDashboard";
import ParentSchedule from "./pages/parent/ParentSchedule";
import ParentRegistration from "./pages/parent/ParentRegistration";
import ParentPayments from "./pages/parent/ParentPayments";
import PlayerDashboard from "./pages/player/PlayerDashboard";
import PlayerSchedule from "./pages/player/PlayerSchedule";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AiChat />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />

            <Route element={<AppLayout allowedRoles={["admin"]} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/teams" element={<AdminTeams />} />
              <Route path="/admin/links" element={<AdminLinks />} />
              <Route path="/admin/registrations" element={<AdminRegistrations />} />
              <Route path="/admin/finance" element={<AdminFinance />} />
              <Route path="/admin/attendance" element={<AdminAttendance />} />
              <Route path="/admin/events" element={<AdminEvents />} />
            </Route>

            <Route element={<AppLayout allowedRoles={["coach"]} />}>
              <Route path="/coach" element={<CoachDashboard />} />
              <Route path="/coach/events" element={<CoachEvents />} />
              <Route path="/coach/attendance" element={<CoachAttendance />} />
              <Route path="/coach/announcements" element={<CoachAnnouncements />} />
            </Route>

            <Route element={<AppLayout allowedRoles={["parent"]} />}>
              <Route path="/parent" element={<ParentDashboard />} />
              <Route path="/parent/schedule" element={<ParentSchedule />} />
              <Route path="/parent/registration" element={<ParentRegistration />} />
              <Route path="/parent/payments" element={<ParentPayments />} />
            </Route>

            <Route element={<AppLayout allowedRoles={["player"]} />}>
              <Route path="/player" element={<PlayerDashboard />} />
              <Route path="/player/schedule" element={<PlayerSchedule />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
