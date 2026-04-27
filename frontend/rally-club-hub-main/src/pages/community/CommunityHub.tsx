import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { parseUTC } from "@/lib/utils";
import {
  MessageSquare, Plus, Pin, Trash2, ChevronDown, ChevronUp,
  Lightbulb, HelpCircle, BarChart2, Globe, CheckCircle2,
} from "lucide-react";

// ── Category config ──────────────────────────────────────────
const CATEGORIES = [
  { value: "general", label: "General",  icon: Globe,        color: "bg-gray-100 text-gray-800" },
  { value: "question", label: "Question", icon: HelpCircle,   color: "bg-blue-100 text-blue-800" },
  { value: "tip",      label: "Tip",      icon: Lightbulb,    color: "bg-yellow-100 text-yellow-800" },
  { value: "poll",     label: "Poll",     icon: BarChart2,    color: "bg-purple-100 text-purple-800" },
];

function categoryMeta(cat: string) {
  return CATEGORIES.find(c => c.value === cat) || CATEGORIES[0];
}

// ── Poll component ───────────────────────────────────────────
function PollBlock({ poll, postId }: { poll: any; postId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const voteMutation = useMutation({
    mutationFn: (optionId: number) => api.community.vote(poll.id, optionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      queryClient.invalidateQueries({ queryKey: ["community-post", postId] });
      toast({ title: "Vote recorded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const total = poll.total_votes || 0;

  return (
    <div className="mt-3 p-3 rounded-lg bg-muted/60 space-y-2">
      <p className="text-sm font-semibold">{poll.question}</p>
      <p className="text-xs text-muted-foreground">{total} vote{total !== 1 ? "s" : ""}</p>
      {poll.options.map((opt: any) => {
        const pct = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
        const isVoted = poll.user_vote_option_id === opt.id;
        return (
          <button
            key={opt.id}
            className={`w-full text-left rounded-lg border px-3 py-2 transition-all text-sm relative overflow-hidden
              ${isVoted ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted"}`}
            onClick={() => voteMutation.mutate(opt.id)}
            disabled={voteMutation.isPending}
          >
            <div
              className="absolute inset-0 bg-primary/10 transition-all"
              style={{ width: `${pct}%` }}
            />
            <div className="relative flex items-center justify-between">
              <span className="flex items-center gap-2">
                {isVoted && <CheckCircle2 className="w-4 h-4 text-primary" />}
                {opt.label}
              </span>
              <span className="text-muted-foreground text-xs font-medium">{pct}%</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Reply section ────────────────────────────────────────────
function ReplySection({ post }: { post: any }) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

  const replyMutation = useMutation({
    mutationFn: () => api.community.createReply(post.id, body.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      queryClient.invalidateQueries({ queryKey: ["community-post", post.id] });
      toast({ title: "Reply posted" });
      setBody("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteReply = useMutation({
    mutationFn: (id: number) => api.community.deleteReply(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      queryClient.invalidateQueries({ queryKey: ["community-post", post.id] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const replies: any[] = post.replies || [];

  return (
    <div className="mt-4 space-y-3">
      {replies.map((r: any) => (
        <div key={r.id} className="flex gap-3 items-start">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
            {r.author?.full_name?.[0] ?? "?"}
          </div>
          <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{r.author?.full_name}</span>
              <div className="flex items-center gap-1">
                {r.author?.role === "coach" && (
                  <Badge variant="secondary" className="text-[10px] bg-orange-100 text-orange-700 px-1">Coach</Badge>
                )}
                <span className="text-xs text-muted-foreground">{format(parseUTC(r.created_at), "MMM d, h:mm a")}</span>
                {(role === "admin" || user?.id === r.author_user_id) && (
                  <button onClick={() => deleteReply.mutate(r.id)} className="text-muted-foreground hover:text-destructive ml-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm mt-1 whitespace-pre-line">{r.body}</p>
          </div>
        </div>
      ))}

      {(role === "player" || role === "coach" || role === "admin") && (
        <div className="flex gap-2 mt-2">
          <Textarea
            placeholder="Write a reply…"
            value={body}
            onChange={e => setBody(e.target.value)}
            className="text-sm min-h-[60px]"
            onKeyDown={e => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (body.trim()) replyMutation.mutate();
              }
            }}
          />
          <Button
            size="sm"
            className="self-end"
            onClick={() => replyMutation.mutate()}
            disabled={!body.trim() || replyMutation.isPending}
          >
            Reply
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Post card ────────────────────────────────────────────────
function PostCard({ post, isAdmin }: { post: any; isAdmin: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const meta = categoryMeta(post.category);
  const Icon = meta.icon;

  // Fetch full post (with replies) when expanded
  const { data: fullPost } = useQuery({
    queryKey: ["community-post", post.id],
    queryFn: async () => (await api.community.getPost(post.id)).data,
    enabled: expanded,
    staleTime: 10_000,
  });

  const pinMutation = useMutation({
    mutationFn: () => api.community.togglePin(post.id),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      toast({ title: res.message });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.community.deletePost(post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      toast({ title: "Post deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const displayPost = expanded && fullPost ? fullPost : post;

  return (
    <Card className={post.is_pinned ? "border-orange-400/60 bg-orange-50/10" : ""}>
      <CardContent className="pt-4 pb-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
              {post.author?.full_name?.[0] ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {post.is_pinned && <Pin className="w-3 h-3 text-orange-500 shrink-0" />}
                <p className="font-semibold text-sm">{post.title}</p>
                <Badge variant="secondary" className={`text-[11px] px-2 ${meta.color}`}>
                  <Icon className="w-3 h-3 mr-1" />{meta.label}
                </Badge>
                {post.team && (
                  <Badge variant="outline" className="text-[11px] px-2">{post.team.name}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {post.author?.full_name}
                {post.author?.role === "coach" && <span className="text-orange-500 ml-1">(Coach)</span>}
                {post.author?.role === "admin" && <span className="text-blue-500 ml-1">(Admin)</span>}
                {" · "}{format(parseUTC(post.created_at), "MMM d, h:mm a")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isAdmin && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => pinMutation.mutate()} title={post.is_pinned ? "Unpin" : "Pin"}>
                <Pin className={`w-3.5 h-3.5 ${post.is_pinned ? "text-orange-500 fill-orange-500" : "text-muted-foreground"}`} />
              </Button>
            )}
            {(isAdmin || user?.id === post.author_user_id) && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate()}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Body */}
        <p className="text-sm mt-3 whitespace-pre-line text-foreground/90">{post.body}</p>

        {/* Poll (always shown in summary) */}
        {post.category === "poll" && post.poll && (
          <PollBlock poll={displayPost.poll ?? post.poll} postId={post.id} />
        )}

        {/* Expand / collapse replies */}
        <button
          className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {expanded && (
          <ReplySection post={displayPost} />
        )}
      </CardContent>
    </Card>
  );
}

// ── New post dialog ──────────────────────────────────────────
function NewPostDialog({ teams }: { teams: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    team_id: "",   // empty = global (no team)
    title: "", body: "", category: "general",
  });
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category,
      };
      if (form.team_id) payload.team_id = Number(form.team_id);
      if (form.category === "poll") {
        payload.poll = {
          question: pollQuestion.trim(),
          options: pollOptions.filter(o => o.trim()),
        };
      }
      return api.community.createPost(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      toast({ title: "Post created" });
      setOpen(false);
      setForm({ team_id: "", title: "", body: "", category: "general" });
      setPollQuestion("");
      setPollOptions(["", ""]);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSubmit = form.title.trim() && form.body.trim() &&
    (form.category !== "poll" || (pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2" /> New Post</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Community Post</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Team <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select value={form.team_id} onValueChange={v => setForm(p => ({ ...p, team_id: v === "_global" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="All members (global)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_global">All members (global)</SelectItem>
                  {teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="What's on your mind?" />
          </div>
          <div>
            <Label>Body</Label>
            <Textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} placeholder="Write your post…" className="min-h-[100px]" />
          </div>

          {form.category === "poll" && (
            <div className="space-y-3 p-3 rounded-lg bg-muted/50">
              <Label>Poll Question</Label>
              <Input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="e.g. Who is Player of the Week?" />
              <Label>Options (min 2)</Label>
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={opt}
                    onChange={e => {
                      const updated = [...pollOptions];
                      updated[i] = e.target.value;
                      setPollOptions(updated);
                    }}
                    placeholder={`Option ${i + 1}`}
                  />
                  {pollOptions.length > 2 && (
                    <Button size="icon" variant="ghost" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              {pollOptions.length < 5 && (
                <Button size="sm" variant="outline" onClick={() => setPollOptions([...pollOptions, ""])}>
                  + Add Option
                </Button>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
            Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function CommunityHub() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [teamFilter, setTeamFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: teams = [] } = useQuery({
    queryKey: ["my-teams-community"],
    queryFn: async () => {
      if (role === "admin") return (await api.teams.list()).data || [];
      return (await api.teams.myTeams()).data || [];
    },
    staleTime: 60_000,
  });

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["community-posts", teamFilter, categoryFilter],
    queryFn: async () => {
      const params: any = {};
      if (teamFilter !== "all") params.team_id = Number(teamFilter);
      if (categoryFilter !== "all") params.category = categoryFilter;
      return (await api.community.listPosts(params)).data || [];
    },
    staleTime: 15_000,
  });

  const pinned = (posts as any[]).filter((p: any) => p.is_pinned);
  const unpinned = (posts as any[]).filter((p: any) => !p.is_pinned);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Community Hub</h1>
          <p className="text-muted-foreground">Questions, tips, and team discussions</p>
        </div>
        {(role === "player" || role === "coach" || role === "admin") && (
          <NewPostDialog teams={teams as any[]} />
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All teams" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {(teams as any[]).map((t: any) => (
              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-28 bg-muted rounded-xl" />)}
        </div>
      ) : (posts as any[]).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No posts yet. Be the first to start a discussion!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pinned.length > 0 && (
            <>
              <p className="text-xs font-semibold text-orange-500 uppercase tracking-widest flex items-center gap-1">
                <Pin className="w-3 h-3" /> Pinned
              </p>
              {pinned.map((p: any) => <PostCard key={p.id} post={p} isAdmin={isAdmin} />)}
              {unpinned.length > 0 && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mt-2">
                  Recent Posts
                </p>
              )}
            </>
          )}
          {unpinned.map((p: any) => <PostCard key={p.id} post={p} isAdmin={isAdmin} />)}
        </div>
      )}
    </div>
  );
}
