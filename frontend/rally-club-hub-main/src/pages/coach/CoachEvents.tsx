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
import { Plus, Edit, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type ConflictInfo = { type: string; message: string; conflicting_event_id?: number } | null;

export default function CoachEvents() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [conflict, setConflict] = useState<ConflictInfo>(null);
  const [form, setForm] = useState({
    team_id: "", event_type: "practice", title: "", description: "", court: "",
    start_time: "", end_time: "",
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await api.teams.list()).data || [],
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["my-events"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
  });

  const resetForm = () => {
    setForm({ team_id: "", event_type: "practice", title: "", description: "", court: "", start_time: "", end_time: "" });
    setEditing(null);
    setConflict(null);
  };

  const formErrors = (): string[] => {
    const errs: string[] = [];
    if (!form.title.trim()) errs.push("Title is required.");
    if (!form.team_id) errs.push("Team is required.");
    if (!form.court.trim()) errs.push("Court is required.");
    if (!form.start_time) errs.push("Start time is required.");
    if (!form.end_time) errs.push("End time is required.");
    if (form.start_time && form.end_time && form.start_time >= form.end_time)
      errs.push("End time must be after start time.");
    return errs;
  };

  const createMutation = useMutation({
    mutationFn: () => api.events.create({ ...form, team_id: Number(form.team_id) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      toast({ title: "Event created" });
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => {
      const data = e.data?.data;
      if (e.status === 409 && data?.type) {
        setConflict({ type: data.type, message: data.message, conflicting_event_id: data.conflicting_event_id });
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => api.events.update(editing.id, { ...form, team_id: Number(form.team_id) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      toast({ title: "Event updated" });
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => {
      const data = e.data?.data;
      if (e.status === 409 && data?.type) {
        setConflict({ type: data.type, message: data.message, conflicting_event_id: data.conflicting_event_id });
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.events.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      toast({ title: "Event deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleEdit = (event: any) => {
    setEditing(event);
    setConflict(null);
    setForm({
      team_id: String(event.team_id),
      event_type: event.event_type,
      title: event.title,
      description: event.description || "",
      court: event.court || "",
      start_time: event.start_time?.slice(0, 16) || "",
      end_time: event.end_time?.slice(0, 16) || "",
    });
    setOpen(true);
  };

  const handleSubmit = () => {
    setConflict(null);
    const errs = formErrors();
    if (errs.length > 0) {
      toast({ title: "Validation error", description: errs[0], variant: "destructive" });
      return;
    }
    editing ? updateMutation.mutate() : createMutation.mutate();
  };

  const conflictLabel: Record<string, string> = {
    court: "Court conflict",
    team: "Team schedule conflict",
    coach: "Your schedule conflict",
  };

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
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-muted-foreground">{(events as any[]).length} events</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Event</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "Edit Event" : "Create Event"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">

              {conflict && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-semibold">{conflictLabel[conflict.type] || "Scheduling conflict"}</p>
                    <p className="text-sm mt-1">{conflict.message}</p>
                    {conflict.type === "court" && (
                      <p className="text-xs mt-1 opacity-75">Try a different court or choose a different time slot.</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

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
                <Input
                  placeholder="e.g. Court A"
                  value={form.court}
                  onChange={e => { setForm(p => ({ ...p, court: e.target.value })); setConflict(null); }}
                  className={conflict?.type === "court" ? "border-destructive" : ""}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time <span className="text-destructive">*</span></Label>
                  <Input
                    type="datetime-local"
                    value={form.start_time}
                    onChange={e => { setForm(p => ({ ...p, start_time: e.target.value })); setConflict(null); }}
                    className={conflict?.type === "team" || conflict?.type === "coach" ? "border-destructive" : ""}
                  />
                </div>
                <div>
                  <Label>End Time <span className="text-destructive">*</span></Label>
                  <Input
                    type="datetime-local"
                    value={form.end_time}
                    onChange={e => { setForm(p => ({ ...p, end_time: e.target.value })); setConflict(null); }}
                    className={conflict?.type === "team" || conflict?.type === "coach" ? "border-destructive" : ""}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {(events as any[]).length === 0 && <p className="text-muted-foreground text-center py-8">No events yet</p>}
        {(events as any[]).map((event: any) => (
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
      </div>
    </div>
  );
}
