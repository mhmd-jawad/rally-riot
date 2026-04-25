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
import { Plus, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function CoachEvents() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
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
  };

  const createMutation = useMutation({
    mutationFn: () => api.events.create({ ...form, team_id: Number(form.team_id) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      toast({ title: "Event created" });
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: "Scheduling conflict", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.events.update(editing.id, { ...form, team_id: Number(form.team_id) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      toast({ title: "Event updated" });
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
          <p className="text-muted-foreground">{events.length} events</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
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
                    <SelectContent>{teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
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
              <Button
                onClick={() => editing ? updateMutation.mutate() : createMutation.mutate()}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {events.map((event: any) => (
          <Card key={event.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{event.title}</p>
                  <Badge variant="secondary" className={typeColor[event.event_type] || ""}>{event.event_type}</Badge>
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
