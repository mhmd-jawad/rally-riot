import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function ParentPayments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await api.invoices.list()).data,
  });

  const payMutation = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) => api.invoices.pay(id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Payment recorded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  const invoices = data?.invoices || [];
  const unpaid = invoices.filter((i: any) => i.status !== "paid");
  const paid = invoices.filter((i: any) => i.status === "paid");

  const statusColor: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    unpaid: "bg-red-100 text-red-800",
    partial: "bg-yellow-100 text-yellow-800",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-muted-foreground">View and pay invoices</p>
      </div>

      {unpaid.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Outstanding ({unpaid.length})</h2>
          <div className="space-y-4">
            {unpaid.map((inv: any) => {
              const remaining = inv.amount - inv.amount_paid;
              return (
                <Card key={inv.id}>
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                        <p className="font-medium">Invoice #{inv.id}</p>
                        <Badge variant="secondary" className={statusColor[inv.status] || ""}>{inv.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {inv.player?.full_name} • Total: ${inv.amount.toFixed(2)} • Paid: ${inv.amount_paid.toFixed(2)} • Due: ${remaining.toFixed(2)}
                      </p>
                      {inv.due_date && <p className="text-xs text-muted-foreground">Due by {format(new Date(inv.due_date), "MMM d, yyyy")}</p>}
                    </div>
                    <Button onClick={() => payMutation.mutate({ id: inv.id, amount: remaining })} disabled={payMutation.isPending}>
                      <CreditCard className="w-4 h-4 mr-2" /> Pay ${remaining.toFixed(2)}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {paid.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Paid ({paid.length})</h2>
          <div className="space-y-2 opacity-60">
            {paid.map((inv: any) => (
              <Card key={inv.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    <p className="text-sm font-medium">Invoice #{inv.id} — ${inv.amount.toFixed(2)}</p>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">paid</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {invoices.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No invoices yet</p>
      )}
    </div>
  );
}
