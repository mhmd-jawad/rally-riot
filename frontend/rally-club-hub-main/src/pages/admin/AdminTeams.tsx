import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, UserPlus, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminTeams() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [teamOpen, setTeamOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<{ teamId: number; type: "coach" | "player" } | null>(null);
  const [newTeam, setNewTeam] = useState({ name: "", age_group: "", skill_level: "", priority_level: "1" });
  const [selectedUserId, setSelectedUserId] = useState("");

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await api.teams.list()).data || [],
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.users.list()).data || [],
  });

  const createMutation = useMutation({
    mutationFn: () => api.teams.create({ ...newTeam, priority_level: Number(newTeam.priority_level) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast({ title: "Team created" });
      setTeamOpen(false);
      setNewTeam({ name: "", age_group: "", skill_level: "", priority_level: "1" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const priorityMutation = useMutation({
    mutationFn: ({ teamId, level }: { teamId: number; level: number }) => api.teams.setPriority(teamId, level),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast({ title: "Priority updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const assignCoachMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) => api.teams.assignCoach(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast({ title: "Coach assigned" });
      setAssignOpen(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const assignPlayerMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) => api.teams.assignPlayer(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast({ title: "Player assigned" });
      setAssignOpen(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const coaches = users.filter((u: any) => u.role === "coach");
  const players = users.filter((u: any) => u.role === "player");

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-muted-foreground">{teams.length} teams</p>
        </div>
        <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Create Team</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Team</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div><Label>Name</Label><Input value={newTeam.name} onChange={e => setNewTeam(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>Age Group</Label><Input placeholder="e.g. U12" value={newTeam.age_group} onChange={e => setNewTeam(p => ({ ...p, age_group: e.target.value }))} /></div>
              <div><Label>Skill Level</Label><Input placeholder="e.g. Intermediate" value={newTeam.skill_level} onChange={e => setNewTeam(p => ({ ...p, skill_level: e.target.value }))} /></div>
              <div>
                <Label>Priority Level (1 = lowest, 5 = highest)</Label>
                <Select value={newTeam.priority_level} onValueChange={v => setNewTeam(p => ({ ...p, priority_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {teams.map((team: any) => (
          <Card key={team.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{team.name}</span>
                <div className="flex gap-2 items-center">
                  {team.age_group && <Badge variant="outline">{team.age_group}</Badge>}
                  {team.skill_level && <Badge variant="outline">{team.skill_level}</Badge>}
                  <div className="flex items-center gap-1 ml-1">
                    <Star className="w-3 h-3 text-yellow-500" />
                    <Select
                      value={String(team.priority_level ?? 1)}
                      onValueChange={v => priorityMutation.mutate({ teamId: team.id, level: Number(v) })}
                    >
                      <SelectTrigger className="h-7 w-14 text-xs px-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Coaches</h4>
                  <Button size="sm" variant="outline" onClick={() => { setAssignOpen({ teamId: team.id, type: "coach" }); setSelectedUserId(""); }}>
                    <UserPlus className="w-3 h-3 mr-1" /> Assign
                  </Button>
                </div>
                {team.coaches?.length > 0 ? (
                  <div className="space-y-1">{team.coaches.map((c: any) => <p key={c.id} className="text-sm text-muted-foreground">{c.full_name}</p>)}</div>
                ) : <p className="text-sm text-muted-foreground italic">No coaches assigned</p>}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Players ({team.players?.length || 0})</h4>
                  <Button size="sm" variant="outline" onClick={() => { setAssignOpen({ teamId: team.id, type: "player" }); setSelectedUserId(""); }}>
                    <Users className="w-3 h-3 mr-1" /> Assign
                  </Button>
                </div>
                {team.players?.length > 0 ? (
                  <div className="flex flex-wrap gap-1">{team.players.map((p: any) => <Badge key={p.id} variant="secondary">{p.full_name}</Badge>)}</div>
                ) : <p className="text-sm text-muted-foreground italic">No players assigned</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!assignOpen} onOpenChange={() => setAssignOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign {assignOpen?.type === "coach" ? "Coach" : "Player"}</DialogTitle></DialogHeader>
          <div className="py-4">
            <Label>Select {assignOpen?.type === "coach" ? "Coach" : "Player"}</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
              <SelectContent>
                {(assignOpen?.type === "coach" ? coaches : players).map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.full_name} ({u.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              disabled={!selectedUserId}
              onClick={() => {
                if (!assignOpen || !selectedUserId) return;
                const payload = { teamId: assignOpen.teamId, userId: Number(selectedUserId) };
                if (assignOpen.type === "coach") assignCoachMutation.mutate(payload);
                else assignPlayerMutation.mutate(payload);
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
