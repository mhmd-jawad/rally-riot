import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PlayerRegistration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedForm, setSelectedForm] = useState("");

  const { data: forms = [] } = useQuery({
    queryKey: ["reg-forms"],
    queryFn: async () => (await api.registrations.listForms()).data || [],
  });

  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ["my-registrations"],
    queryFn: async () => (await api.registrations.list()).data || [],
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      api.registrations.submit({
        form_id: Number(selectedForm),
        player_user_id: user!.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["my-invoices"] });
      toast({ title: "Registration submitted!" });
      setSelectedForm("");
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
        <p className="text-muted-foreground">Register for available programs</p>
      </div>

      <Card>
        <CardHeader><CardTitle>New Registration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
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
          {activeForms.length === 0 && (
            <p className="text-sm text-muted-foreground">No active registration programs available right now.</p>
          )}
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={!selectedForm || submitMutation.isPending}
          >
            <FileText className="w-4 h-4 mr-2" /> Submit Registration
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>My Registrations</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="animate-pulse h-24 bg-muted rounded-xl" />
          ) : registrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No registrations yet</p>
          ) : (
            <div className="space-y-3">
              {registrations.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-muted-foreground" />
                    <p className="font-medium text-sm">{r.form?.title || `Form #${r.form_id}`}</p>
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
