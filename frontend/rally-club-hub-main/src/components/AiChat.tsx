import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Send, Loader2, ChevronDown, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import api, { type AiPendingConfirmation } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ROLE_HINTS: Record<string, string> = {
  coach:  'Try: "Who\'s on my team?" or "Book Court A tomorrow at 3pm for 2 hours" or "Who RSVP\'d to Friday\'s match?"',
  parent: 'Try: "What\'s my child\'s schedule?" or "RSVP yes for my child to Friday\'s practice" or "What\'s my balance?"',
  player: 'Try: "What are my upcoming events?" or "RSVP yes to tomorrow\'s practice" or "What\'s my attendance rate?"',
  admin:  'Try: "List all coaches" or "Show pending registrations" or "Check club-wide balance"',
};

const MIN_W = 320;
const MIN_H = 400;
const MAX_W = 900;
const MAX_H = Math.round(window.innerHeight * 0.9);

export function AiChat() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<AiPendingConfirmation | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Resizable state
  const [size, setSize] = useState({ w: 480, h: 620 });
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dw = dragRef.current.startX - ev.clientX;
      const dh = dragRef.current.startY - ev.clientY;
      setSize({
        w: Math.min(MAX_W, Math.max(MIN_W, dragRef.current.startW + dw)),
        h: Math.min(MAX_H, Math.max(MIN_H, dragRef.current.startH + dh)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [size]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("rally:open-ai-chat", handler);
    return () => window.removeEventListener("rally:open-ai-chat", handler);
  }, []);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  if (!role || !["coach", "parent", "admin", "player"].includes(role)) return null;

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await api.ai.chat(newMessages, pendingConfirmation);
      const hasEventWrite = (res.data.write_actions || []).some((action: any) =>
        ["event_created", "event_updated", "event_deleted"].includes(action?.type),
      );
      if (hasEventWrite) {
        queryClient.invalidateQueries({ queryKey: ["my-events"] });
        queryClient.invalidateQueries({ queryKey: ["my-calendar"] });
        queryClient.invalidateQueries({ queryKey: ["all-events"] });
        queryClient.invalidateQueries({ queryKey: ["courts"] });
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return key === "all-events-week" || key === "child-schedule";
          },
        });
      }
      setPendingConfirmation(res.data.pending_confirmation || null);
      setMessages([...newMessages, { role: "assistant", content: res.data.reply }]);
    } catch (err: any) {
      setMessages([
        ...newMessages,
        { role: "assistant", content: `Sorry, something went wrong: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-3",
          "bg-gradient-to-br from-orange-500 to-yellow-500 text-black font-semibold shadow-lg shadow-orange-500/30",
          "hover:scale-105 active:scale-95 transition-transform",
        )}
        aria-label="Open AI Chat"
      >
        <Bot className="h-5 w-5" />
        <span className="text-sm">RallyBot</span>
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-50 flex flex-col rounded-2xl border border-orange-500/20 bg-background shadow-2xl shadow-orange-900/20 overflow-hidden"
          style={{ width: size.w, height: size.h }}
        >
          {/* Resize handle — drag from top-left corner */}
          <div
            onMouseDown={onMouseDown}
            className="absolute top-0 left-0 w-5 h-5 cursor-nw-resize z-10 flex items-center justify-center opacity-30 hover:opacity-70 transition-opacity"
            title="Drag to resize"
          >
            <GripHorizontal className="h-3 w-3 text-orange-400 rotate-45" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-orange-500/10 to-yellow-500/5 border-b border-orange-500/20 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center">
                <Bot className="h-4 w-4 text-black" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">RallyBot</p>
                <p className="text-xs text-muted-foreground">AI Assistant</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3 min-h-0">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <Bot className="h-10 w-10 text-orange-400 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Hi! I'm RallyBot. How can I help you today?
                </p>
                {role && ROLE_HINTS[role] && (
                  <p className="text-xs text-orange-400/70 italic px-4">{ROLE_HINTS[role]}</p>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex mb-3",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex-shrink-0 flex items-center justify-center mr-2 mt-1">
                    <Bot className="h-3 w-3 text-black" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                    msg.role === "user"
                      ? "bg-orange-500 text-black rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm",
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex-shrink-0 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-black" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-orange-500/20 p-3 space-y-2 flex-shrink-0">
            {pendingConfirmation && (
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-2">
                <p className="text-xs font-medium text-foreground">{pendingConfirmation.summary}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => send("confirm")}
                    disabled={loading}
                    className="h-8 bg-orange-500 hover:bg-orange-600 text-black"
                  >
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => send("cancel")}
                    disabled={loading}
                    className="h-8 border-orange-500/30"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask RallyBot anything…"
              className="resize-none min-h-[40px] max-h-[160px] text-sm border-orange-500/20 focus-visible:ring-orange-500/30"
              rows={1}
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="bg-orange-500 hover:bg-orange-600 text-black flex-shrink-0 h-10 w-10"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
