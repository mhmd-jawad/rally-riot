import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CreditCard, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, Clock, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, isPast, parseISO } from "date-fns";

function isOverdue(inv: any): boolean {
  return inv.status !== "paid" && !!inv.due_date && isPast(parseISO(inv.due_date));
}

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
      queryClient.invalidateQueries({ queryKey: ["my-invoices"] });
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
      {payments.map((p: any) => {
        const installmentOverdue = p.status !== "paid" && isPast(parseISO(p.due_date));
        return (
          <div
            key={p.id}
            className={`flex items-center justify-between text-sm rounded px-3 py-2 ${
              installmentOverdue ? "bg-red-50 border border-red-200" : "bg-muted/50"
            }`}
          >
            <div>
              <span className="font-medium">${p.amount.toFixed(2)}</span>
              <span className={`ml-2 ${installmentOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                due {format(parseISO(p.due_date), "MMM d, yyyy")}
                {installmentOverdue && " — OVERDUE"}
              </span>
            </div>
            {p.status === "paid" ? (
              <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">paid</Badge>
            ) : (
              <Button
                size="sm"
                variant={installmentOverdue ? "destructive" : "outline"}
                className="h-7 text-xs"
                onClick={() => payInstallment.mutate(p.id)}
                disabled={payInstallment.isPending}
              >
                Pay
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InvoiceCard({ inv }: { inv: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInstallments, setShowInstallments] = useState(false);
  const overdue = isOverdue(inv);

  const payMutation = useMutation({
    mutationFn: () => api.invoices.pay(inv.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-invoices"] });
      toast({ title: "Payment recorded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remaining = inv.amount - inv.amount_paid;
  const hasInstallments = inv.has_installment_plan;

  const statusColor: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    unpaid: overdue ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800",
    partial: "bg-yellow-100 text-yellow-800",
  };

  return (
    <Card className={overdue ? "border-red-300 bg-red-50/30" : ""}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {overdue && <AlertTriangle className="w-4 h-4 text-red-500" />}
              <DollarSign className={`w-4 h-4 ${overdue ? "text-red-500" : "text-muted-foreground"}`} />
              <p className="font-medium">Invoice #{inv.id}</p>
              <Badge variant="secondary" className={statusColor[inv.status] || ""}>
                {overdue ? "overdue" : inv.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Total: ${inv.amount.toFixed(2)} • Paid: ${inv.amount_paid.toFixed(2)} • Due: ${remaining.toFixed(2)}
            </p>
            {inv.due_date && (
              <p className={`text-xs ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                {overdue ? "Was due" : "Due by"} {format(parseISO(inv.due_date), "MMM d, yyyy")}
                {overdue && " — please pay as soon as possible"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {hasInstallments ? (
              <Button variant="outline" size="sm" onClick={() => setShowInstallments(v => !v)}>
                {showInstallments ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                Installments
              </Button>
            ) : (
              <Button
                variant={overdue ? "destructive" : "default"}
                onClick={() => payMutation.mutate()}
                disabled={payMutation.isPending}
              >
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

export default function PlayerPayments() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-invoices"],
    queryFn: async () => (await api.invoices.list()).data,
  });

  const { data: walletData } = useQuery({
    queryKey: ["my-wallet"],
    queryFn: async () => (await api.users.myWallet()).data,
  });
  const walletBalance = walletData?.wallet_balance ?? 0;

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  const invoices = data?.invoices || [];
  const summary = data?.summary || { total_amount: 0, total_paid: 0, total_outstanding: 0 };
  const overdueInvoices = invoices.filter((i: any) => isOverdue(i));
  const unpaid = invoices.filter((i: any) => i.status !== "paid");
  const paid = invoices.filter((i: any) => i.status === "paid");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-muted-foreground">View and pay your invoices</p>
      </div>

      <Card className={walletBalance === 0 ? "border-red-300 bg-red-50/30" : "border-green-300 bg-green-50/30"}>
        <CardContent className="pt-4 flex items-center gap-3">
          <Wallet className={`w-8 h-8 ${walletBalance === 0 ? "text-red-500" : "text-green-600"}`} />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Wallet Balance</p>
            <p className={`text-2xl font-bold ${walletBalance === 0 ? "text-red-600" : "text-green-600"}`}>
              ${walletBalance.toFixed(2)}
            </p>
            {walletBalance === 0 && (
              <p className="text-xs text-red-500 mt-0.5">No funds — ask an admin to top up your wallet before paying</p>
            )}
          </div>
        </CardContent>
      </Card>

      {invoices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Billed</p>
                <p className="text-2xl font-bold">${summary.total_amount.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Paid</p>
                <p className="text-2xl font-bold text-green-600">${summary.total_paid.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={overdueInvoices.length > 0 ? "border-red-300" : ""}>
            <CardContent className="pt-4 flex items-center gap-3">
              <Clock className={`w-8 h-8 ${overdueInvoices.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Outstanding</p>
                <p className={`text-2xl font-bold ${overdueInvoices.length > 0 ? "text-red-600" : ""}`}>
                  ${summary.total_outstanding.toFixed(2)}
                </p>
                {overdueInvoices.length > 0 && (
                  <p className="text-xs text-red-500">{overdueInvoices.length} overdue</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {unpaid.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">
            Outstanding ({unpaid.length})
            {overdueInvoices.length > 0 && (
              <span className="ml-2 text-sm font-normal text-red-500">{overdueInvoices.length} overdue</span>
            )}
          </h2>
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
