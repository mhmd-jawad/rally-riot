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
import { Plus, Megaphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function CoachAnnouncements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", team_id: "", priority: "normal" });

  const { data: teams = [] } = useQuery({
    queryKey: ["my-teams"],
    queryFn: async () => (await api.teams.myTeams()).data || [],
  });

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["my-announcements"],
    queryFn: async () => (await api.announcements.list()).data || [],
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: () => api.announcements.create({ ...form, team_id: Number(form.team_id) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-announcements"] });
      toast({ title: "Announcement posted" });
      setOpen(false);
      setForm({ title: "", message: "", team_id: "", priority: "normal" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const priorityColor: Record<string, string> = {
    high: "bg-red-100 text-red-800",
    normal: "bg-blue-100 text-blue-800",
    low: "bg-gray-100 text-gray-800",
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-muted-foreground">{announcements.length} announcements</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Announcement</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Post Announcement</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
              <div><Label>Message</Label><Textarea rows={4} value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} /></div>
              <div>
                <Label>Team</Label>
                <Select value={form.team_id} onValueChange={v => setForm(p => ({ ...p, team_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                  <SelectContent>{teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Post</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {announcements.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No announcements yet</p>
        ) : announcements.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-muted-foreground" />
                    <p className="font-medium">{a.title}</p>
                    <Badge variant="secondary" className={priorityColor[a.priority] || ""}>{a.priority}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{a.message}</p>
                  <p className="text-xs text-muted-foreground">{a.team?.name} • {format(parseUTC(a.created_at), "MMM d, yyyy h:mm a")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
