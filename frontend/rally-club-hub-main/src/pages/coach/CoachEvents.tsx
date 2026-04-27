import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addWeeks } from "date-fns";

type ConflictInfo = { type: string; message: string; conflicting_event_id?: number } | null;

const TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const totalMinutes = 8 * 60 + i * 30;
  const h = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
});

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function splitDatetime(dt: string): { date: string; time: string } {
  if (!dt) return { date: "", time: "" };
  const [date, time] = dt.split("T");
  return { date: date || "", time: time?.slice(0, 5) || "" };
}

function joinDatetime(date: string, time: string): string {
  if (!date || !time) return "";
  return `${date}T${time}`;
}

export default function CoachEvents() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [conflict, setConflict] = useState<ConflictInfo>(null);
  // When isRecurring is true the same form fields are used — we derive the weekly series from start_date
  const [isRecurring, setIsRecurring] = useState(false);

  const [form, setForm] = useState({
    team_id: "", event_type: "practice", title: "", description: "", court: "",
    start_date: "", start_time: "", end_date: "", end_time: "",
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["my-teams"],
    queryFn: async () => (await api.teams.myTeams()).data || [],
  });

  const { data: courtsData } = useQuery({
    queryKey: ["courts"],
    queryFn: async () => (await api.events.courts()).data || {},
  });
  const allCourts: string[] = (courtsData as any)?.all || [];

  const { data: blockedDates = [] } = useQuery({
    queryKey: ["blocked-dates"],
    queryFn: async () => (await api.blockedDates.list()).data || [],
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["my-events"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
  });

  const resetForm = () => {
    setForm({ team_id: "", event_type: "practice", title: "", description: "", court: "", start_date: "", start_time: "", end_date: "", end_time: "" });
    setEditing(null);
    setConflict(null);
    setIsRecurring(false);
  };

  const getStartDatetime = () => joinDatetime(form.start_date, form.start_time);
  const getEndDatetime = () => joinDatetime(form.end_date, form.end_time);

  const formErrors = (): string[] => {
    const errs: string[] = [];
    if (!form.title.trim()) errs.push("Title is required.");
    if (!form.team_id) errs.push("Team is required.");
    if (!form.court) errs.push("Court is required.");
    if (!form.start_date || !form.start_time) errs.push("Start date and time are required.");
    if (!form.end_date || !form.end_time) errs.push("End date and time are required.");
    const start = getStartDatetime();
    const end = getEndDatetime();
    if (start && end && start >= end) errs.push("End time must be after start time.");
    return errs;
  };

  // Build the recurring API payload from the one-off form:
  // weekday derived from start_date, end_date = start_date + 4 weeks,
  // duration = diff between start_time and end_time in minutes.
  const buildRecurPayload = () => {
    const startDt = new Date(getStartDatetime());
    const endDt = new Date(getEndDatetime());
    // JS getDay(): 0=Sun,1=Mon,...6=Sat; backend uses 0=Mon,...6=Sun → convert
    const jsDay = startDt.getDay(); // 0=Sun
    const backendDay = jsDay === 0 ? 6 : jsDay - 1; // Sun→6, Mon→0, …
    const durationMinutes = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
    const fourWeeksLater = addWeeks(startDt, 3);
    const pad = (n: number) => String(n).padStart(2, "0");
    const endDate = `${fourWeeksLater.getFullYear()}-${pad(fourWeeksLater.getMonth() + 1)}-${pad(fourWeeksLater.getDate())}`;
    return {
      team_id: Number(form.team_id),
      event_type: form.event_type,
      title: form.title.trim(),
      description: form.description || undefined,
      court: form.court,
      start_date: form.start_date,
      end_date: endDate,
      days_of_week: [backendDay],
      start_hour: startDt.getHours(),
      start_minute: startDt.getMinutes(),
      duration_minutes: durationMinutes,
    };
  };

  const createMutation = useMutation({
    mutationFn: () => api.events.create({ ...form, team_id: Number(form.team_id), start_time: getStartDatetime(), end_time: getEndDatetime() }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      const displaced = res?.data?.displaced;
      if (displaced) {
        toast({
          title: "Event created — court reassigned",
          description: `'${displaced.displaced_event_title}' (priority ${displaced.displaced_priority}) was displaced from this slot to give your team (priority ${displaced.incoming_priority}) preferred scheduling.`,
        });
      } else {
        toast({ title: "Event created" });
      }
      setOpen(false); resetForm();
    },
    onError: (e: any) => {
      const data = e.data?.data;
      if (e.status === 409 && data?.type) setConflict({ type: data.type, message: data.message, conflicting_event_id: data.conflicting_event_id });
      else toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => api.events.update(editing.id, { ...form, team_id: Number(form.team_id), start_time: getStartDatetime(), end_time: getEndDatetime() }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      const displaced = res?.data?.displaced;
      if (displaced) {
        toast({
          title: "Event updated — court reassigned",
          description: `'${displaced.displaced_event_title}' (priority ${displaced.displaced_priority}) was displaced from this slot.`,
        });
      } else {
        toast({ title: "Event updated" });
      }
      setOpen(false); resetForm();
    },
    onError: (e: any) => {
      const data = e.data?.data;
      if (e.status === 409 && data?.type) setConflict({ type: data.type, message: data.message, conflicting_event_id: data.conflicting_event_id });
      else toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const createRecurMutation = useMutation({
    mutationFn: () => api.events.createRecurring(buildRecurPayload()),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      const d = res.data;
      const skipped = d.conflicts_skipped?.length || 0;
      const blockedSkipped = d.conflicts_skipped?.filter((s: any) => s.reason?.type === "blocked").length || 0;
      toast({
        title: `Weekly series created: ${d.events_created} session(s) over 4 weeks`,
        description: skipped > 0
          ? `${skipped} skipped (${blockedSkipped} fell on holidays/exams).`
          : "No sessions were skipped.",
      });
      setOpen(false); resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.events.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["my-events"] }); toast({ title: "Event deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSeriesMutation = useMutation({
    mutationFn: (ruleId: number) => api.events.deleteRecurringSeries(ruleId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["my-events"] }); toast({ title: "Series deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleEdit = (event: any) => {
    setEditing(event);
    setConflict(null);
    setIsRecurring(false);
    const start = splitDatetime(event.start_time?.slice(0, 16) || "");
    const end = splitDatetime(event.end_time?.slice(0, 16) || "");
    setForm({ team_id: String(event.team_id), event_type: event.event_type, title: event.title, description: event.description || "", court: event.court || "", start_date: start.date, start_time: start.time, end_date: end.date, end_time: end.time });
    setOpen(true);
  };

  const handleSubmit = () => {
    setConflict(null);
    const errs = formErrors();
    if (errs.length > 0) { toast({ title: "Validation error", description: errs[0], variant: "destructive" }); return; }
    if (isRecurring) { createRecurMutation.mutate(); return; }
    editing ? updateMutation.mutate() : createMutation.mutate();
  };

  const conflictLabel: Record<string, string> = { court: "Court conflict", team: "Team schedule conflict", coach: "Your schedule conflict" };
  const typeColor: Record<string, string> = { practice: "bg-blue-100 text-blue-800", match: "bg-green-100 text-green-800", tryout: "bg-purple-100 text-purple-800", tournament: "bg-orange-100 text-orange-800" };

  // Group recurring events by series for display
  const singleEvents = (events as any[]).filter((e: any) => !e.recurring_rule_id);
  const recurringEvents = (events as any[]).filter((e: any) => e.recurring_rule_id);
  const seriesMap = new Map<number, any[]>();
  for (const ev of recurringEvents) {
    const list = seriesMap.get(ev.recurring_rule_id) || [];
    list.push(ev);
    seriesMap.set(ev.recurring_rule_id, list);
  }

  const isPending = createMutation.isPending || updateMutation.isPending || createRecurMutation.isPending;

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-muted-foreground">{(events as any[]).length} events</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Event</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Edit Event" : "Create Event"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">

              {conflict && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-semibold">{conflictLabel[conflict.type] || "Scheduling conflict"}</p>
                    <p className="text-sm mt-1">{conflict.message}</p>
                    {conflict.type === "court" && <p className="text-xs mt-1 opacity-75">Try a different court or time slot.</p>}
                  </AlertDescription>
                </Alert>
              )}

              {/* Recurring toggle — only for new events, not edits */}
              {!editing && (
                <div className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-muted/30">
                  <Switch id="recurring-toggle" checked={isRecurring} onCheckedChange={v => { setIsRecurring(v); setConflict(null); }} />
                  <div className="flex-1">
                    <Label htmlFor="recurring-toggle" className="cursor-pointer flex items-center gap-1 font-medium">
                      <RefreshCw className="w-3.5 h-3.5" /> Repeat weekly for 4 weeks
                    </Label>
                    {isRecurring && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Creates one session per week on the same weekday as the start date.
                        {(blockedDates as any[]).length > 0 && " Sessions on holidays/exam periods are skipped automatically."}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── UNIFIED FORM FIELDS (same for one-off and recurring) ── */}
              <div><Label>Title <span className="text-destructive">*</span></Label><Input value={form.title} onChange={e => { setForm(p => ({ ...p, title: e.target.value })); setConflict(null); }} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Team <span className="text-destructive">*</span></Label>
                  <Select value={form.team_id} onValueChange={v => { setForm(p => ({ ...p, team_id: v })); setConflict(null); }}>
                    <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                    <SelectContent>{(teams as any[]).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.event_type} onValueChange={v => setForm(p => ({ ...p, event_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="practice">Practice</SelectItem>
                      <SelectItem value="match">Match</SelectItem>
                      <SelectItem value="tryout">Tryout</SelectItem>
                      <SelectItem value="tournament">Tournament</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Court <span className="text-destructive">*</span></Label>
                <Select value={form.court} onValueChange={v => { setForm(p => ({ ...p, court: v })); setConflict(null); }}>
                  <SelectTrigger className={conflict?.type === "court" ? "border-destructive" : ""}><SelectValue placeholder="Select court" /></SelectTrigger>
                  <SelectContent>
                    {allCourts.length === 0 && <SelectItem value="_none" disabled>No courts available yet</SelectItem>}
                    {allCourts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Start Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={form.start_date} onChange={e => { setForm(p => ({ ...p, start_date: e.target.value, end_date: p.end_date || e.target.value })); setConflict(null); }} className={conflict?.type === "team" || conflict?.type === "coach" ? "border-destructive" : ""} />
                  <Label>Start Time <span className="text-destructive">*</span></Label>
                  <Select value={form.start_time} onValueChange={v => { setForm(p => ({ ...p, start_time: v })); setConflict(null); }}>
                    <SelectTrigger className={conflict?.type === "team" || conflict?.type === "coach" ? "border-destructive" : ""}><SelectValue placeholder="HH:MM" /></SelectTrigger>
                    <SelectContent>{TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{isRecurring ? "End Date (first session)" : "End Date"} <span className="text-destructive">*</span></Label>
                  <Input type="date" value={form.end_date} onChange={e => { setForm(p => ({ ...p, end_date: e.target.value })); setConflict(null); }} className={conflict?.type === "team" || conflict?.type === "coach" ? "border-destructive" : ""} />
                  <Label>End Time <span className="text-destructive">*</span></Label>
                  <Select value={form.end_time} onValueChange={v => { setForm(p => ({ ...p, end_time: v })); setConflict(null); }}>
                    <SelectTrigger className={conflict?.type === "team" || conflict?.type === "coach" ? "border-destructive" : ""}><SelectValue placeholder="HH:MM" /></SelectTrigger>
                    <SelectContent>{TIME_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending ? "Saving…" : isRecurring ? "Create Series" : editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* One-off events */}
      <div className="space-y-4">
        {singleEvents.length === 0 && seriesMap.size === 0 && <p className="text-muted-foreground text-center py-8">No events yet</p>}
        {singleEvents.map((event: any) => (
          <Card key={event.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{event.title}</p>
                  <Badge variant="secondary" className={typeColor[event.event_type] || ""}>{event.event_type}</Badge>
                  {event.team && <Badge variant="outline" className="text-xs">{event.team.name}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {event.court || "TBD"} • {event.start_time ? format(parseUTC(event.start_time), "MMM d, h:mm a") : "—"} – {event.end_time ? format(parseUTC(event.end_time), "h:mm a") : "—"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="icon" variant="ghost" onClick={() => handleEdit(event)}><Edit className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(event.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Recurring series groups */}
        {Array.from(seriesMap.entries()).map(([ruleId, evs]) => {
          const first = evs[0];
          const sorted = [...evs].sort((a, b) => a.start_time.localeCompare(b.start_time));
          const upcoming = sorted.filter((e: any) => parseUTC(e.start_time) >= new Date());
          return (
            <Card key={ruleId} className="border-blue-200 bg-blue-50/10">
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <RefreshCw className="w-4 h-4 text-blue-500" />
                    <p className="font-medium">{first.title}</p>
                    <Badge variant="secondary" className={typeColor[first.event_type] || ""}>{first.event_type}</Badge>
                    {first.team && <Badge variant="outline" className="text-xs">{first.team.name}</Badge>}
                    <Badge variant="outline" className="text-xs text-blue-600">{evs.length} sessions</Badge>
                  </div>
                  <Button size="sm" variant="outline" className="text-destructive border-destructive/40 h-7 text-xs"
                    onClick={() => deleteSeriesMutation.mutate(ruleId)} disabled={deleteSeriesMutation.isPending}>
                    <Trash2 className="w-3 h-3 mr-1" /> Delete series
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{first.court || "TBD"} • {upcoming.length} upcoming</p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {sorted.slice(0, 5).map((ev: any) => (
                    <div key={ev.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
                      <span>{format(parseUTC(ev.start_time), "EEE, MMM d • h:mm a")}</span>
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => deleteMutation.mutate(ev.id)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {sorted.length > 5 && <p className="text-xs text-muted-foreground px-2">…and {sorted.length - 5} more</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
