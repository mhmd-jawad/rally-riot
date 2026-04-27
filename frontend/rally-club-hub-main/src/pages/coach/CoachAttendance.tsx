import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, Clock, Minus, UserCheck, ClipboardList } from "lucide-react";
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

export default function CoachAttendance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState("");
  // absence reasons drafted by coach per player
  const [absenceReasons, setAbsenceReasons] = useState<Record<number, string>>({});
  const [absenceOther, setAbsenceOther] = useState<Record<number, string>>({});

  const { data: events = [] } = useQuery({
    queryKey: ["my-events"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
  });

  const selectedEventObj = (events as any[]).find((e: any) => String(e.id) === selectedEvent) as any;

  // Load coach's own teams (with members) so we can get the roster
  const { data: teams = [] } = useQuery({
    queryKey: ["my-teams-members"],
    queryFn: async () => (await api.teams.myTeams(true)).data || [],
  });

  const teamPlayers: any[] = selectedEventObj
    ? ((teams as any[]).find((t: any) => t.id === selectedEventObj.team_id)?.players || []).filter(
        (p: any) => !p.email?.endsWith(".internal")
      )
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

  // ── Lineup: coach RSVPs a player as "attending" (assigns to match) ──────────
  const lineupMutation = useMutation({
    mutationFn: ({ playerId, status }: { playerId: number; status: string }) =>
      api.rsvps.coachUpsert({ event_id: Number(selectedEvent), player_user_id: playerId, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rsvps", selectedEvent] });
      toast({ title: "Lineup updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Attendance marking ───────────────────────────────────────────────────────
  const markMutation = useMutation({
    mutationFn: ({ playerId, status, absence_reason }: { playerId: number; status: string; absence_reason?: string }) =>
      api.attendance.mark({ event_id: Number(selectedEvent), player_user_id: playerId, status, absence_reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", selectedEvent] });
      toast({ title: "Attendance recorded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getAttendanceRecord = (playerId: number) =>
    (attendance as any[]).find((a: any) => a.player_user_id === playerId) || null;

  const getAttendanceStatus = (playerId: number) =>
    getAttendanceRecord(playerId)?.status || null;

  const getSavedAbsenceReason = (playerId: number) =>
    getAttendanceRecord(playerId)?.absence_reason || "";

  const getRsvpRecord = (playerId: number) =>
    (rsvps as any[]).find((r: any) => r.player_user_id === playerId) || null;

  const getRsvpStatus = (playerId: number) =>
    getRsvpRecord(playerId)?.status || null;

  const getRsvpAbsenceReason = (playerId: number) =>
    getRsvpRecord(playerId)?.absence_reason || "";

  // Effective reason: coach draft > saved attendance record > player's RSVP reason
  // Use || not ?? so empty strings also fall through to the next source
  const getEffectiveReason = (playerId: number) =>
    absenceReasons[playerId] || getSavedAbsenceReason(playerId) || getRsvpAbsenceReason(playerId) || "";

  const assignedPlayers = teamPlayers.filter((p: any) => getRsvpStatus(p.id) === "attending");
  const unassignedPlayers = teamPlayers.filter((p: any) => getRsvpStatus(p.id) !== "attending");

  const rsvpStatusIcon: Record<string, any> = {
    attending: <CheckCircle className="w-4 h-4 text-green-600" />,
    not_attending: <XCircle className="w-4 h-4 text-red-600" />,
    maybe: <Clock className="w-4 h-4 text-yellow-600" />,
  };

  // Mark absent — uses whatever reason is already in state (pre-filled from RSVP or coach draft)
  const handleMarkAbsent = (playerId: number) => {
    const reason = getEffectiveReason(playerId);
    const other = absenceOther[playerId]?.trim() || "";
    const finalReason = reason === "Other" ? (other || "Other") : (reason || "Personal reasons");
    markMutation.mutate({ playerId, status: "absent", absence_reason: finalReason });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-muted-foreground">Assign players to events and mark attendance</p>
      </div>

      {/* Event selector */}
      <Card>
        <CardHeader><CardTitle>Select Event</CardTitle></CardHeader>
        <CardContent>
          <Select value={selectedEvent} onValueChange={v => { setSelectedEvent(v); setAbsenceReasons({}); setAbsenceOther({}); }}>
            <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="Choose an event..." /></SelectTrigger>
            <SelectContent>
              {(events as any[]).map((e: any) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.title} — {format(parseUTC(e.start_time), "MMM d, h:mm a")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedEvent && (
        <Tabs defaultValue="lineup">
          <TabsList className="mb-4">
            <TabsTrigger value="lineup"><UserCheck className="w-4 h-4 mr-1" /> Lineup</TabsTrigger>
            <TabsTrigger value="attendance"><ClipboardList className="w-4 h-4 mr-1" /> Attendance</TabsTrigger>
          </TabsList>

          {/* ── LINEUP TAB ──────────────────────────────────────────────────── */}
          <TabsContent value="lineup">
            <div className="space-y-4">
              {/* Assigned / confirmed players */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Assigned to this event
                    <span className="ml-2 text-sm font-normal text-muted-foreground">({assignedPlayers.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {assignedPlayers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No players assigned yet. Use the roster below to add players.</p>
                  ) : (
                    <div className="space-y-2">
                      {assignedPlayers.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium">{p.full_name}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground h-7 text-xs"
                            onClick={() => lineupMutation.mutate({ playerId: p.id, status: "not_attending" })}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Full roster with RSVP status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Team Roster
                    <span className="ml-2 text-sm font-normal text-muted-foreground">({teamPlayers.length} players)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {teamPlayers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No players assigned to this team yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b text-left text-xs text-muted-foreground">
                            <th className="p-3">Player</th>
                            <th className="p-3">Player RSVP</th>
                            <th className="p-3">Lineup status</th>
                            <th className="p-3">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamPlayers.map((p: any) => {
                            const rsvp = getRsvpStatus(p.id);
                            const assigned = rsvp === "attending";
                            return (
                              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                                <td className="p-3 font-medium text-sm">{p.full_name}</td>
                                <td className="p-3">
                                  {rsvp ? (
                                    <div className="flex items-center gap-1">
                                      {rsvpStatusIcon[rsvp]}
                                      <span className="text-sm capitalize">{rsvp.replace("_", " ")}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-muted-foreground">
                                      <Minus className="w-4 h-4" />
                                      <span className="text-sm">No RSVP</span>
                                    </div>
                                  )}
                                </td>
                                <td className="p-3">
                                  {assigned ? (
                                    <Badge className="bg-green-100 text-green-800 border-0">Assigned</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">Not assigned</Badge>
                                  )}
                                </td>
                                <td className="p-3">
                                  {assigned ? (
                                    <Button size="sm" variant="outline" className="text-destructive border-destructive/40 h-7"
                                      onClick={() => lineupMutation.mutate({ playerId: p.id, status: "not_attending" })}>
                                      Remove
                                    </Button>
                                  ) : (
                                    <Button size="sm" variant="outline" className="h-7"
                                      onClick={() => lineupMutation.mutate({ playerId: p.id, status: "attending" })}>
                                      Add to lineup
                                    </Button>
                                  )}
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
            </div>
          </TabsContent>

          {/* ── ATTENDANCE TAB ───────────────────────────────────────────────── */}
          <TabsContent value="attendance">
            <Card>
              <CardHeader>
                <CardTitle>
                  Mark Attendance
                  {assignedPlayers.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      — showing {assignedPlayers.length} assigned player{assignedPlayers.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {teamPlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No players assigned to this team yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-left text-sm text-muted-foreground">
                          <th className="p-3">Player</th>
                          <th className="p-3">RSVP</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Mark</th>
                          <th className="p-3 min-w-[220px]">Absence Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Assigned players first, then the rest */}
                        {[...assignedPlayers, ...unassignedPlayers].map((p: any) => {
                          const attStatus = getAttendanceStatus(p.id);
                          const rsvp = getRsvpStatus(p.id);

                          // Show absence UI if: attendance record says absent OR player RSVPed not_attending
                          const isAbsent = attStatus === "absent" || rsvp === "not_attending";

                          // Pre-filled reason from RSVP, overridable by coach
                          const selectedReason = getEffectiveReason(p.id);
                          const otherText = absenceOther[p.id] ?? "";

                          // Show "absent" status as soon as we know they're not coming
                          const displayStatus = attStatus ?? (rsvp === "not_attending" ? "absent" : null);

                          return (
                            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="p-3 font-medium text-sm">
                                {p.full_name}
                                {rsvp === "attending" && (
                                  <Badge variant="outline" className="ml-2 text-[10px] text-green-700 border-green-300">Assigned</Badge>
                                )}
                              </td>
                              <td className="p-3">
                                {rsvp ? (
                                  <div className="flex items-center gap-1">
                                    {rsvpStatusIcon[rsvp]}
                                    <span className="text-sm capitalize">{rsvp.replace("_", " ")}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Minus className="w-4 h-4" />
                                    <span className="text-sm">No RSVP</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-3">
                                {displayStatus ? (
                                  <Badge variant="secondary" className={displayStatus === "present" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                    {displayStatus}
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">Not marked</span>
                                )}
                              </td>
                              <td className="p-3">
                                <div className="flex gap-2">
                                  <Button size="sm" variant={attStatus === "present" ? "default" : "outline"}
                                    onClick={() => markMutation.mutate({ playerId: p.id, status: "present" })}>
                                    Present
                                  </Button>
                                  <Button size="sm" variant={isAbsent ? "destructive" : "outline"}
                                    onClick={() => handleMarkAbsent(p.id)}>
                                    Absent
                                  </Button>
                                </div>
                              </td>
                              <td className="p-3 space-y-1">
                                {/* Show reason selector whenever player is absent (marked or RSVPed not_attending) */}
                                {isAbsent ? (
                                  <div className="space-y-1">
                                    <Select
                                      value={selectedReason}
                                      onValueChange={v => {
                                        setAbsenceReasons(prev => ({ ...prev, [p.id]: v }));
                                        if (v !== "Other") {
                                          markMutation.mutate({ playerId: p.id, status: "absent", absence_reason: v });
                                        }
                                      }}
                                    >
                                      <SelectTrigger className={`h-8 text-xs w-48 ${!selectedReason ? "border-destructive" : ""}`}>
                                        <SelectValue placeholder="Select reason…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ABSENCE_REASON_OPTIONS.map(r => (
                                          <SelectItem key={r} value={r}>{r}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {selectedReason === "Other" && (
                                      <Input
                                        className="h-8 text-xs w-48"
                                        placeholder="Specify reason…"
                                        value={otherText}
                                        onChange={e => setAbsenceOther(prev => ({ ...prev, [p.id]: e.target.value }))}
                                        onBlur={() => {
                                          const finalReason = otherText.trim() || "Other";
                                          markMutation.mutate({ playerId: p.id, status: "absent", absence_reason: finalReason });
                                        }}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
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
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
