import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function PlayerSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["my-calendar"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
  });

  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: number; status: string }) =>
      api.rsvps.upsert({ event_id: eventId, player_user_id: 0, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-calendar"] });
      toast({ title: "RSVP updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const upcomingEvents = events.filter((e: any) => new Date(e.start_time) >= new Date());
  const pastEvents = events.filter((e: any) => new Date(e.start_time) < new Date());

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">My Schedule</h1>
        <p className="text-muted-foreground">View and RSVP to your events</p>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Upcoming ({upcomingEvents.length})</h2>
        {upcomingEvents.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No upcoming events</p>
        ) : (
          <div className="space-y-4">
            {upcomingEvents.map((event: any) => (
              <Card key={event.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <p className="font-medium">{event.title}</p>
                        <Badge variant="outline">{event.event_type}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.court || "TBD"}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(event.start_time), "MMM d, h:mm a")} – {format(new Date(event.end_time), "h:mm a")}</span>
                      </div>
                      {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "attending" })}>Going</Button>
                      <Button size="sm" variant="ghost" onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "maybe" })}>Maybe</Button>
                      <Button size="sm" variant="ghost" onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "not_attending" })}>Can't go</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {pastEvents.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Past Events ({pastEvents.length})</h2>
          <div className="space-y-2 opacity-60">
            {pastEvents.slice(0, 10).map((event: any) => (
              <Card key={event.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{event.title}</p>
                    <Badge variant="outline">{event.event_type}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(event.start_time), "MMM d, h:mm a")}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
