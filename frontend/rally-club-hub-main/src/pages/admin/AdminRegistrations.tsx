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
import { Switch } from "@/components/ui/switch";
import { Plus, FileText, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function AdminRegistrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [newForm, setNewForm] = useState({ title: "", description: "", team_id: "", season: "", fee: "0", requires_waiver: false });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await api.teams.list()).data || [],
  });

  const { data: forms = [], isLoading: formsLoading } = useQuery({
    queryKey: ["reg-forms"],
    queryFn: async () => (await api.registrations.listForms()).data || [],
  });

  const { data: registrations = [], isLoading: regsLoading } = useQuery({
    queryKey: ["registrations"],
    queryFn: async () => (await api.registrations.list()).data || [],
  });

  const createFormMutation = useMutation({
    mutationFn: () =>
      api.registrations.createForm({
        ...newForm,
        team_id: Number(newForm.team_id),
        fee: parseFloat(newForm.fee) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reg-forms"] });
      toast({ title: "Registration form created" });
      setFormOpen(false);
      setNewForm({ title: "", description: "", team_id: "", season: "", fee: "0", requires_waiver: false });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.registrations.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registrations"] });
      toast({ title: "Status updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusColor: Record<string, string> = {
    approved: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    rejected: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registrations</h1>
          <p className="text-muted-foreground">Manage registration forms and submissions</p>
        </div>
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Form</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Registration Form</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div><Label>Title</Label><Input value={newForm.title} onChange={e => setNewForm(p => ({ ...p, title: e.target.value }))} /></div>
              <div><Label>Description</Label><Textarea value={newForm.description} onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))} /></div>
              <div>
                <Label>Team</Label>
                <Select value={newForm.team_id} onValueChange={v => setNewForm(p => ({ ...p, team_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                  <SelectContent>
                    {teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Season</Label><Input placeholder="e.g. Fall 2025" value={newForm.season} onChange={e => setNewForm(p => ({ ...p, season: e.target.value }))} /></div>
                <div><Label>Fee ($)</Label><Input type="number" value={newForm.fee} onChange={e => setNewForm(p => ({ ...p, fee: e.target.value }))} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={newForm.requires_waiver} onCheckedChange={v => setNewForm(p => ({ ...p, requires_waiver: v }))} />
                <Label>Requires Waiver</Label>
              </div>
            </div>
            <DialogFooter><Button onClick={() => createFormMutation.mutate()} disabled={createFormMutation.isPending}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="forms">
        <TabsList><TabsTrigger value="forms"><FileText className="w-4 h-4 mr-1" /> Forms</TabsTrigger><TabsTrigger value="submissions"><ClipboardList className="w-4 h-4 mr-1" /> Submissions</TabsTrigger></TabsList>

        <TabsContent value="forms" className="mt-4">
          {formsLoading ? <div className="animate-pulse h-32 bg-muted rounded-xl" /> : forms.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No registration forms yet</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {forms.map((form: any) => (
                <Card key={form.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-lg">
                      <span>{form.title}</span>
                      <Badge variant={form.is_active ? "default" : "secondary"}>{form.is_active ? "Active" : "Inactive"}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p className="text-muted-foreground">{form.description}</p>
                    <p>Season: {form.season || "—"}</p>
                    <p>Fee: ${form.fee?.toFixed(2) || "0.00"}</p>
                    <p>Waiver: {form.requires_waiver ? "Yes" : "No"}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="submissions" className="mt-4">
          {regsLoading ? <div className="animate-pulse h-32 bg-muted rounded-xl" /> : registrations.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No submissions yet</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="p-4">ID</th><th className="p-4">Player</th><th className="p-4">Form</th><th className="p-4">Submitted</th><th className="p-4">Status</th><th className="p-4">Actions</th>
                    </tr></thead>
                    <tbody>
                      {registrations.map((r: any) => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="p-4 text-sm">#{r.id}</td>
                          <td className="p-4 text-sm">{r.player?.full_name || `Player #${r.player_user_id}`}</td>
                          <td className="p-4 text-sm">{r.form?.title || `Form #${r.form_id}`}</td>
                          <td className="p-4 text-sm text-muted-foreground">{r.submitted_at ? format(parseUTC(r.submitted_at), "MMM d, yyyy") : "—"}</td>
                          <td className="p-4"><Badge variant="secondary" className={statusColor[r.status] || ""}>{r.status}</Badge></td>
                          <td className="p-4">
                            <Select value={r.status} onValueChange={status => statusMutation.mutate({ id: r.id, status })}>
                              <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
