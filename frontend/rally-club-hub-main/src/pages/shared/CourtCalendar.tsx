import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, ChevronLeft, ChevronRight, Clock, User, Trophy } from "lucide-react";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks,
  isToday, isSameDay, parseISO,
} from "date-fns";

const typeColor: Record<string, string> = {
  practice: "bg-blue-100 text-blue-800 border-blue-200",
  match: "bg-green-100 text-green-800 border-green-200",
  tryout: "bg-purple-100 text-purple-800 border-purple-200",
  tournament: "bg-orange-100 text-orange-800 border-orange-200",
};

export default function CourtCalendar() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch all events for the selected week
  const startISO = weekStart.toISOString();
  const endISO = weekEnd.toISOString();

  const { data: eventsData = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["all-events-week", startISO],
    queryFn: async () => (await api.events.list()).data || [],
  });

  const { data: courtsData } = useQuery({
    queryKey: ["courts"],
    queryFn: async () => (await api.events.courts()).data,
  });

  const allEvents: any[] = eventsData as any[];
  const courts: string[] = (courtsData as any)?.all || [];

  // Filter to selected day
  const dayEvents = allEvents.filter((e: any) =>
    isSameDay(parseUTC(e.start_time), selectedDay)
  );

  // If a court is selected, further filter
  const filteredEvents = selectedCourt
    ? dayEvents.filter((e: any) => e.court === selectedCourt)
    : dayEvents;

  // Group by court
  const eventsByCourt: Record<string, any[]> = {};
  filteredEvents.forEach((e: any) => {
    if (!eventsByCourt[e.court]) eventsByCourt[e.court] = [];
    eventsByCourt[e.court].push(e);
  });

  // Determine free/booked courts for selected day
  const bookedCourtsToday = new Set(dayEvents.map((e: any) => e.court));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Court Calendar</h1>
        <p className="text-muted-foreground">See which courts are reserved, at what time, and by whom</p>
      </div>

      {/* Week navigator */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setWeekStart(w => subWeeks(w, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium">
                {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
              </span>
              <Button variant="ghost" size="icon" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date();
                setWeekStart(startOfWeek(today, { weekStartsOn: 0 }));
                setSelectedDay(today);
              }}
            >
              Today
            </Button>
          </div>

          {/* Day selector strip */}
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(day => {
              const hasEvents = allEvents.some((e: any) => isSameDay(parseUTC(e.start_time), day));
              const selected = isSameDay(day, selectedDay);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(day)}
                  className={`
                    flex flex-col items-center py-2 px-1 rounded-lg transition-colors text-xs
                    ${selected ? "bg-primary text-primary-foreground" : "hover:bg-accent"}
                    ${isToday(day) && !selected ? "font-bold text-primary" : ""}
                  `}
                >
                  <span className="text-[10px] uppercase">{format(day, "EEE")}</span>
                  <span className="text-sm font-semibold mt-0.5">{format(day, "d")}</span>
                  {hasEvents && (
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 ${selected ? "bg-primary-foreground" : "bg-primary"}`} />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Court filter pills */}
      {courts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCourt(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              selectedCourt === null ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"
            }`}
          >
            All courts
          </button>
          {courts.map(court => {
            const booked = bookedCourtsToday.has(court);
            return (
              <button
                key={court}
                onClick={() => setSelectedCourt(court === selectedCourt ? null : court)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                  selectedCourt === court
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${booked ? "bg-red-500" : "bg-green-500"}`} />
                {court}
              </button>
            );
          })}
        </div>
      )}

      {/* Status summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Reserved</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Available</span>
      </div>

      {/* Day detail */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          {format(selectedDay, "EEEE, MMMM d")}
          {filteredEvents.length === 0
            ? <span className="text-sm font-normal text-muted-foreground ml-1">— no reservations</span>
            : <span className="text-sm font-normal text-muted-foreground ml-1">({filteredEvents.length} reservation{filteredEvents.length !== 1 ? "s" : ""})</span>
          }
        </h2>

        {eventsLoading ? (
          <div className="animate-pulse h-32 bg-muted rounded-xl" />
        ) : Object.keys(eventsByCourt).length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {selectedCourt
                ? `${selectedCourt} is free all day`
                : "No courts reserved on this day"
              }
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(eventsByCourt)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([court, courtEvents]) => (
                <Card key={court}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      {court}
                      <Badge variant="secondary" className="bg-red-100 text-red-800 text-xs ml-auto">
                        {courtEvents.length} booking{courtEvents.length !== 1 ? "s" : ""}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {courtEvents
                      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                      .map((event: any) => (
                        <div
                          key={event.id}
                          className={`border rounded-lg p-3 ${typeColor[event.event_type] || "bg-muted/50"}`}
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-sm">{event.title}</p>
                                <Badge variant="outline" className="text-xs capitalize border-current">
                                  {event.event_type}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {format(parseUTC(event.start_time), "h:mm a")} – {format(parseUTC(event.end_time), "h:mm a")}
                                </span>
                                {event.team && (
                                  <span className="flex items-center gap-1">
                                    <Trophy className="w-3 h-3" />
                                    {event.team.name}
                                  </span>
                                )}
                                {event.createdBy && (
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {event.createdBy.full_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>

      {/* Free courts today */}
      {courts.length > 0 && !selectedCourt && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Free courts on this day</h3>
          <div className="flex flex-wrap gap-2">
            {courts.filter(c => !bookedCourtsToday.has(c)).length === 0 ? (
              <p className="text-sm text-muted-foreground">All courts are reserved</p>
            ) : (
              courts.filter(c => !bookedCourtsToday.has(c)).map(c => (
                <Badge key={c} variant="secondary" className="bg-green-100 text-green-800">
                  <MapPin className="w-3 h-3 mr-1" />{c}
                </Badge>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
