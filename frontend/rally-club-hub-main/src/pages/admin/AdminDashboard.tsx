import { parseUTC } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { Users, Trophy, FileText, DollarSign, Calendar, Megaphone, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function AdminDashboard() {
  const { toast } = useToast();

  const reminderMutation = useMutation({
    mutationFn: () => api.notifications.sendReminders(),
    onSuccess: (res: any) => toast({ title: "Reminders sent", description: res.message }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const usersRes = await api.users.list();
      const teamsRes = await api.teams.list();
      const formsRes = await api.registrations.listForms();
      const invoicesRes = await api.invoices.list();
      const eventsRes = await api.events.list({ upcoming: true, limit: 5 });
      const annRes = await api.announcements.list();
      const activeForms = (formsRes.data || []).filter((f: any) => f.is_active).length;
      const unpaidInvoices = (invoicesRes.data.invoices || []).filter((i: any) => i.status !== "paid").length;
      const upcomingEvents = (eventsRes.data || []).slice(0, 5);
      const recentAnnouncements = (annRes.data || []).slice(0, 5);
      return {
        totalUsers: (usersRes.data || []).length,
        totalTeams: (teamsRes.data || []).length,
        activeForms,
        unpaidInvoices,
        upcomingEvents,
        recentAnnouncements,
      };
    },
  });

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-xl" /><div className="h-32 bg-muted rounded-xl" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Overview of your club operations</p>
        </div>
        <Button variant="outline" onClick={() => reminderMutation.mutate()} disabled={reminderMutation.isPending}>
          <Bell className="w-4 h-4 mr-2" />
          {reminderMutation.isPending ? "Sending..." : "Send Event Reminders"}
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={stats?.totalUsers ?? 0} icon={Users} />
        <StatCard title="Teams" value={stats?.totalTeams ?? 0} icon={Trophy} />
        <StatCard title="Active Forms" value={stats?.activeForms ?? 0} icon={FileText} />
        <StatCard title="Unpaid Invoices" value={stats?.unpaidInvoices ?? 0} icon={DollarSign} />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Upcoming Events</CardTitle></CardHeader>
          <CardContent>
            {stats?.upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events</p>
            ) : (
              <div className="space-y-3">
                {stats?.upcomingEvents.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{e.title}</p>
                      <p className="text-xs text-muted-foreground">{e.event_type} • {e.court || "TBD"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{format(parseUTC(e.start_time), "MMM d, h:mm a")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5" /> Recent Announcements</CardTitle></CardHeader>
          <CardContent>
            {stats?.recentAnnouncements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No announcements yet</p>
            ) : (
              <div className="space-y-3">
                {stats?.recentAnnouncements.map((a: any) => (
                  <div key={a.id} className="p-3 rounded-lg bg-muted/50">
                    <p className="font-medium text-sm">{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{a.team?.name} • {format(parseUTC(a.created_at), "MMM d")}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
