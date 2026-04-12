import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Calendar, Megaphone } from "lucide-react";
import { format } from "date-fns";

export default function CoachDashboard() {
  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await api.teams.list()).data || [],
  });

  const { data: events = [] } = useQuery({
    queryKey: ["my-calendar"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => (await api.announcements.list()).data || [],
  });

  const upcomingEvents = events.filter((e: any) => new Date(e.start_time) >= new Date()).slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Coach Dashboard</h1>
        <p className="text-muted-foreground">Your teams and upcoming schedule</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="My Teams" value={teams.length} icon={Trophy} />
        <StatCard title="Upcoming Events" value={upcomingEvents.length} icon={Calendar} />
        <StatCard title="Announcements" value={announcements.length} icon={Megaphone} />
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
                    <span className="text-xs text-muted-foreground">{format(new Date(e.start_time), "MMM d, h:mm a")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="w-5 h-5" /> My Teams</CardTitle></CardHeader>
          <CardContent>
            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teams assigned</p>
            ) : (
              <div className="space-y-3">
                {teams.map((t: any) => (
                  <div key={t.id} className="p-3 rounded-lg bg-muted/50">
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.age_group} • {t.skill_level} • {t.players?.length || 0} players</p>
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
