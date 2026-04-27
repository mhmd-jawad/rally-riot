import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Clock, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const RSVP_LABELS: Record<string, string> = {
  attending: "Accepted",
  not_attending: "Declined",
  maybe: "Maybe",
};

const RSVP_BADGE: Record<string, string> = {
  attending: "bg-green-100 text-green-800",
  not_attending: "bg-red-100 text-red-800",
  maybe: "bg-yellow-100 text-yellow-800",
};

const RSVP_ICON: Record<string, any> = {
  attending: CheckCircle2,
  not_attending: XCircle,
  maybe: HelpCircle,
};

export default function ParentSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedChild, setSelectedChild] = useState("");

  const { data: children = [] } = useQuery({
    queryKey: ["my-children"],
    queryFn: async () => (await api.parentChild.list()).data || [],
  });

  const effectiveChild = selectedChild || (children.length > 0 ? String((children[0] as any).child_user_id) : "");

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["child-schedule", effectiveChild],
    queryFn: async () => {
      if (effectiveChild) {
        return (await api.events.childSchedule(Number(effectiveChild))).data || [];
      }
      return [];
    },
    enabled: children.length > 0,
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

  const upcomingEvents = (events as any[]).filter((e: any) => parseUTC(e.start_time) >= new Date());
  const pastEvents = (events as any[]).filter((e: any) => parseUTC(e.start_time) < new Date());

  const childId = effectiveChild ? Number(effectiveChild) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-muted-foreground">View and manage your child's schedule</p>
        </div>
        {(children as any[]).length > 1 && (
          <Select value={effectiveChild} onValueChange={setSelectedChild}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select child" /></SelectTrigger>
            <SelectContent>
              {(children as any[]).map((c: any) => (
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
                {upcomingEvents.map((event: any) => {
                  const currentRsvp: string | null = event.my_rsvp ?? null;
                  const RsvpIcon = currentRsvp ? RSVP_ICON[currentRsvp] : null;
                  return (
                    <Card key={event.id}>
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                              <p className="font-medium">{event.title}</p>
                              <Badge variant="outline">{event.event_type}</Badge>
                              {event.team && <Badge variant="outline" className="text-xs">{event.team.name}</Badge>}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.court || "TBD"}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(parseUTC(event.start_time), "MMM d, h:mm a")}</span>
                            </div>
                            {currentRsvp && (
                              <div className="flex items-center gap-1.5 mt-1">
                                {RsvpIcon && <RsvpIcon className="w-3.5 h-3.5" />}
                                <Badge variant="secondary" className={`text-xs ${RSVP_BADGE[currentRsvp]}`}>
                                  {RSVP_LABELS[currentRsvp]}
                                </Badge>
                              </div>
                            )}
                          </div>
                          {childId && (
                            <div className="flex gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant={currentRsvp === "attending" ? "default" : "outline"}
                                className={currentRsvp === "attending" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                                disabled={rsvpMutation.isPending}
                                onClick={() => rsvpMutation.mutate({ eventId: event.id, playerId: childId, status: "attending" })}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant={currentRsvp === "not_attending" ? "destructive" : "ghost"}
                                disabled={rsvpMutation.isPending}
                                onClick={() => rsvpMutation.mutate({ eventId: event.id, playerId: childId, status: "not_attending" })}
                              >
                                Decline
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
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
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{event.title}</p>
                          <span className="text-xs text-muted-foreground">{format(parseUTC(event.start_time), "MMM d")}</span>
                        </div>
                        {event.my_rsvp && (
                          <Badge variant="secondary" className={`text-xs ${RSVP_BADGE[event.my_rsvp] || ""}`}>
                            {RSVP_LABELS[event.my_rsvp]}
                          </Badge>
                        )}
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
