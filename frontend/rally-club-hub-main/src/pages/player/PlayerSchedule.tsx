import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const ABSENCE_REASON_OPTIONS = [
  "Illness / injury",
  "Family commitment",
  "School / exam",
  "Travel",
  "Work",
  "Personal reasons",
  "Other",
];

export default function PlayerSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [teamFilter, setTeamFilter] = useState("all");

  // Absence reason dialog state
  const [absenceDialog, setAbsenceDialog] = useState<{ eventId: number } | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceOther, setAbsenceOther] = useState("");

  const { data: teams = [] } = useQuery({
    queryKey: ["my-teams"],
    queryFn: async () => (await api.teams.myTeams()).data || [],
  });

  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ["my-calendar"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
  });

  const events = teamFilter === "all"
    ? allEvents
    : (allEvents as any[]).filter((e: any) => String(e.team_id) === teamFilter);

  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status, absence_reason }: { eventId: number; status: string; absence_reason?: string }) =>
      api.rsvps.upsert({ event_id: eventId, player_user_id: user!.id, status, absence_reason } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-calendar"] });
      toast({ title: "RSVP updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCantGo = (eventId: number) => {
    setAbsenceReason("");
    setAbsenceOther("");
    setAbsenceDialog({ eventId });
  };

  const submitCantGo = () => {
    if (!absenceDialog) return;
    if (!absenceReason) {
      toast({ title: "Reason required", description: "Please select a reason for your absence.", variant: "destructive" });
      return;
    }
    const finalReason = absenceReason === "Other" ? (absenceOther.trim() || "Other") : absenceReason;
    if (absenceReason === "Other" && !absenceOther.trim()) {
      toast({ title: "Please specify", description: "Please describe your reason.", variant: "destructive" });
      return;
    }
    rsvpMutation.mutate({ eventId: absenceDialog.eventId, status: "not_attending", absence_reason: finalReason });
    setAbsenceDialog(null);
  };

  const upcomingEvents = (events as any[]).filter((e: any) => parseUTC(e.start_time) >= new Date());
  const pastEvents = (events as any[]).filter((e: any) => parseUTC(e.start_time) < new Date());

  const typeColor: Record<string, string> = {
    practice: "bg-blue-100 text-blue-800",
    match: "bg-green-100 text-green-800",
    tryout: "bg-purple-100 text-purple-800",
    tournament: "bg-orange-100 text-orange-800",
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Schedule</h1>
          <p className="text-muted-foreground">View and RSVP to your events</p>
        </div>
        {(teams as any[]).length > 1 && (
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {(teams as any[]).map((t: any) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <p className="font-medium">{event.title}</p>
                        <Badge variant="secondary" className={typeColor[event.event_type] || ""}>{event.event_type}</Badge>
                        {event.team && (
                          <Badge variant="outline" className="text-xs">{event.team.name}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.court || "TBD"}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(parseUTC(event.start_time), "MMM d, h:mm a")} – {format(parseUTC(event.end_time), "h:mm a")}
                        </span>
                      </div>
                      {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0 ml-4">
                      <Button size="sm" variant="outline"
                        onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "attending" })}>
                        Going
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "maybe" })}>
                        Maybe
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => handleCantGo(event.id)}>
                        Can't go
                      </Button>
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
                    <Badge variant="secondary" className={typeColor[event.event_type] || ""}>{event.event_type}</Badge>
                    {event.team && <span className="text-xs text-muted-foreground">{event.team.name}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{format(parseUTC(event.start_time), "MMM d, h:mm a")}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Absence reason dialog */}
      <Dialog open={!!absenceDialog} onOpenChange={v => { if (!v) setAbsenceDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Why can't you make it?</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Select value={absenceReason} onValueChange={setAbsenceReason}>
                <SelectTrigger className={!absenceReason ? "border-muted-foreground/40" : ""}>
                  <SelectValue placeholder="Select a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {ABSENCE_REASON_OPTIONS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {absenceReason === "Other" && (
              <div>
                <Label>Please specify <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Describe your reason…"
                  value={absenceOther}
                  onChange={e => setAbsenceOther(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbsenceDialog(null)}>Cancel</Button>
            <Button onClick={submitCantGo} disabled={rsvpMutation.isPending}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
