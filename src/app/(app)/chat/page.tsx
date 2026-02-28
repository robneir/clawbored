"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Bot,
  User,
  Clock,
  Loader2,
  AlertCircle,
  MessageSquare,
  Search,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Instance {
  name: string;
  displayName: string;
  port: number;
  token: string | null;
  live?: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  status?: "sent" | "queued" | "sending" | "streaming" | "error";
}

// In-memory conversation store (persists across instance switches)
const conversationStore = new Map<string, ChatMessage[]>();
// Message queue per instance
const messageQueues = new Map<string, string[]>();
// Track which instances are currently processing
const processingSet = new Set<string>();

export default function ChatPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [activeInstance, setActiveInstance] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch instances
  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchInstances() {
    try {
      const res = await fetch("/api/instances");
      if (res.ok) {
        const data = await res.json();
        setInstances(data);
        // Auto-select first instance if none selected
        if (!activeInstance && data.length > 0) {
          const first = data.find((i: Instance) => i.live) || data[0];
          setActiveInstance(first.name);
          setMessages(conversationStore.get(first.name) || []);
        }
      }
    } catch {}
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function switchInstance(name: string) {
    // Save current conversation
    if (activeInstance) {
      conversationStore.set(activeInstance, messages);
    }
    setActiveInstance(name);
    setMessages(conversationStore.get(name) || []);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const processQueue = useCallback(
    async (instanceName: string) => {
      const queue = messageQueues.get(instanceName);
      if (!queue || queue.length === 0 || processingSet.has(instanceName)) return;

      processingSet.add(instanceName);
      const nextMessage = queue.shift()!;
      messageQueues.set(instanceName, queue);

      // Update queued message to sending
      const updateMessages = (updater: (msgs: ChatMessage[]) => ChatMessage[]) => {
        if (activeInstance === instanceName) {
          setMessages((prev) => {
            const updated = updater(prev);
            conversationStore.set(instanceName, updated);
            return updated;
          });
        } else {
          const stored = conversationStore.get(instanceName) || [];
          conversationStore.set(instanceName, updater(stored));
        }
      };

      // Find the queued message and mark it as sending
      updateMessages((msgs) =>
        msgs.map((m) =>
          m.role === "user" && m.content === nextMessage && m.status === "queued"
            ? { ...m, status: "sending" }
            : m
        )
      );

      try {
        await sendToInstance(instanceName, nextMessage, updateMessages);
      } finally {
        processingSet.delete(instanceName);
        // Process next in queue
        if ((messageQueues.get(instanceName)?.length || 0) > 0) {
          processQueue(instanceName);
        }
      }
    },
    [activeInstance]
  );

  async function sendToInstance(
    instanceName: string,
    content: string,
    updateMessages: (updater: (msgs: ChatMessage[]) => ChatMessage[]) => void
  ) {
    const stored = conversationStore.get(instanceName) || [];
    // Build message history for context
    const history = stored
      .filter((m) => m.status !== "queued" && m.status !== "error")
      .map((m) => ({ role: m.role, content: m.content }));

    // Add assistant placeholder
    const assistantId = `msg-${Date.now()}-assistant`;
    updateMessages((msgs) => [
      ...msgs.map((m) =>
        m.role === "user" && m.content === content && m.status === "sending"
          ? { ...m, status: "sent" as const }
          : m
      ),
      {
        id: assistantId,
        role: "assistant" as const,
        content: "",
        timestamp: Date.now(),
        status: "streaming" as const,
      },
    ]);

    if (instanceName === activeInstance) {
      setIsStreaming(true);
    }

    try {
      const controller = new AbortController();
      if (instanceName === activeInstance) {
        abortRef.current = controller;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceName,
          messages: history,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // Parse SSE stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta =
                parsed.choices?.[0]?.delta?.content ||
                parsed.choices?.[0]?.text ||
                "";
              if (delta) {
                fullContent += delta;
                updateMessages((msgs) =>
                  msgs.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: fullContent }
                      : m
                  )
                );
              }
            } catch {
              // Not valid JSON SSE chunk, ignore
            }
          }
        }
      }

      // Finalize
      updateMessages((msgs) =>
        msgs.map((m) =>
          m.id === assistantId
            ? { ...m, status: "sent" as const, content: fullContent || "(No response)" }
            : m
        )
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      if (errMsg === "The operation was aborted") return;

      updateMessages((msgs) =>
        msgs.map((m) =>
          m.id === assistantId
            ? { ...m, status: "error" as const, content: `Error: ${errMsg}` }
            : m
        )
      );
    } finally {
      if (instanceName === activeInstance) {
        setIsStreaming(false);
        abortRef.current = null;
      }
    }
  }

  async function handleSend() {
    if (!input.trim() || !activeInstance) return;

    const content = input.trim();
    setInput("");

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content,
      timestamp: Date.now(),
      status: processingSet.has(activeInstance) ? "queued" : "sending",
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    conversationStore.set(activeInstance, newMessages);

    if (processingSet.has(activeInstance)) {
      // Queue the message
      const queue = messageQueues.get(activeInstance) || [];
      queue.push(content);
      messageQueues.set(activeInstance, queue);
    } else {
      // Send immediately
      processingSet.add(activeInstance);
      const name = activeInstance;

      const updateMessages = (updater: (msgs: ChatMessage[]) => ChatMessage[]) => {
        if (activeInstance === name) {
          setMessages((prev) => {
            const updated = updater(prev);
            conversationStore.set(name, updated);
            return updated;
          });
        } else {
          const stored = conversationStore.get(name) || [];
          conversationStore.set(name, updater(stored));
        }
      };

      try {
        await sendToInstance(name, content, updateMessages);
      } finally {
        processingSet.delete(name);
        // Process queued messages
        if ((messageQueues.get(name)?.length || 0) > 0) {
          processQueue(name);
        }
      }
    }

    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const activeInst = instances.find((i) => i.name === activeInstance);
  const filteredInstances = instances.filter(
    (i) =>
      !searchFilter ||
      i.name.includes(searchFilter.toLowerCase()) ||
      i.displayName.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const queuedCount = activeInstance
    ? (messageQueues.get(activeInstance)?.length || 0)
    : 0;

  return (
    <div className="flex h-screen">
      {/* Instance List Sidebar */}
      <div
        className="w-72 flex-shrink-0 flex flex-col border-r"
        style={{ borderColor: "var(--mc-border)", backgroundColor: "var(--mc-sidebar)" }}
      >
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: "var(--mc-border)" }}>
          <h2 className="font-heading text-sm font-semibold tracking-tight mb-3">
            Conversations
          </h2>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: "var(--mc-muted)" }}
            />
            <input
              type="text"
              placeholder="Search instances..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border outline-none"
              style={{
                backgroundColor: "var(--mc-surface)",
                borderColor: "var(--mc-border)",
                color: "var(--mc-text)",
              }}
            />
          </div>
        </div>

        {/* Instance List */}
        <div className="flex-1 overflow-y-auto py-1">
          {filteredInstances.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare
                className="w-8 h-8 mx-auto mb-2"
                style={{ color: "var(--mc-muted)", opacity: 0.3 }}
              />
              <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                {instances.length === 0
                  ? "No instances deployed yet"
                  : "No matching instances"}
              </p>
            </div>
          ) : (
            filteredInstances.map((inst) => {
              const isActive = inst.name === activeInstance;
              const hasMessages = (conversationStore.get(inst.name)?.length || 0) > 0;
              const isProcessing = processingSet.has(inst.name);
              const qCount = messageQueues.get(inst.name)?.length || 0;

              return (
                <button
                  key={inst.name}
                  onClick={() => switchInstance(inst.name)}
                  className="w-full px-3 py-2.5 flex items-center gap-3 text-left transition-all duration-150"
                  style={{
                    backgroundColor: isActive ? "var(--mc-surface)" : "transparent",
                    color: isActive ? "var(--mc-text)" : "var(--mc-muted)",
                  }}
                >
                  <div className="relative flex-shrink-0">
                    <div
                      className={
                        inst.live
                          ? "status-dot-running"
                          : "status-dot-stopped"
                      }
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {inst.displayName || inst.name}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--mc-muted)" }}>
                      {isProcessing
                        ? "Processing..."
                        : hasMessages
                        ? "Chat active"
                        : inst.live
                        ? "Online"
                        : "Offline"}
                    </div>
                  </div>
                  {qCount > 0 && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "var(--mc-accent)",
                        color: "white",
                      }}
                    >
                      {qCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeInstance && activeInst ? (
          <>
            {/* Chat Header */}
            <div
              className="px-6 py-3 border-b flex items-center gap-3"
              style={{ borderColor: "var(--mc-border)" }}
            >
              <div
                className={
                  activeInst.live
                    ? "status-dot-running"
                    : "status-dot-stopped"
                }
              />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">
                  {activeInst.displayName || activeInst.name}
                </h3>
                <span className="text-[11px]" style={{ color: "var(--mc-muted)" }}>
                  {activeInst.live ? `Port ${activeInst.port}` : "Offline"}{" "}
                  {isStreaming && " — Responding..."}
                </span>
              </div>
              {queuedCount > 0 && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: "rgba(234, 179, 8, 0.1)",
                    color: "#eab308",
                    border: "1px solid rgba(234, 179, 8, 0.2)",
                  }}
                >
                  <Clock className="w-3 h-3" />
                  {queuedCount} queued
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: "var(--mc-surface)" }}
                  >
                    <Bot className="w-8 h-8" style={{ color: "var(--mc-muted)", opacity: 0.4 }} />
                  </div>
                  <h3 className="font-heading text-lg font-semibold mb-1">
                    Start a conversation
                  </h3>
                  <p className="text-sm max-w-sm" style={{ color: "var(--mc-muted)" }}>
                    Send a message to {activeInst.displayName || activeInst.name}
                    {!activeInst.live && (
                      <span className="block mt-1 text-amber-400">
                        This instance is offline. Start it first.
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                </AnimatePresence>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t" style={{ borderColor: "var(--mc-border)" }}>
              <div
                className="flex items-end gap-3 rounded-xl border p-2"
                style={{
                  backgroundColor: "var(--mc-surface)",
                  borderColor: "var(--mc-border)",
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    activeInst.live
                      ? isStreaming
                        ? "Message will be queued..."
                        : "Send a message..."
                      : "Instance is offline"
                  }
                  disabled={!activeInst.live}
                  rows={1}
                  className="flex-1 resize-none bg-transparent outline-none text-sm py-1.5 px-2 max-h-32"
                  style={{ color: "var(--mc-text)" }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = Math.min(target.scrollHeight, 128) + "px";
                  }}
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || !activeInst.live}
                  size="sm"
                  className="rounded-lg h-8 w-8 p-0 flex-shrink-0"
                  style={{ backgroundColor: "var(--mc-accent)" }}
                >
                  <Send className="w-3.5 h-3.5 text-white" />
                </Button>
              </div>
              {isStreaming && input.trim() && (
                <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: "#eab308" }}>
                  <Clock className="w-3 h-3" />
                  Message will be queued and sent when agent finishes
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
              style={{ backgroundColor: "var(--mc-surface)" }}
            >
              <MessageSquare
                className="w-10 h-10"
                style={{ color: "var(--mc-muted)", opacity: 0.3 }}
              />
            </div>
            <h2 className="font-heading text-xl font-semibold mb-2">
              Multi-Instance Chat
            </h2>
            <p className="text-sm max-w-md text-center" style={{ color: "var(--mc-muted)" }}>
              {instances.length === 0
                ? "Deploy an agent instance first, then come back to chat with it."
                : "Select an instance from the sidebar to start chatting."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isQueued = message.status === "queued";
  const isError = message.status === "error";
  const isStreaming = message.status === "streaming";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          backgroundColor: isUser ? "var(--mc-accent)" : "var(--mc-surface)",
          opacity: isQueued ? 0.5 : 1,
        }}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-white" />
        ) : (
          <Bot className="w-3.5 h-3.5" style={{ color: "var(--mc-muted)" }} />
        )}
      </div>

      {/* Message */}
      <div className={`max-w-[70%] min-w-0 ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser ? "rounded-tr-sm" : "rounded-tl-sm"
          }`}
          style={{
            backgroundColor: isUser
              ? isQueued
                ? "rgba(99, 102, 241, 0.15)"
                : "var(--mc-accent)"
              : "var(--mc-surface)",
            color: isUser
              ? isQueued
                ? "var(--mc-accent)"
                : "white"
              : "var(--mc-text)",
            border: isQueued
              ? "1px dashed var(--mc-accent)"
              : isError
              ? "1px solid rgba(239, 68, 68, 0.3)"
              : "none",
            opacity: isQueued ? 0.7 : 1,
          }}
        >
          {isStreaming && !message.content ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )}
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-1.5 mt-1 text-[10px]" style={{ color: "var(--mc-muted)" }}>
          {isQueued && (
            <span className="flex items-center gap-1" style={{ color: "#eab308" }}>
              <Clock className="w-2.5 h-2.5" />
              Queued
            </span>
          )}
          {message.status === "sending" && (
            <span className="flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Sending
            </span>
          )}
          {isError && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertCircle className="w-2.5 h-2.5" />
              Failed
            </span>
          )}
          {isStreaming && message.content && (
            <span className="flex items-center gap-1" style={{ color: "var(--mc-accent)" }}>
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Streaming
            </span>
          )}
          <span>
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
