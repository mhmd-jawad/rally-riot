import { parseUTC } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar, DollarSign, Bell, Link, Trash2, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, isPast, parseISO } from "date-fns";

export default function ParentDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [childEmail, setChildEmail] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["my-children"],
    queryFn: async () => (await api.parentChild.list()).data || [],
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users-for-link"],
    queryFn: async () => {
      try {
        return (await api.users.list()).data || [];
      } catch {
        return [];
      }
    },
    enabled: showLinkForm,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["my-calendar"],
    queryFn: async () => (await api.events.myCalendar()).data || [],
  });

  const { data: invoiceData } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await api.invoices.list()).data,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => (await api.notifications.list()).data || [],
    enabled: !!user,
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const match = (allUsers as any[]).find(
        (u: any) => u.role === "player" && u.email.toLowerCase() === childEmail.trim().toLowerCase()
      );
      if (!match) throw new Error("No player found with that email address.");
      return api.parentChild.link(match.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-children"] });
      toast({ title: "Child linked successfully" });
      setChildEmail("");
      setShowLinkForm(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: number) => api.parentChild.unlink(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-children"] });
      toast({ title: "Child unlinked" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const invoices = invoiceData?.invoices || [];
  const unpaid = invoices.filter((i: any) => i.status !== "paid");
  const overdueCount = unpaid.filter((i: any) => i.due_date && isPast(parseISO(i.due_date))).length;
  const upcomingEvents = (events as any[]).filter((e: any) => parseUTC(e.start_time) >= new Date()).slice(0, 5);
  const unreadNotifs = (notifications as any[]).filter((n: any) => !n.is_read);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Parent Dashboard</h1>
        <p className="text-muted-foreground">Manage your children's activities</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="My Children" value={(children as any[]).length} icon={Users} />
        <StatCard title="Upcoming Events" value={upcomingEvents.length} icon={Calendar} />
        <StatCard title="Unpaid Invoices" value={unpaid.length} icon={DollarSign} />
        <StatCard title="Unread Notifications" value={unreadNotifs.length} icon={Bell} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* My Children */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> My Children</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowLinkForm(v => !v)}>
              <UserPlus className="w-4 h-4 mr-1" /> Link Child
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {showLinkForm && (
              <div className="flex gap-2 p-3 bg-muted/50 rounded-lg">
                <Input
                  placeholder="Child's player email"
                  value={childEmail}
                  onChange={e => setChildEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && linkMutation.mutate()}
                  className="flex-1"
                />
                <Button size="sm" onClick={() => linkMutation.mutate()} disabled={!childEmail.trim() || linkMutation.isPending}>
                  <Link className="w-4 h-4 mr-1" /> Link
                </Button>
              </div>
            )}
            {childrenLoading ? (
              <div className="animate-pulse h-10 bg-muted rounded" />
            ) : (children as any[]).length === 0 ? (
              <p className="text-sm text-muted-foreground">No children linked yet. Use the button above to link a player account.</p>
            ) : (
              (children as any[]).map((link: any) => (
                <div key={link.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{link.child?.full_name || `Player #${link.child_user_id}`}</p>
                      <p className="text-xs text-muted-foreground">{link.child?.email}</p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive h-7 w-7"
                    onClick={() => unlinkMutation.mutate(link.id)}
                    disabled={unlinkMutation.isPending}
                    title="Unlink"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Upcoming Events</CardTitle></CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events</p>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{e.title}</p>
                      <p className="text-xs text-muted-foreground">{e.event_type} • {e.court || "TBD"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{format(parseUTC(e.start_time), "MMM d, h:mm a")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outstanding Payments */}
        <Card className={overdueCount > 0 ? "border-red-300" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" /> Outstanding Payments
              {overdueCount > 0 && <Badge className="bg-red-100 text-red-800 text-xs">{overdueCount} overdue</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unpaid.length === 0 ? (
              <p className="text-sm text-muted-foreground">All payments are up to date!</p>
            ) : (
              <div className="space-y-3">
                {unpaid.map((inv: any) => {
                  const overdue = inv.due_date && isPast(parseISO(inv.due_date));
                  return (
                    <div key={inv.id} className={`flex items-center justify-between p-3 rounded-lg ${overdue ? "bg-red-50 border border-red-200" : "bg-muted/50"}`}>
                      <div>
                        <p className="font-medium text-sm">Invoice #{inv.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.player?.full_name}
                          {inv.due_date && ` • Due ${format(parseISO(inv.due_date), "MMM d")}`}
                          {overdue && <span className="text-red-500 font-medium"> — OVERDUE</span>}
                        </p>
                      </div>
                      <span className={`font-medium text-sm ${overdue ? "text-red-600" : ""}`}>${(inv.amount - inv.amount_paid).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
