import { Bell, CheckCheck, CalendarClock, CreditCard, FileText, Megaphone, AlertTriangle, Clock, ShieldAlert } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

const notifIcon: Record<string, { icon: React.ElementType; color: string }> = {
  schedule_change: { icon: CalendarClock, color: "text-orange-500" },
  event_reminder:  { icon: Clock,         color: "text-blue-500"   },
  payment_reminder:{ icon: CreditCard,    color: "text-red-500"    },
  invoice:         { icon: CreditCard,    color: "text-green-600"  },
  registration:    { icon: FileText,      color: "text-purple-500" },
  announcement:    { icon: Megaphone,     color: "text-indigo-500" },
  warning:         { icon: AlertTriangle, color: "text-yellow-500" },
  event_displaced: { icon: ShieldAlert,   color: "text-red-600"    },
};

function NotifIcon({ type }: { type: string }) {
  const entry = notifIcon[type] || { icon: Bell, color: "text-muted-foreground" };
  const Icon = entry.icon;
  return <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${entry.color}`} />;
}

export function NotificationsDropdown() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const res = await api.notifications.list();
      return res.data;
    },
    enabled: !!user,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });

  const markRead = useMutation({
    mutationFn: (id: number) => api.notifications.markRead(id),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: invalidate,
  });

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="w-3 h-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No notifications</p>
          ) : (
            notifications.map((n: any) => (
              <div
                key={n.id}
                className={`p-3 border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors ${
                  !n.is_read ? "bg-accent/30" : ""
                }`}
                onClick={() => !n.is_read && markRead.mutate(n.id)}
              >
                <div className="flex items-start gap-2">
                  <NotifIcon type={n.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{n.title || n.type}</p>
                      {!n.is_read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                    </div>
                    {n.message && <p className="text-xs text-muted-foreground mt-1">{n.message}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at + "Z"), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
