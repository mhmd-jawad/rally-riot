import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Repeat, RefreshCw, Edit, CalendarOff, GraduationCap, Palmtree } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const typeColor: Record<string, string> = {
  practice: "bg-blue-100 text-blue-800",
  match: "bg-green-100 text-green-800",
  tryout: "bg-purple-100 text-purple-800",
  tournament: "bg-orange-100 text-orange-800",
};

const blockTypeColor: Record<string, string> = {
  holiday: "bg-orange-100 text-orange-800",
  exam: "bg-purple-100 text-purple-800",
};

export default function AdminEvents() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    team_id: "", event_type: "practice", title: "", description: "", court: "",
    start_time: "", end_time: "",
  });

  const [recurOpen, setRecurOpen] = useState(false);
  const [recurForm, setRecurForm] = useState({
    team_id: "", event_type: "practice", title: "", description: "", court: "",
    start_date: "", end_date: "",
    start_hour: "9", start_minute: "0", duration_minutes: "90",
    days_of_week: [] as number[],
  });

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({ label: "", block_type: "holiday", start_date: "", end_date: "" });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await api.teams.list()).data || [],
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["all-events"],
    queryFn: async () => (await api.events.list()).data || [],
    staleTime: 10_000,
  });

  const { data: blockedDates = [] } = useQuery({
    queryKey: ["blocked-dates"],
    queryFn: async () => (await api.blockedDates.list()).data || [],
  });

  const resetForm = () => {
    setForm({ team_id: "", event_type: "practice", title: "", description: "", court: "", start_time: "", end_time: "" });
    setEditing(null);
  };

  const resetRecurForm = () => {
    setRecurForm({ team_id: "", event_type: "practice", title: "", description: "", court: "", start_date: "", end_date: "", start_hour: "9", start_minute: "0", duration_minutes: "90", days_of_week: [] });
  };

  const createMutation = useMutation({
    mutationFn: () => api.events.create({ ...form, team_id: Number(form.team_id) }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["all-events"] });
      const displaced = res?.data?.displaced;
      if (displaced) {
        toast({
          title: "Event created — court reassigned",
          description: `'${displaced.displaced_event_title}' (priority ${displaced.displaced_priority}) was displaced. Your team has priority ${displaced.incoming_priority}.`,
        });
      } else {
        toast({ title: "Event created" });
      }
      setOpen(false); resetForm();
    },
    onError: (e: any) => toast({ title: "Conflict", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.events.update(editing.id, { ...form, team_id: Number(form.team_id) }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["all-events"] });
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
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.events.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-events"] }); toast({ title: "Event deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSeriesMutation = useMutation({
    mutationFn: (ruleId: number) => api.events.deleteRecurringSeries(ruleId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-events"] }); toast({ title: "Recurring series deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createRecurMutation = useMutation({
    mutationFn: () => api.events.createRecurring({
      team_id: Number(recurForm.team_id), event_type: recurForm.event_type,
      title: recurForm.title.trim(), description: recurForm.description || undefined,
      court: recurForm.court.trim(), start_date: recurForm.start_date, end_date: recurForm.end_date,
      days_of_week: recurForm.days_of_week, start_hour: Number(recurForm.start_hour),
      start_minute: Number(recurForm.start_minute), duration_minutes: Number(recurForm.duration_minutes),
    }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["all-events"] });
      const d = res.data;
      const skipped = d.conflicts_skipped?.length || 0;
      const blockedSkipped = d.conflicts_skipped?.filter((s: any) => s.reason?.type === "blocked").length || 0;
      toast({
        title: `Series created: ${d.events_created} event(s)`,
        description: skipped > 0
          ? `${skipped} occurrence(s) skipped (${blockedSkipped} on holidays/exams, ${skipped - blockedSkipped} conflicts).`
          : undefined,
      });
      setRecurOpen(false);
      resetRecurForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createBlockMutation = useMutation({
    mutationFn: () => api.blockedDates.create(blockForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocked-dates"] });
      toast({ title: "Blocked period added" });
      setBlockOpen(false);
      setBlockForm({ label: "", block_type: "holiday", start_date: "", end_date: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: number) => api.blockedDates.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["blocked-dates"] }); toast({ title: "Blocked period removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleEdit = (event: any) => {
    setEditing(event);
    setForm({ team_id: String(event.team_id), event_type: event.event_type, title: event.title, description: event.description || "", court: event.court || "", start_time: event.start_time?.slice(0, 16) || "", end_time: event.end_time?.slice(0, 16) || "" });
    setOpen(true);
  };

  const toggleDay = (d: number) => {
    setRecurForm(p => ({
      ...p,
      days_of_week: p.days_of_week.includes(d) ? p.days_of_week.filter(x => x !== d) : [...p.days_of_week, d],
    }));
  };

  const singleEvents = (events as any[]).filter(e => !e.recurring_rule_id);
  const recurringEvents = (events as any[]).filter(e => e.recurring_rule_id);
  const seriesMap = new Map<number, any[]>();
  for (const ev of recurringEvents) {
    const list = seriesMap.get(ev.recurring_rule_id) || [];
    list.push(ev);
    seriesMap.set(ev.recurring_rule_id, list);
  }

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-muted-foreground">{(events as any[]).length} total events</p>
        </div>
        <div className="flex gap-2">
          {/* Blocked dates dialog */}
          <Dialog open={blockOpen} onOpenChange={v => { setBlockOpen(v); if (!v) setBlockForm({ label: "", block_type: "holiday", start_date: "", end_date: "" }); }}>
            <DialogTrigger asChild>
              <Button variant="outline"><CalendarOff className="w-4 h-4 mr-2" /> Holidays & Exams</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Holidays & Exam Periods</DialogTitle></DialogHeader>
              <p className="text-xs text-muted-foreground -mt-2">Recurring practices will automatically skip dates within these periods.</p>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {(blockedDates as any[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No blocked periods defined</p>
                ) : (blockedDates as any[]).map((bd: any) => (
                  <div key={bd.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      {bd.block_type === "holiday"
                        ? <Palmtree className="w-4 h-4 text-orange-500" />
                        : <GraduationCap className="w-4 h-4 text-purple-500" />}
                      <span className="font-medium">{bd.label}</span>
                      <Badge variant="secondary" className={blockTypeColor[bd.block_type] || ""}>{bd.block_type}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <span>{bd.start_date} → {bd.end_date}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                        onClick={() => deleteBlockMutation.mutate(bd.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium">Add Period</p>
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input value={blockForm.label} onChange={e => setBlockForm(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Christmas Break" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select value={blockForm.block_type} onValueChange={v => setBlockForm(p => ({ ...p, block_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="holiday">Holiday</SelectItem>
                        <SelectItem value="exam">Exam Period</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Start Date</Label>
                    <Input type="date" value={blockForm.start_date} onChange={e => setBlockForm(p => ({ ...p, start_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">End Date</Label>
                    <Input type="date" value={blockForm.end_date} onChange={e => setBlockForm(p => ({ ...p, end_date: e.target.value }))} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createBlockMutation.mutate()}
                  disabled={createBlockMutation.isPending || !blockForm.label.trim() || !blockForm.start_date || !blockForm.end_date}>
                  Add Period
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Recurring series dialog */}
          <Dialog open={recurOpen} onOpenChange={v => { setRecurOpen(v); if (!v) resetRecurForm(); }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Repeat className="w-4 h-4 mr-2" /> Recurring Series</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Recurring Event Series</DialogTitle></DialogHeader>
              {(blockedDates as any[]).length > 0 && (
                <p className="text-xs text-muted-foreground -mt-1">
                  Occurrences on {(blockedDates as any[]).length} blocked period(s) will be skipped automatically.
                </p>
              )}
              <div className="space-y-4 py-4">
                <div><Label>Title</Label><Input value={recurForm.title} onChange={e => setRecurForm(p => ({ ...p, title: e.target.value }))} /></div>
                <div><Label>Description</Label><Textarea value={recurForm.description} onChange={e => setRecurForm(p => ({ ...p, description: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Team</Label>
                    <Select value={recurForm.team_id} onValueChange={v => setRecurForm(p => ({ ...p, team_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                      <SelectContent>{(teams as any[]).map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={recurForm.event_type} onValueChange={v => setRecurForm(p => ({ ...p, event_type: v }))}>
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
                <div><Label>Court</Label><Input placeholder="e.g. Court A" value={recurForm.court} onChange={e => setRecurForm(p => ({ ...p, court: e.target.value }))} /></div>
                <div>
                  <Label className="mb-2 block">Days of Week</Label>
                  <div className="flex gap-2 flex-wrap">
                    {DAY_LABELS.map((label, idx) => (
                      <button key={idx} type="button" onClick={() => toggleDay(idx)}
                        className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                          recurForm.days_of_week.includes(idx) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Start Date</Label><Input type="date" value={recurForm.start_date} onChange={e => setRecurForm(p => ({ ...p, start_date: e.target.value }))} /></div>
                  <div><Label>End Date</Label><Input type="date" value={recurForm.end_date} onChange={e => setRecurForm(p => ({ ...p, end_date: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div><Label>Start Hour</Label><Input type="number" min="0" max="23" value={recurForm.start_hour} onChange={e => setRecurForm(p => ({ ...p, start_hour: e.target.value }))} /></div>
                  <div>
                    <Label>Start Minute</Label>
                    <Select value={recurForm.start_minute} onValueChange={v => setRecurForm(p => ({ ...p, start_minute: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">:00</SelectItem>
                        <SelectItem value="15">:15</SelectItem>
                        <SelectItem value="30">:30</SelectItem>
                        <SelectItem value="45">:45</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Duration (min)</Label><Input type="number" min="15" step="15" value={recurForm.duration_minutes} onChange={e => setRecurForm(p => ({ ...p, duration_minutes: e.target.value }))} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createRecurMutation.mutate()}
                  disabled={createRecurMutation.isPending || !recurForm.team_id || !recurForm.title.trim() || !recurForm.court.trim() || !recurForm.start_date || !recurForm.end_date || recurForm.days_of_week.length === 0}>
                  {createRecurMutation.isPending ? "Creating…" : "Create Series"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* One-off event dialog */}
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> New Event</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Edit Event" : "Create Event"}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Team</Label>
                    <Select value={form.team_id} onValueChange={v => setForm(p => ({ ...p, team_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                      <SelectContent>{(teams as any[]).map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
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
                <div><Label>Court</Label><Input placeholder="e.g. Court A" value={form.court} onChange={e => setForm(p => ({ ...p, court: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Start Time</Label><Input type="datetime-local" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} /></div>
                  <div><Label>End Time</Label><Input type="datetime-local" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => editing ? updateMutation.mutate() : createMutation.mutate()} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editing ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Events ({(events as any[]).length})</TabsTrigger>
          <TabsTrigger value="series">Recurring Series ({seriesMap.size})</TabsTrigger>
          <TabsTrigger value="blocked">
            Holidays & Exams
            {(blockedDates as any[]).length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{(blockedDates as any[]).length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-3">
          {(events as any[]).length === 0 && <p className="text-muted-foreground text-center py-8">No events yet</p>}
          {(events as any[]).map((event: any) => (
            <Card key={event.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{event.title}</p>
                    <Badge variant="secondary" className={typeColor[event.event_type] || ""}>{event.event_type}</Badge>
                    {event.team && <Badge variant="outline">{event.team.name}</Badge>}
                    {event.recurring_rule_id && <Badge variant="outline" className="text-xs gap-1"><RefreshCw className="w-3 h-3" /> recurring</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {event.court} • {event.start_time ? format(parseUTC(event.start_time), "MMM d, h:mm a") : "—"} – {event.end_time ? format(parseUTC(event.end_time), "h:mm a") : "—"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!event.recurring_rule_id && <Button size="icon" variant="ghost" onClick={() => handleEdit(event)}><Edit className="w-4 h-4" /></Button>}
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(event.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="series" className="mt-4 space-y-4">
          {seriesMap.size === 0 && <p className="text-muted-foreground text-center py-8">No recurring series yet</p>}
          {Array.from(seriesMap.entries()).map(([ruleId, evs]) => {
            const first = evs[0];
            const sorted = [...evs].sort((a, b) => a.start_time.localeCompare(b.start_time));
            return (
              <Card key={ruleId}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-muted-foreground" />
                      <span>{first.title}</span>
                      <Badge variant="secondary" className={typeColor[first.event_type] || ""}>{first.event_type}</Badge>
                      {first.team && <Badge variant="outline">{first.team.name}</Badge>}
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => deleteSeriesMutation.mutate(ruleId)} disabled={deleteSeriesMutation.isPending}>
                      <Trash2 className="w-3 h-3 mr-1" /> Delete Entire Series
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p className="text-muted-foreground">{first.court} • {evs.length} occurrence(s)</p>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {sorted.map((ev: any) => (
                      <div key={ev.id} className="flex items-center justify-between rounded bg-muted/50 px-3 py-1.5">
                        <span>{format(parseUTC(ev.start_time), "EEE, MMM d • h:mm a")} – {format(parseUTC(ev.end_time), "h:mm a")}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteMutation.mutate(ev.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="blocked" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Recurring practices automatically skip these periods.</p>
            <Button size="sm" onClick={() => setBlockOpen(true)}><Plus className="w-3 h-3 mr-1" /> Add Period</Button>
          </div>
          {(blockedDates as any[]).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No holidays or exam periods defined</p>
          ) : (blockedDates as any[]).map((bd: any) => (
            <Card key={bd.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  {bd.block_type === "holiday"
                    ? <Palmtree className="w-5 h-5 text-orange-500" />
                    : <GraduationCap className="w-5 h-5 text-purple-500" />}
                  <div>
                    <p className="font-medium text-sm">{bd.label}</p>
                    <p className="text-xs text-muted-foreground">{bd.start_date} → {bd.end_date}</p>
                  </div>
                  <Badge variant="secondary" className={blockTypeColor[bd.block_type] || ""}>{bd.block_type}</Badge>
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteBlockMutation.mutate(bd.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
