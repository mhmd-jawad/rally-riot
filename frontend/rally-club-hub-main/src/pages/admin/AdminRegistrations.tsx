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
import { Plus, FileText, ClipboardList, Tag, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// Predefined discount presets: { label, discount_type, value }
const DISCOUNT_PRESETS = [
  { label: "Sibling discount",      discount_type: "percentage", value: 10 },
  { label: "Early-bird registration", discount_type: "percentage", value: 15 },
  { label: "Financial aid",         discount_type: "percentage", value: 25 },
  { label: "Full scholarship",      discount_type: "percentage", value: 100 },
  { label: "Referral bonus",        discount_type: "fixed",      value: 20 },
  { label: "Staff / coach family",  discount_type: "percentage", value: 50 },
  { label: "Multi-season loyalty",  discount_type: "percentage", value: 10 },
  { label: "Custom",                discount_type: "percentage", value: 0 },
];

function DiscountManager({ form }: { form: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customType, setCustomType] = useState("percentage");
  const [customValue, setCustomValue] = useState("");
  const [targetUserId, setTargetUserId] = useState("all");

  const preset = DISCOUNT_PRESETS.find(p => p.label === selectedPreset);
  const isCustom = selectedPreset === "Custom";

  const { data: discounts = [] } = useQuery({
    queryKey: ["discounts", form.id],
    queryFn: async () => (await api.invoices.listDiscounts(form.id)).data || [],
    enabled: open,
  });

  const { data: teamDetails } = useQuery({
    queryKey: ["team", form.team_id],
    queryFn: async () => (await api.teams.get(form.team_id)).data,
    enabled: open && !!form.team_id,
  });
  const teamPlayers = (teamDetails?.players || []) as any[];

  const createMutation = useMutation({
    mutationFn: () => {
      const label = isCustom ? customLabel.trim() : selectedPreset;
      const discountType = isCustom ? customType : (preset?.discount_type || "percentage");
      const value = isCustom ? parseFloat(customValue) : (preset?.value || 0);
      return api.invoices.createDiscount({
        form_id: form.id,
        label,
        discount_type: discountType,
        value,
        ...(targetUserId !== "all" ? { target_user_id: Number(targetUserId) } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discounts", form.id] });
      toast({ title: "Discount added" });
      setSelectedPreset("");
      setCustomLabel(""); setCustomValue(""); setCustomType("percentage");
      setTargetUserId("all");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.invoices.deleteDiscount(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["discounts", form.id] }); toast({ title: "Discount removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canAdd = selectedPreset && (isCustom ? (customLabel.trim() && customValue) : true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="mt-2 w-full">
          <Tag className="w-3 h-3 mr-1" /> Manage Discounts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Discounts — {form.title}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {discounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">No discounts defined</p>
          ) : (
            <div className="space-y-2">
              {discounts.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{d.label}</span>
                    <p className="text-xs text-muted-foreground">
                      Applies to: {d.target_user?.full_name || "All players"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {d.discount_type === "percentage" ? `${d.value}%` : `$${d.value.toFixed(2)}`}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                      onClick={() => deleteMutation.mutate(d.id)} disabled={deleteMutation.isPending}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Add Discount</p>
            <div>
              <Label className="text-xs">Reason / Preset</Label>
              <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                <SelectTrigger><SelectValue placeholder="Select discount reason…" /></SelectTrigger>
                <SelectContent>
                  {DISCOUNT_PRESETS.map(p => (
                    <SelectItem key={p.label} value={p.label}>
                      <span>{p.label}</span>
                      {p.value > 0 && (
                        <span className="ml-2 text-muted-foreground text-xs">
                          ({p.discount_type === "percentage" ? `${p.value}% off` : `$${p.value} off`})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPreset && !isCustom && preset && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                Will apply: <strong>{preset.discount_type === "percentage" ? `${preset.value}%` : `$${preset.value}`} off</strong>
              </p>
            )}
            {isCustom && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="Describe the discount" />
                </div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={customType} onValueChange={setCustomType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Value</Label>
                  <Input type="number" min="0" value={customValue} onChange={e => setCustomValue(e.target.value)} placeholder={customType === "percentage" ? "e.g. 10" : "e.g. 25"} />
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">Apply To</Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All players in this program</SelectItem>
                  {teamPlayers.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !canAdd}>
            Add Discount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
                <div>
                  <Label>Season</Label>
                  <Select value={newForm.season} onValueChange={v => setNewForm(p => ({ ...p, season: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select season" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fall 2025">Fall 2025</SelectItem>
                      <SelectItem value="Winter 2025">Winter 2025</SelectItem>
                      <SelectItem value="Spring 2026">Spring 2026</SelectItem>
                      <SelectItem value="Summer 2026">Summer 2026</SelectItem>
                      <SelectItem value="Fall 2026">Fall 2026</SelectItem>
                      <SelectItem value="Winter 2026">Winter 2026</SelectItem>
                      <SelectItem value="Year-Round">Year-Round</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fee ($)</Label>
                  <Select value={newForm.fee} onValueChange={v => setNewForm(p => ({ ...p, fee: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select fee" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Free</SelectItem>
                      <SelectItem value="50">$50</SelectItem>
                      <SelectItem value="100">$100</SelectItem>
                      <SelectItem value="150">$150</SelectItem>
                      <SelectItem value="200">$200</SelectItem>
                      <SelectItem value="250">$250</SelectItem>
                      <SelectItem value="300">$300</SelectItem>
                      <SelectItem value="400">$400</SelectItem>
                      <SelectItem value="500">$500</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                    <DiscountManager form={form} />
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
