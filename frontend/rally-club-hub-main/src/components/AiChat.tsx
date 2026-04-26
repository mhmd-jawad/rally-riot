import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ROLE_HINTS: Record<string, string> = {
  coach: 'Try: "Book Court A for team practice tomorrow at 3pm for 2 hours"',
  parent: 'Try: "Show my child\'s schedule" or "What\'s my balance?"',
  admin: 'Try: "Book a court" or "Check the balance for a parent"',
};

export function AiChat() {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Listen for sidebar "AI Assistant" button event
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

  // Only show for coach, parent, admin
  if (!role || !["coach", "parent", "admin"].includes(role)) return null;

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await api.ai.chat(newMessages);
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
        <div className="fixed bottom-20 right-6 z-50 flex flex-col w-[360px] max-h-[520px] rounded-2xl border border-orange-500/20 bg-background shadow-2xl shadow-orange-900/20 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-orange-500/10 to-yellow-500/5 border-b border-orange-500/20">
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
          <ScrollArea className="flex-1 px-4 py-3 space-y-3 min-h-0">
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
          <div className="border-t border-orange-500/20 p-3 flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask RallyBot anything…"
              className="resize-none min-h-[40px] max-h-[120px] text-sm border-orange-500/20 focus-visible:ring-orange-500/30"
              rows={1}
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={send}
              disabled={!input.trim() || loading}
              className="bg-orange-500 hover:bg-orange-600 text-black flex-shrink-0 h-10 w-10"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
