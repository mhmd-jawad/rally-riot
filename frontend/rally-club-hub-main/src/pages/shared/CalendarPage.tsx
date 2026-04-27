import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, MapPin, Clock, Calendar, Users, CalendarOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  addMonths, subMonths,
} from "date-fns";

const TYPE_DOT: Record<string, string> = {
  practice:   "bg-blue-500",
  match:      "bg-green-500",
  tryout:     "bg-purple-500",
  tournament: "bg-orange-500",
};

const TYPE_BADGE: Record<string, string> = {
  practice:   "bg-blue-100 text-blue-800",
  match:      "bg-green-100 text-green-800",
  tryout:     "bg-purple-100 text-purple-800",
  tournament: "bg-orange-100 text-orange-800",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const BLOCK_TYPE_BADGE: Record<string, string> = {
  holiday: "bg-orange-100 text-orange-800",
  exam: "bg-purple-100 text-purple-800",
};

export default function CalendarPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, role } = useAuth();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [teamFilter, setTeamFilter] = useState("all");
  const [childId, setChildId] = useState<string>("");

  // Fetch teams for filter (players and coaches)
  const { data: myTeams = [] } = useQuery({
    queryKey: ["my-teams"],
    queryFn: async () => (await api.teams.myTeams()).data || [],
    enabled: role === "player" || role === "coach",
  });

  // Fetch children for parent role
  const { data: allLinks = [] } = useQuery({
    queryKey: ["parent-child-links"],
    queryFn: async () => (await api.parentChild.list()).data || [],
    enabled: role === "parent",
  });
  const children = (allLinks as any[]).filter((l: any) => l.parent_user_id === user?.id);
  const activeChildId = childId || (children[0]?.child_user_id ? String(children[0].child_user_id) : "");

  // Fetch events — parent uses child schedule, everyone else uses myCalendar
  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: role === "parent"
      ? ["child-schedule", activeChildId]
      : ["my-calendar"],
    queryFn: async () => {
      if (role === "parent") {
        if (!activeChildId) return [];
        return (await api.events.childSchedule(Number(activeChildId))).data || [];
      }
      return (await api.events.myCalendar()).data || [];
    },
    enabled: role !== "parent" || !!activeChildId,
  });

  const { data: blockedDates = [] } = useQuery({
    queryKey: ["blocked-dates"],
    queryFn: async () => (await api.blockedDates.list()).data || [],
  });

  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status, playerId }: { eventId: number; status: string; playerId?: number }) =>
      api.rsvps.upsert({ event_id: eventId, player_user_id: playerId ?? user!.id, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["child-schedule", activeChildId] });
      toast({ title: "RSVP updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Apply team filter
  const events: any[] = teamFilter === "all"
    ? allEvents as any[]
    : (allEvents as any[]).filter((e: any) => String(e.team_id) === teamFilter);

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function eventsOnDay(day: Date) {
    return events.filter((e: any) => isSameDay(parseUTC(e.start_time), day))
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }

  function blockedOnDay(day: Date) {
    const dayIso = format(day, "yyyy-MM-dd");
    return (blockedDates as any[]).filter((b: any) => dayIso >= b.start_date && dayIso <= b.end_date);
  }

  const selectedDayEvents = eventsOnDay(selectedDay);
  const selectedDayBlocks = blockedOnDay(selectedDay);
  const upcomingCount = events.filter((e: any) => parseUTC(e.start_time) >= new Date()).length;

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6" /> Calendar
          </h1>
          <p className="text-muted-foreground text-sm">{upcomingCount} upcoming event{upcomingCount !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Parent child selector */}
          {role === "parent" && children.length > 1 && (
            <Select value={activeChildId} onValueChange={setChildId}>
              <SelectTrigger className="w-44">
                <Users className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Select child" />
              </SelectTrigger>
              <SelectContent>
                {children.map((l: any) => (
                  <SelectItem key={l.child_user_id} value={String(l.child_user_id)}>
                    {l.child?.full_name || `Child #${l.child_user_id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Team filter for player / coach */}
          {(role === "player" || role === "coach") && (myTeams as any[]).length > 1 && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All teams" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {(myTeams as any[]).map((t: any) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">

        {/* ── Calendar grid ── */}
        <div className="border rounded-xl overflow-hidden bg-card">

          {/* Month nav */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h2 className="font-semibold text-base">{format(currentMonth, "MMMM yyyy")}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setCurrentMonth(new Date()); setSelectedDay(new Date()); }}>
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          {isLoading ? (
            <div className="h-64 animate-pulse bg-muted/40" />
          ) : (
            <div className="grid grid-cols-7">
              {calDays.map((day, i) => {
                const dayEvents = eventsOnDay(day);
                const inMonth = isSameMonth(day, currentMonth);
                const selected = isSameDay(day, selectedDay);
                const today = isToday(day);
                const blocked = blockedOnDay(day).length > 0;
                const isLast = i === calDays.length - 1;
                const isLastRow = i >= calDays.length - 7;

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(day)}
                    className={[
                      "min-h-[80px] p-1.5 text-left border-r border-b transition-colors",
                      "hover:bg-accent focus:outline-none",
                      !inMonth && "opacity-35",
                      blocked && "bg-orange-50/70",
                      selected && "bg-accent ring-2 ring-inset ring-primary",
                      isLast && "border-r-0",
                      isLastRow && "border-b-0",
                    ].filter(Boolean).join(" ")}
                  >
                    <span className={[
                      "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1",
                      today && "bg-primary text-primary-foreground",
                      !today && selected && "text-primary font-bold",
                    ].filter(Boolean).join(" ")}>
                      {format(day, "d")}
                    </span>
                    <div className="flex flex-col gap-px">
                      {dayEvents.slice(0, 3).map((e: any) => (
                        <div
                          key={e.id}
                          className={`text-[10px] leading-tight truncate rounded px-1 py-px text-white ${TYPE_DOT[e.event_type] || "bg-gray-400"}`}
                        >
                          {format(parseUTC(e.start_time), "h:mm")} {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</div>
                      )}
                      {blocked && (
                        <div className="text-[10px] text-orange-700 pl-1">Blocked</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
            {Object.entries(TYPE_DOT).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1 capitalize">
                <span className={`w-2 h-2 rounded-full ${color}`} />
                {type}
              </span>
            ))}
          </div>
        </div>

        {/* ── Day detail panel ── */}
        <div className="border rounded-xl bg-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="font-semibold text-sm">{format(selectedDay, "EEEE, MMMM d")}</p>
            <p className="text-xs text-muted-foreground">
              {selectedDayEvents.length === 0 ? "No events" : `${selectedDayEvents.length} event${selectedDayEvents.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto divide-y">
            {selectedDayBlocks.length > 0 && (
              <div className="p-3 space-y-2 bg-orange-50/60">
                <p className="text-xs font-medium flex items-center gap-1">
                  <CalendarOff className="w-3 h-3" /> Reservations blocked on this date
                </p>
                {selectedDayBlocks.map((b: any) => (
                  <div key={b.id} className="flex items-center gap-2">
                    <Badge variant="secondary" className={BLOCK_TYPE_BADGE[b.block_type] || ""}>{b.block_type}</Badge>
                    <span className="text-xs text-muted-foreground">{b.label}</span>
                  </div>
                ))}
              </div>
            )}
            {selectedDayEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                <Calendar className="w-8 h-8 opacity-30" />
                <p>No events on this day</p>
              </div>
            ) : (
              selectedDayEvents.map((event: any) => (
                <div key={event.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{event.title}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        <Badge variant="secondary" className={`text-xs ${TYPE_BADGE[event.event_type] || ""}`}>
                          {event.event_type}
                        </Badge>
                        {event.team && (
                          <Badge variant="outline" className="text-xs">{event.team.name}</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" />
                      {format(parseUTC(event.start_time), "h:mm a")} – {format(parseUTC(event.end_time), "h:mm a")}
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {event.court || "TBD"}
                    </div>
                  </div>

                  {event.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
                  )}

                  {/* RSVP — only for upcoming events and player/parent */}
                  {(role === "player" || role === "parent") && parseUTC(event.start_time) >= new Date() && (
                    <div className="flex gap-1 pt-1">
                      {role === "player" ? (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                            onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "attending" })}>Going</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs flex-1"
                            onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "maybe" })}>Maybe</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs flex-1"
                            onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "not_attending" })}>Can't go</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                            onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "attending", playerId: Number(activeChildId) })}>Accept</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs flex-1"
                            onClick={() => rsvpMutation.mutate({ eventId: event.id, status: "not_attending", playerId: Number(activeChildId) })}>Decline</Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
