import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ParentRegistration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedForm, setSelectedForm] = useState("");
  const [selectedChild, setSelectedChild] = useState("");

  const { data: children = [] } = useQuery({
    queryKey: ["my-children"],
    queryFn: async () => (await api.parentChild.list()).data || [],
  });

  const { data: forms = [] } = useQuery({
    queryKey: ["reg-forms"],
    queryFn: async () => (await api.registrations.listForms()).data || [],
  });

  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ["registrations"],
    queryFn: async () => (await api.registrations.list()).data || [],
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api.registrations.submit({
        form_id: Number(selectedForm),
        player_user_id: Number(selectedChild),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registrations"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Registration submitted! Invoice has been generated." });
      setSelectedForm("");
      setSelectedChild("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activeForms = forms.filter((f: any) => f.is_active);

  const statusColor: Record<string, string> = {
    approved: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    rejected: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Registration</h1>
        <p className="text-muted-foreground">Register your child for programs</p>
      </div>

      <Card>
        <CardHeader><CardTitle>New Registration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Select Program</label>
              <Select value={selectedForm} onValueChange={setSelectedForm}>
                <SelectTrigger><SelectValue placeholder="Choose a program" /></SelectTrigger>
                <SelectContent>
                  {activeForms.map((f: any) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.title} {f.fee > 0 ? `($${f.fee.toFixed(2)})` : "(Free)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Select Child</label>
              <Select value={selectedChild} onValueChange={setSelectedChild}>
                <SelectTrigger><SelectValue placeholder="Choose a child" /></SelectTrigger>
                <SelectContent>
                  {children.map((c: any) => (
                    <SelectItem key={c.child_user_id} value={String(c.child_user_id)}>
                      {c.child?.full_name || `Child #${c.child_user_id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={!selectedForm || !selectedChild || submitMutation.isPending}
          >
            <FileText className="w-4 h-4 mr-2" /> Submit Registration
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>My Registrations</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="animate-pulse h-32 bg-muted rounded-xl" /> : registrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No registrations yet</p>
          ) : (
            <div className="space-y-3">
              {registrations.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{r.form?.title || `Form #${r.form_id}`}</p>
                      <p className="text-xs text-muted-foreground">{r.player?.full_name || `Player #${r.player_user_id}`}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className={statusColor[r.status] || ""}>{r.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
