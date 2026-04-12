import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function ParentSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedChild, setSelectedChild] = useState("");

  const { data: children = [] } = useQuery({
    queryKey: ["my-children"],
    queryFn: async () => (await api.parentChild.list()).data || [],
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["child-schedule", selectedChild],
    queryFn: async () => {
      if (selectedChild) {
        return (await api.events.childSchedule(Number(selectedChild))).data || [];
      }
      return (await api.events.myCalendar()).data || [];
    },
  });

  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, playerId, status }: { eventId: number; playerId: number; status: string }) =>
      api.rsvps.upsert({ event_id: eventId, player_user_id: playerId, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["child-schedule"] });
      toast({ title: "RSVP updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const upcomingEvents = events.filter((e: any) => new Date(e.start_time) >= new Date());
  const pastEvents = events.filter((e: any) => new Date(e.start_time) < new Date());

  const childId = selectedChild ? Number(selectedChild) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-muted-foreground">View and manage your child's schedule</p>
        </div>
        {children.length > 1 && (
          <Select value={selectedChild} onValueChange={setSelectedChild}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All children" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All children</SelectItem>
              {children.map((c: any) => (
                <SelectItem key={c.child_user_id} value={String(c.child_user_id)}>
                  {c.child?.full_name || `Child #${c.child_user_id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? <div className="animate-pulse h-64 bg-muted rounded-xl" /> : (
        <>
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
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(event.start_time), "MMM d, h:mm a")}</span>
                          </div>
                        </div>
                        {childId && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline"
                              onClick={() => rsvpMutation.mutate({ eventId: event.id, playerId: childId, status: "attending" })}>
                              Accept
                            </Button>
                            <Button size="sm" variant="ghost"
                              onClick={() => rsvpMutation.mutate({ eventId: event.id, playerId: childId, status: "not_attending" })}>
                              Decline
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {pastEvents.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Past ({pastEvents.length})</h2>
              <div className="space-y-2 opacity-60">
                {pastEvents.slice(0, 5).map((event: any) => (
                  <Card key={event.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{event.title}</p>
                        <span className="text-xs text-muted-foreground">{format(new Date(event.start_time), "MMM d")}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
