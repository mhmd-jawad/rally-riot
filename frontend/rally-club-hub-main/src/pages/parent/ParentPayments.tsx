import { parseUTC } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CreditCard, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState } from "react";

function InstallmentBreakdown({ invoiceId }: { invoiceId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: plan, isLoading } = useQuery({
    queryKey: ["installments", invoiceId],
    queryFn: async () => (await api.invoices.getInstallments(invoiceId)).data,
  });

  const payInstallment = useMutation({
    mutationFn: (paymentId: number) => api.invoices.payInstallment(paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installments", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Installment paid" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="animate-pulse h-8 bg-muted rounded mt-2" />;
  if (!plan) return null;

  const payments: any[] = plan.payments || [];

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Installment Plan ({payments.length} payments)
      </p>
      {payments.map((p: any) => (
        <div key={p.id} className="flex items-center justify-between text-sm rounded bg-muted/50 px-3 py-2">
          <div>
            <span className="font-medium">${p.amount.toFixed(2)}</span>
            <span className="text-muted-foreground ml-2">due {format(parseUTC(p.due_date), "MMM d, yyyy")}</span>
          </div>
          {p.status === "paid" ? (
            <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">paid</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => payInstallment.mutate(p.id)}
              disabled={payInstallment.isPending}
            >
              Pay
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function InvoiceCard({ inv }: { inv: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInstallments, setShowInstallments] = useState(false);

  const payMutation = useMutation({
    mutationFn: () => api.invoices.pay(inv.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Payment recorded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remaining = inv.amount - inv.amount_paid;
  const hasInstallments = inv.has_installment_plan;

  const statusColor: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    unpaid: "bg-red-100 text-red-800",
    partial: "bg-yellow-100 text-yellow-800",
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <p className="font-medium">Invoice #{inv.id}</p>
              <Badge variant="secondary" className={statusColor[inv.status] || ""}>{inv.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {inv.player?.full_name} • Total: ${inv.amount.toFixed(2)} • Paid: ${inv.amount_paid.toFixed(2)} • Due: ${remaining.toFixed(2)}
            </p>
            {inv.due_date && <p className="text-xs text-muted-foreground">Due by {format(parseUTC(inv.due_date), "MMM d, yyyy")}</p>}
          </div>
          <div className="flex items-center gap-2">
            {hasInstallments ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInstallments(v => !v)}
              >
                {showInstallments ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                Installments
              </Button>
            ) : (
              <Button onClick={() => payMutation.mutate()} disabled={payMutation.isPending}>
                <CreditCard className="w-4 h-4 mr-2" /> Pay ${remaining.toFixed(2)}
              </Button>
            )}
          </div>
        </div>
        {showInstallments && <InstallmentBreakdown invoiceId={inv.id} />}
      </CardContent>
    </Card>
  );
}

export default function ParentPayments() {
  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await api.invoices.list()).data,
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  const invoices = data?.invoices || [];
  const unpaid = invoices.filter((i: any) => i.status !== "paid");
  const paid = invoices.filter((i: any) => i.status === "paid");

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
            {unpaid.map((inv: any) => <InvoiceCard key={inv.id} inv={inv} />)}
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
