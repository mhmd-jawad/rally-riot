import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trophy, Users, Star, Search, User } from "lucide-react";

const priorityLabel: Record<number, { label: string; color: string }> = {
  5: { label: "P5 — Highest", color: "bg-red-100 text-red-800" },
  4: { label: "P4 — High", color: "bg-orange-100 text-orange-800" },
  3: { label: "P3 — Medium", color: "bg-yellow-100 text-yellow-800" },
  2: { label: "P2 — Low", color: "bg-blue-100 text-blue-800" },
  1: { label: "P1 — Lowest", color: "bg-gray-100 text-gray-600" },
};

export default function CoachTeams() {
  const [search, setSearch] = useState("");

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["my-teams-full"],
    queryFn: async () => (await api.teams.myTeams(true)).data || [],
  });

  const filtered = (teams as any[]).filter((t: any) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.age_group || "").toLowerCase().includes(search.toLowerCase()) ||
    (t.skill_level || "").toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  const totalPlayers = (teams as any[]).reduce((sum: number, t: any) => sum + (t.players?.length || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">My Teams</h1>
          <p className="text-muted-foreground">
            {(teams as any[]).length} team{(teams as any[]).length !== 1 ? "s" : ""} assigned • {totalPlayers} total players
          </p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search teams..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          {search ? "No teams match your search" : "No teams assigned to you yet"}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {filtered.map((team: any) => {
          const priority = team.priority_level ?? 1;
          const pInfo = priorityLabel[priority] || priorityLabel[1];

          return (
            <Card key={team.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Trophy className="w-5 h-5 text-muted-foreground shrink-0" />
                    <span className="truncate">{team.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Star className="w-3.5 h-3.5 text-yellow-500" />
                    <Badge variant="secondary" className={`text-xs ${pInfo.color}`}>{pInfo.label}</Badge>
                  </div>
                </CardTitle>
                <div className="flex flex-wrap gap-2 mt-1">
                  {team.age_group && <Badge variant="outline" className="text-xs">{team.age_group}</Badge>}
                  {team.skill_level && <Badge variant="outline" className="text-xs">{team.skill_level}</Badge>}
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                {/* Coaches */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> Coaches
                  </h4>
                  {team.coaches?.length > 0 ? (
                    <div className="space-y-1">
                      {team.coaches.map((c: any) => (
                        <div key={c.id} className="flex items-center gap-2 text-sm">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                            {c.full_name.charAt(0)}
                          </div>
                          <span>{c.full_name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No other coaches</p>
                  )}
                </div>

                {/* Players */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Roster ({team.players?.length || 0} players)
                  </h4>
                  {team.players?.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {team.players.map((p: any) => (
                        <Badge
                          key={p.id}
                          variant="secondary"
                          className="text-xs flex items-center gap-1"
                        >
                          <span className="w-4 h-4 rounded-full bg-muted-foreground/20 flex items-center justify-center text-[10px] font-bold">
                            {p.full_name.charAt(0)}
                          </span>
                          {p.full_name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No players assigned yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
