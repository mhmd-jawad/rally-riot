import { parseUTC } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, DollarSign, Bell } from "lucide-react";
import { format } from "date-fns";

export default function ParentDashboard() {
  const { user } = useAuth();
  const { data: children = [] } = useQuery({
    queryKey: ["my-children"],
    queryFn: async () => (await api.parentChild.list()).data || [],
  });

  const { data: events = [] } = useQuery({
    queryKey: ["my-calendar"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
  });

  const { data: invoiceData } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await api.invoices.list()).data,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => (await api.notifications.list()).data || [],
    enabled: !!user,
  });

  const invoices = invoiceData?.invoices || [];
  const unpaid = invoices.filter((i: any) => i.status !== "paid");
  const upcomingEvents = events.filter((e: any) => parseUTC(e.start_time) >= new Date()).slice(0, 5);
  const unreadNotifs = notifications.filter((n: any) => !n.is_read);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Parent Dashboard</h1>
        <p className="text-muted-foreground">Manage your children's activities</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="My Children" value={children.length} icon={Users} />
        <StatCard title="Upcoming Events" value={upcomingEvents.length} icon={Calendar} />
        <StatCard title="Unpaid Invoices" value={unpaid.length} icon={DollarSign} />
        <StatCard title="Unread Notifications" value={unreadNotifs.length} icon={Bell} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Upcoming Events</CardTitle></CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events</p>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((e: any) => (
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
          <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5" /> Outstanding Payments</CardTitle></CardHeader>
          <CardContent>
            {unpaid.length === 0 ? (
              <p className="text-sm text-muted-foreground">All payments are up to date!</p>
            ) : (
              <div className="space-y-3">
                {unpaid.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">Invoice #{inv.id}</p>
                      <p className="text-xs text-muted-foreground">{inv.player?.full_name}</p>
                    </div>
                    <span className="font-medium text-sm">${(inv.amount - inv.amount_paid).toFixed(2)}</span>
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
