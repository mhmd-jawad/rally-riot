import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, AlertCircle } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { format } from "date-fns";

export default function AdminFinance() {
  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await api.invoices.list()).data,
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  const invoices = data?.invoices || [];
  const summary = data?.summary || { total: 0, total_amount: 0, total_paid: 0, total_outstanding: 0 };
  const unpaidCount = invoices.filter((i: any) => i.status !== "paid").length;

  const statusColor: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    unpaid: "bg-red-100 text-red-800",
    partial: "bg-yellow-100 text-yellow-800",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Finance</h1>
        <p className="text-muted-foreground">Invoice overview and payment tracking</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Revenue" value={`$${(summary.total_amount || 0).toFixed(2)}`} icon={DollarSign} />
        <StatCard title="Collected" value={`$${(summary.total_paid || 0).toFixed(2)}`} icon={TrendingUp} />
        <StatCard title="Unpaid Invoices" value={unpaidCount} icon={AlertCircle} />
      </div>

      <Card>
        <CardHeader><CardTitle>All Invoices</CardTitle></CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No invoices yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="p-4">ID</th><th className="p-4">Parent</th><th className="p-4">Player</th><th className="p-4">Amount</th><th className="p-4">Paid</th><th className="p-4">Status</th><th className="p-4">Created</th>
                </tr></thead>
                <tbody>
                  {invoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4 text-sm">#{inv.id}</td>
                      <td className="p-4 text-sm">{inv.parent?.full_name || `User #${inv.parent_user_id}`}</td>
                      <td className="p-4 text-sm">{inv.player?.full_name || `Player #${inv.player_user_id}`}</td>
                      <td className="p-4 text-sm font-medium">${inv.amount?.toFixed(2)}</td>
                      <td className="p-4 text-sm">${inv.amount_paid?.toFixed(2)}</td>
                      <td className="p-4"><Badge variant="secondary" className={statusColor[inv.status] || ""}>{inv.status}</Badge></td>
                      <td className="p-4 text-sm text-muted-foreground">{format(new Date(inv.created_at), "MMM d, yyyy")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
