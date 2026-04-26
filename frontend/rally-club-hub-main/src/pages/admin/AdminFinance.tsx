import { parseUTC } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, AlertCircle, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { format, isPast, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function AdminFinance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await api.invoices.list()).data,
  });

  const markPaidMutation = useMutation({
    mutationFn: (invoiceId: number) => api.invoices.pay(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice marked as paid" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  const invoices = data?.invoices || [];
  const summary = data?.summary || { total: 0, total_amount: 0, total_paid: 0, total_outstanding: 0 };
  const unpaidCount = invoices.filter((i: any) => i.status !== "paid").length;
  const overdueCount = invoices.filter(
    (i: any) => i.status !== "paid" && i.due_date && isPast(parseISO(i.due_date))
  ).length;

  const statusBadge = (inv: any) => {
    const overdue = inv.status !== "paid" && inv.due_date && isPast(parseISO(inv.due_date));
    if (overdue) return <Badge className="bg-red-100 text-red-800">overdue</Badge>;
    const colors: Record<string, string> = {
      paid: "bg-green-100 text-green-800",
      unpaid: "bg-yellow-100 text-yellow-800",
      partial: "bg-blue-100 text-blue-800",
    };
    return <Badge variant="secondary" className={colors[inv.status] || ""}>{inv.status}</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Finance</h1>
        <p className="text-muted-foreground">Invoice overview and payment tracking</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={`$${(summary.total_amount || 0).toFixed(2)}`} icon={DollarSign} />
        <StatCard title="Collected" value={`$${(summary.total_paid || 0).toFixed(2)}`} icon={TrendingUp} />
        <StatCard title="Unpaid Invoices" value={unpaidCount} icon={AlertCircle} />
        {overdueCount > 0 && (
          <Card className="border-red-300">
            <CardContent className="pt-4 flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>All Invoices</CardTitle></CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No invoices yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="p-4">ID</th>
                    <th className="p-4">Parent</th>
                    <th className="p-4">Player</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Paid</th>
                    <th className="p-4">Outstanding</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any) => {
                    const overdue = inv.status !== "paid" && inv.due_date && isPast(parseISO(inv.due_date));
                    const outstanding = inv.amount - inv.amount_paid;
                    return (
                      <tr key={inv.id} className={`border-b last:border-0 hover:bg-muted/50 ${overdue ? "bg-red-50/40" : ""}`}>
                        <td className="p-4 text-sm">#{inv.id}</td>
                        <td className="p-4 text-sm">{inv.parent?.full_name || `User #${inv.parent_user_id}`}</td>
                        <td className="p-4 text-sm">{inv.player?.full_name || `Player #${inv.player_user_id}`}</td>
                        <td className="p-4 text-sm font-medium">${inv.amount?.toFixed(2)}</td>
                        <td className="p-4 text-sm">${inv.amount_paid?.toFixed(2)}</td>
                        <td className="p-4 text-sm font-medium">
                          {outstanding > 0 ? (
                            <span className={overdue ? "text-red-600 font-bold" : ""}>${outstanding.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-4 text-sm">
                          {inv.due_date ? (
                            <span className={overdue ? "text-red-600 font-medium" : "text-muted-foreground"}>
                              {format(parseISO(inv.due_date), "MMM d, yyyy")}
                              {overdue && " ⚠"}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="p-4">{statusBadge(inv)}</td>
                        <td className="p-4">
                          {inv.status !== "paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => markPaidMutation.mutate(inv.id)}
                              disabled={markPaidMutation.isPending}
                            >
                              Mark Paid
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
