import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, AlertCircle, AlertTriangle, Bell, Wallet, Plus } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { format, isPast, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function AdminFinance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [walletUserId, setWalletUserId] = useState("");
  const [walletAmount, setWalletAmount] = useState("");

  const { data: usersData = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.users.list()).data || [],
  });
  const walletUsers = (usersData as any[]).filter(
    (u: any) => (u.role === "player" || u.role === "parent") && !u.email.endsWith(".internal")
  );

  const topUpMutation = useMutation({
    mutationFn: () => api.users.topUpWallet(Number(walletUserId), Number(walletAmount)),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Wallet topped up", description: res.message });
      setWalletAmount("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

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

  const paymentReminderMutation = useMutation({
    mutationFn: () => api.notifications.sendPaymentReminders(),
    onSuccess: (res: any) => toast({ title: "Payment reminders sent", description: res.message }),
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Finance</h1>
          <p className="text-muted-foreground">Invoice overview and payment tracking</p>
        </div>
        <Button
          variant="outline"
          onClick={() => paymentReminderMutation.mutate()}
          disabled={paymentReminderMutation.isPending}
        >
          <Bell className="w-4 h-4 mr-2" />
          {paymentReminderMutation.isPending ? "Sending..." : "Send Payment Reminders"}
        </Button>
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

      {/* Wallet management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" /> Wallet Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
            <div>
              <Label>User</Label>
              <Select value={walletUserId} onValueChange={setWalletUserId}>
                <SelectTrigger><SelectValue placeholder="Select player or parent" /></SelectTrigger>
                <SelectContent>
                  {walletUsers.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.full_name} ({u.role}) — ${(u.wallet_balance ?? 0).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount to Add ($)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 200.00"
                value={walletAmount}
                onChange={e => setWalletAmount(e.target.value)}
              />
            </div>
            <Button
              onClick={() => topUpMutation.mutate()}
              disabled={!walletUserId || !walletAmount || Number(walletAmount) <= 0 || topUpMutation.isPending}
            >
              <Plus className="w-4 h-4 mr-1" /> Add Funds
            </Button>
          </div>

          {/* Wallet balances table */}
          {walletUsers.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Role</th>
                    <th className="pb-2">Wallet Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {walletUsers.map((u: any) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{u.full_name}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="secondary" className={u.role === "parent" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className={`py-2 font-semibold ${(u.wallet_balance ?? 0) === 0 ? "text-red-500" : "text-green-600"}`}>
                        ${(u.wallet_balance ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
