import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, MapPin, Clock, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths,
} from "date-fns";

const typeColor: Record<string, string> = {
  practice: "bg-blue-500",
  match: "bg-green-500",
  tryout: "bg-purple-500",
  tournament: "bg-orange-500",
};

const typeBadge: Record<string, string> = {
  practice: "bg-blue-100 text-blue-800",
  match: "bg-green-100 text-green-800",
  tryout: "bg-purple-100 text-purple-800",
  tournament: "bg-orange-100 text-orange-800",
};

export default function PlayerCalendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [teamFilter, setTeamFilter] = useState("all");

  const { data: teams = [] } = useQuery({
    queryKey: ["my-teams"],
    queryFn: async () => (await api.teams.myTeams()).data || [],
  });

  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ["my-calendar"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
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

  const events: any[] = teamFilter === "all"
    ? allEvents as any[]
    : (allEvents as any[]).filter((e: any) => String(e.team_id) === teamFilter);

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  function eventsOnDay(day: Date) {
    return events.filter((e: any) => isSameDay(parseUTC(e.start_time), day));
  }

  const selectedDayEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  if (isLoading) return <div className="animate-pulse h-96 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">My Calendar</h1>
          <p className="text-muted-foreground">View your upcoming matches and practice sessions</p>
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

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{format(currentMonth, "MMMM yyyy")}</CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>Today</Button>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {calDays.map(day => {
              const dayEvents = eventsOnDay(day);
              const inMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const today = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(day)}
                  className={`
                    bg-card min-h-[72px] p-1 text-left transition-colors hover:bg-accent
                    ${!inMonth ? "opacity-40" : ""}
                    ${isSelected ? "ring-2 ring-inset ring-primary" : ""}
                  `}
                >
                  <span className={`
                    text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                    ${today ? "bg-primary text-primary-foreground" : ""}
                  `}>
                    {format(day, "d")}
                  </span>
                  <div className="mt-1 flex flex-col gap-px">
                    {dayEvents.slice(0, 3).map((e: any) => (
                      <div
                        key={e.id}
                        className={`text-[10px] truncate rounded px-1 text-white ${typeColor[e.event_type] || "bg-gray-400"}`}
                      >
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
            {Object.entries(typeColor).map(([type, color]) => (
              <span key={type} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${color}`} />
                {type}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Selected day detail */}
      {selectedDay && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {format(selectedDay, "EEEE, MMMM d")}
            <span className="text-sm font-normal text-muted-foreground">({selectedDayEvents.length} event{selectedDayEvents.length !== 1 ? "s" : ""})</span>
          </h2>
          {selectedDayEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No events on this day</p>
          ) : (
            <div className="space-y-3">
              {selectedDayEvents.map((event: any) => (
                <Card key={event.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{event.title}</p>
                          <Badge variant="secondary" className={typeBadge[event.event_type] || ""}>{event.event_type}</Badge>
                          {event.team && <Badge variant="outline" className="text-xs">{event.team.name}</Badge>}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{event.court || "TBD"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(parseUTC(event.start_time), "h:mm a")} – {format(parseUTC(event.end_time), "h:mm a")}
                          </span>
                        </div>
                        {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
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
      )}
    </div>
  );
}
