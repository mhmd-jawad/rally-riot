import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Link, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminLinks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [parentId, setParentId] = useState("");
  const [childId, setChildId] = useState("");

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.users.list()).data || [],
  });

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["parent-child-links"],
    queryFn: async () => (await api.parentChild.list()).data || [],
  });

  const linkMutation = useMutation({
    mutationFn: () => api.parentChild.link(Number(childId), Number(parentId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-child-links"] });
      toast({ title: "Link created" });
      setParentId("");
      setChildId("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: number) => api.parentChild.unlink(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-child-links"] });
      toast({ title: "Link removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const parents = (users as any[]).filter((u: any) => u.role === "parent");
  const players = (users as any[]).filter((u: any) => u.role === "player");

  // Identify which players are already linked to avoid duplicate suggestions
  const linkedPlayerIds = new Set((links as any[]).map((l: any) => l.child_user_id));
  const availablePlayers = players.filter((p: any) => !linkedPlayerIds.has(p.id));

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Parent-Child Links</h1>
        <p className="text-muted-foreground">Manage parent-player relationships</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Create New Link</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Parent</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger><SelectValue placeholder="Select parent" /></SelectTrigger>
                <SelectContent>
                  {parents.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.full_name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Player (Child)</Label>
              <Select value={childId} onValueChange={setChildId}>
                <SelectTrigger><SelectValue placeholder="Select player" /></SelectTrigger>
                <SelectContent>
                  {players.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.full_name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => linkMutation.mutate()}
            disabled={!parentId || !childId || linkMutation.isPending}
          >
            <Link className="w-4 h-4 mr-2" /> Create Link
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Links ({(links as any[]).length})</CardTitle>
        </CardHeader>
        <CardContent>
          {(links as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No parent-child links yet</p>
          ) : (
            <div className="space-y-3">
              {(links as any[]).map((link: any) => (
                <div key={link.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Link className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">
                        {link.parent?.full_name || `Parent #${link.parent_user_id}`}
                        <span className="text-muted-foreground mx-2">→</span>
                        {link.child?.full_name || `Player #${link.child_user_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {link.parent?.email} → {link.child?.email}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => unlinkMutation.mutate(link.id)}
                    disabled={unlinkMutation.isPending}
                    title="Remove link"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
