import { parseUTC } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Megaphone, Bell, MapPin, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function PlayerDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: events = [] } = useQuery({
    queryKey: ["my-calendar"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ["my-announcements"],
    queryFn: async () => (await api.announcements.list()).data || [],
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => (await api.notifications.list()).data || [],
    enabled: !!user,
  });

  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: number; status: string }) =>
      api.rsvps.upsert({ event_id: eventId, player_user_id: user!.id, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-calendar"] });
      toast({ title: "RSVP updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const upcomingEvents = events.filter((e: any) => parseUTC(e.start_time) >= new Date()).slice(0, 5);
  const unreadNotifs = notifications.filter((n: any) => !n.is_read);
  const recentAnnouncements = announcements.slice(0, 3);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Player Dashboard</h1>
        <p className="text-muted-foreground">Your schedule and team updates</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Upcoming Events" value={upcomingEvents.length} icon={Calendar} />
        <StatCard title="Announcements" value={announcements.length} icon={Megaphone} />
        <StatCard title="Unread Notifications" value={unreadNotifs.length} icon={Bell} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Upcoming Events</CardTitle></CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events</p>
            ) : (
              <div className="space-y-4">
                {upcomingEvents.map((e: any) => (
                  <div key={e.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{e.title}</p>
                          <Badge variant="outline">{e.event_type}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.court || "TBD"}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(parseUTC(e.start_time), "MMM d, h:mm a")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => rsvpMutation.mutate({ eventId: e.id, status: "attending" })}>Going</Button>
                      <Button size="sm" variant="ghost" onClick={() => rsvpMutation.mutate({ eventId: e.id, status: "maybe" })}>Maybe</Button>
                      <Button size="sm" variant="ghost" onClick={() => rsvpMutation.mutate({ eventId: e.id, status: "not_attending" })}>Can't go</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5" /> Team Announcements</CardTitle></CardHeader>
          <CardContent>
            {recentAnnouncements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No announcements yet</p>
            ) : (
              <div className="space-y-3">
                {recentAnnouncements.map((a: any) => (
                  <div key={a.id} className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{a.title}</p>
                      {a.priority === "high" && <Badge variant="destructive">High</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{a.message}</p>
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
