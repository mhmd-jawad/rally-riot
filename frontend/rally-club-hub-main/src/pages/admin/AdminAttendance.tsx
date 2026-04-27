import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";

export default function AdminAttendance() {
  const [teamFilter, setTeamFilter] = useState("all");
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
  const [reasonsDialog, setReasonsDialog] = useState<any>(null);

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await api.teams.list()).data || [],
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["attendance-summary", teamFilter],
    queryFn: async () => {
      const params = teamFilter !== "all" ? { team_id: Number(teamFilter) } : undefined;
      return (await api.attendance.summary(params)).data || [];
    },
    staleTime: 60_000,
  });

  const rateColor = (rate: number) => {
    if (rate >= 80) return "bg-green-100 text-green-800";
    if (rate >= 50) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Attendance Summaries</h1>
        <p className="text-muted-foreground">Participation overview per player across all events</p>
      </div>

      <div className="flex items-center gap-4">
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Filter by team" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {(teams as any[]).map((t: any) => (
              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> Player Attendance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="animate-pulse h-32 bg-muted rounded-b-xl" />
          ) : (rows as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No attendance records found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="p-4">Player</th>
                    <th className="p-4">Team</th>
                    <th className="p-4">Present</th>
                    <th className="p-4">Absent</th>
                    <th className="p-4">Total Events</th>
                    <th className="p-4">Attendance Rate</th>
                    <th className="p-4">Absence Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as any[]).map((r: any) => (
                    <tr key={r.player_id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4 font-medium text-sm">{r.player_name}</td>
                      <td className="p-4 text-sm text-muted-foreground">{r.team_name}</td>
                      <td className="p-4 text-sm text-green-600 font-medium">{r.present}</td>
                      <td className="p-4 text-sm text-red-600 font-medium">{r.absent}</td>
                      <td className="p-4 text-sm">{r.total}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-muted rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full" style={{ width: `${r.attendance_rate}%` }} />
                          </div>
                          <Badge variant="secondary" className={rateColor(r.attendance_rate)}>
                            {r.attendance_rate}%
                          </Badge>
                        </div>
                      </td>
                      <td className="p-4">
                        {r.absence_reasons?.length > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => setReasonsDialog(r)}
                          >
                            View {r.absence_reasons.length} reason{r.absence_reasons.length !== 1 ? "s" : ""}
                            <ChevronDown className="w-3 h-3" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Absence reasons dialog */}
      <Dialog open={!!reasonsDialog} onOpenChange={v => { if (!v) setReasonsDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Absence Reasons — {reasonsDialog?.player_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(reasonsDialog?.absence_reasons || []).map((ar: any, i: number) => (
              <div key={i} className="flex items-start justify-between rounded border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{ar.event_title}</p>
                  <p className="text-xs text-muted-foreground">{ar.date}</p>
                </div>
                <Badge variant="secondary" className="ml-2 shrink-0">{ar.reason}</Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
