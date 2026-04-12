import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function CoachAttendance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState("");

  // Load only this coach's events (via my/calendar)
  const { data: events = [] } = useQuery({
    queryKey: ["my-events"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
  });

  // Show all events (past and upcoming) for attendance — coach may want to mark early
  const selectedEventObj = events.find((e: any) => String(e.id) === selectedEvent) as any;

  // Load all teams to find players for the selected event's team
  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await api.teams.list()).data || [],
  });

  // Get the players on the selected event's team
  const teamPlayers: any[] = selectedEventObj
    ? (teams.find((t: any) => t.id === selectedEventObj.team_id)?.players || [])
    : [];

  const { data: rsvps = [] } = useQuery({
    queryKey: ["rsvps", selectedEvent],
    queryFn: async () => selectedEvent ? (await api.rsvps.forEvent(Number(selectedEvent))).data || [] : [],
    enabled: !!selectedEvent,
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["attendance", selectedEvent],
    queryFn: async () => selectedEvent ? (await api.attendance.forEvent(Number(selectedEvent))).data || [] : [],
    enabled: !!selectedEvent,
  });

  const markMutation = useMutation({
    mutationFn: ({ playerId, status }: { playerId: number; status: string }) =>
      api.attendance.mark({ event_id: Number(selectedEvent), player_user_id: playerId, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", selectedEvent] });
      toast({ title: "Attendance recorded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const getAttendanceStatus = (playerId: number) => {
    const rec = (attendance as any[]).find((a: any) => a.player_user_id === playerId);
    return rec?.status || null;
  };

  const getRsvpStatus = (playerId: number) => {
    const rec = (rsvps as any[]).find((r: any) => r.player_user_id === playerId);
    return rec?.status || null;
  };

  const rsvpStatusIcon: Record<string, any> = {
    attending: <CheckCircle className="w-4 h-4 text-green-600" />,
    not_attending: <XCircle className="w-4 h-4 text-red-600" />,
    maybe: <Clock className="w-4 h-4 text-yellow-600" />,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-muted-foreground">Mark player attendance for events</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Select Event</CardTitle></CardHeader>
        <CardContent>
          <Select value={selectedEvent} onValueChange={setSelectedEvent}>
            <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="Choose an event..." /></SelectTrigger>
            <SelectContent>
              {events.map((e: any) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.title} — {format(new Date(e.start_time), "MMM d, h:mm a")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedEvent && (
        <Card>
          <CardHeader>
            <CardTitle>
              Players & Attendance
              {teamPlayers.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({teamPlayers.length} players on team)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {teamPlayers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No players assigned to this team yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="p-3">Player</th>
                      <th className="p-3">RSVP</th>
                      <th className="p-3">Attendance</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamPlayers.map((tp: any) => {
                      const playerId = tp.id;
                      const playerName = tp.full_name ?? `Player #${playerId}`;
                      const attStatus = getAttendanceStatus(playerId);
                      const rsvpStatus = getRsvpStatus(playerId);
                      return (
                        <tr key={playerId} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="p-3 font-medium text-sm">{playerName}</td>
                          <td className="p-3">
                            {rsvpStatus ? (
                              <div className="flex items-center gap-1">
                                {rsvpStatusIcon[rsvpStatus]}
                                <span className="text-sm capitalize">{rsvpStatus.replace("_", " ")}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Minus className="w-4 h-4" />
                                <span className="text-sm">No RSVP</span>
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            {attStatus ? (
                              <Badge variant="secondary" className={attStatus === "present" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                {attStatus}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">Not marked</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              <Button size="sm" variant={attStatus === "present" ? "default" : "outline"}
                                onClick={() => markMutation.mutate({ playerId, status: "present" })}>
                                Present
                              </Button>
                              <Button size="sm" variant={attStatus === "absent" ? "destructive" : "outline"}
                                onClick={() => markMutation.mutate({ playerId, status: "absent" })}>
                                Absent
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
