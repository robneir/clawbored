"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
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
  Paperclip,
  X,
  FileText,
  FileIcon,
  Download,
  Upload,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { useGateway } from "@/components/gateway-provider";
import { useLive } from "@/components/live-provider";

interface Agent {
  id: string;
  displayName: string;
  template: string;
  status: string;
  avatar?: string;
}

interface ChatAttachment {
  filename: string;
  mimeType: string;
  size: number;
  storagePath?: string;
  url?: string;
  base64?: string;
  status: "pending" | "uploaded" | "error";
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  status?: "sent" | "queued" | "sending" | "streaming" | "error";
  attachments?: ChatAttachment[];
}

interface PendingAttachment {
  id: string;
  file: File;
  preview?: string; // base64 data URL for images
}

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go", ".rs",
  ".java", ".c", ".cpp", ".h", ".css", ".scss", ".html", ".xml", ".json",
  ".yaml", ".yml", ".toml", ".ini", ".cfg", ".sh", ".bash", ".zsh",
  ".sql", ".graphql", ".env", ".gitignore", ".dockerfile", ".makefile",
  ".csv", ".log", ".conf",
]);

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

function isTextFile(filename: string, mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json" || mime === "application/xml") return true;
  const ext = "." + filename.split(".").pop()?.toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// In-memory conversation store (persists across agent switches, keyed by agentId)
const conversationStore = new Map<string, ChatMessage[]>();
// Message queue per agent
const messageQueues = new Map<string, string[]>();
// Track which agents are currently processing
const processingSet = new Set<string>();
// Track which agents have had their history loaded from disk
const historyLoaded = new Set<string>();

export default function ChatPageWrapper() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}

function ChatPage() {
  const searchParams = useSearchParams();
  const agentParam = searchParams.get("agent");
  const scrollToTimestamp = searchParams.get("t");
  const { gateway } = useGateway();
  const live = useLive();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const activeAgentRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [previews, setPreviews] = useState<Record<string, { lastMessage: string; lastRole: string; timestamp: number }>>({});
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const previewsFetched = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const agentSelectedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollToRef = useRef<string | null>(scrollToTimestamp);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");

  // Re-process searchParams when they change (e.g., notification click while already on /chat)
  const lastAppliedParams = useRef<string>("");
  useEffect(() => {
    const paramKey = `${agentParam || ""}:${scrollToTimestamp || ""}`;
    if (paramKey === lastAppliedParams.current) return;
    lastAppliedParams.current = paramKey;

    // If we already have agents loaded, handle the param change immediately
    if (agentSelectedRef.current && agents.length > 0) {
      const needsSwitch = agentParam && agentParam !== activeAgentRef.current;
      if (needsSwitch) {
        const target = agents.find((a) => a.id === agentParam);
        if (target) switchAgent(target.id);
      }
      if (scrollToTimestamp) {
        scrollToRef.current = scrollToTimestamp;
        if (!needsSwitch) {
          setMessages((prev) => [...prev]);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentParam, scrollToTimestamp]);

  // Sync agents from SSE live data
  useEffect(() => {
    if (live.agents.length > 0) {
      const data = live.agents as unknown as Agent[];
      setAgents(data);
      // Fetch previews once on first load
      if (!previewsFetched.current && data.length > 0) {
        previewsFetched.current = true;
        fetchPreviews(data.map((a) => a.id));
      }
      // Auto-select agent only on the very first load
      if (!agentSelectedRef.current && data.length > 0) {
        agentSelectedRef.current = true;
        const target = agentParam
          ? data.find((a) => a.id === agentParam)
          : null;
        const selected = target || data[0];
        setActiveAgent(selected.id);
        activeAgentRef.current = selected.id;
        loadHistory(selected.id);
        // Mark as read
        if (gateway?.profileName) {
          fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profileName: gateway.profileName, agentId: selected.id }),
          }).catch(() => {});
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.agents]);

  const gwLive = gateway?.live ?? false;
  const gwDeploying = gateway?.status === "setup" && !!gateway?.deployId;
  // Gateway is "ready" if it's configured — don't block the UI over transient health check failures
  const gwReady = gwLive || (!!gateway?.profileDir && gateway?.status !== "not_setup");

  // Auto-mark the active agent as read while viewing the chat
  const markActiveAgentRead = useCallback(() => {
    if (!activeAgent || !gateway?.profileName) return;
    fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileName: gateway.profileName, agentId: activeAgent }),
    }).catch(() => {});
  }, [activeAgent, gateway?.profileName]);

  // markActiveAgentRead is called at the right moments:
  // - initial agent selection, switchAgent, and stream completion.
  // No periodic interval — it was suppressing notification events.

  async function loadHistory(agentId: string) {
    if (historyLoaded.has(agentId)) {
      // Already loaded — just restore from store
      setMessages(conversationStore.get(agentId) || []);
      return;
    }
    // Don't overwrite messages from current session
    if (conversationStore.has(agentId) && conversationStore.get(agentId)!.length > 0) {
      historyLoaded.add(agentId);
      setMessages(conversationStore.get(agentId) || []);
      return;
    }

    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/history?limit=200`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          conversationStore.set(agentId, data.messages);
          // Only update React state if user is still viewing this agent
          if (activeAgentRef.current === agentId) {
            setMessages(data.messages);
          }
        }
      }
    } catch {
      // Silent failure — no history available
    } finally {
      historyLoaded.add(agentId);
      if (activeAgentRef.current === agentId) {
        setLoadingHistory(false);
      }
    }
  }

  async function fetchPreviews(agentIds: string[]) {
    if (agentIds.length === 0) return;
    try {
      const res = await fetch("/api/chat/previews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentIds }),
      });
      if (res.ok) {
        setPreviews(await res.json());
      }
    } catch {}
  }

  // Scroll to target message (from notification click) or bottom
  useEffect(() => {
    if (scrollToRef.current && messages.length > 0) {
      const targetTs = parseInt(scrollToRef.current, 10);
      scrollToRef.current = null; // only scroll once

      if (!isNaN(targetTs)) {
        // Find the closest assistant message to the notification timestamp.
        // The notification timestamp comes from the session file's updatedAt,
        // which may differ from the client-side message timestamp. Use the
        // closest match (any role, prefer assistant) with a generous window.
        let best: ChatMessage | null = null;
        let bestDiff = Infinity;

        // First pass: closest assistant message (any direction)
        for (const msg of messages) {
          if (msg.role !== "assistant") continue;
          const diff = Math.abs(msg.timestamp - targetTs);
          if (diff < bestDiff) {
            best = msg;
            bestDiff = diff;
          }
        }

        // Fallback: just use the last assistant message
        if (!best) {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "assistant") {
              best = messages[i];
              break;
            }
          }
        }

        if (best) {
          setHighlightedMsgId(best.id);
          // Use requestAnimationFrame to ensure DOM has rendered, then instant-jump
          requestAnimationFrame(() => {
            const el = document.getElementById(`msg-${best!.id}`);
            el?.scrollIntoView({ behavior: "auto", block: "center" });
          });
          setTimeout(() => setHighlightedMsgId(null), 3000);
          return;
        }
      }
    }
    messagesEndRef.current?.scrollIntoView({ behavior: scrollBehaviorRef.current });
    scrollBehaviorRef.current = "auto"; // reset after scroll
  }, [messages]);

  // Auto-focus input when active agent is set or changes
  useEffect(() => {
    if (activeAgent && gwReady) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeAgent, gwReady]);

  function switchAgent(agentId: string) {
    if (agentId === activeAgentRef.current) return; // already viewing this agent
    // Store is already kept in sync by updateMessages on every mutation —
    // don't overwrite with potentially stale React state here.
    // Reset streaming state — old agent's stream finishes in background
    setIsStreaming(false);
    abortRef.current = null;
    setActiveAgent(agentId);
    activeAgentRef.current = agentId;
    setInput("");
    // Clear messages immediately so old agent's chat doesn't flash
    setMessages(conversationStore.get(agentId) || []);
    loadHistory(agentId);
    setTimeout(() => inputRef.current?.focus(), 100);
    // Mark as read
    if (gateway?.profileName) {
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileName: gateway.profileName, agentId }),
      }).catch(() => {});
    }
  }

  const processQueue = useCallback(
    async (agentId: string) => {
      const queue = messageQueues.get(agentId);
      if (!queue || queue.length === 0 || processingSet.has(agentId)) return;

      processingSet.add(agentId);
      const nextMessage = queue.shift()!;
      messageQueues.set(agentId, queue);

      const updateMessages = (updater: (msgs: ChatMessage[]) => ChatMessage[]) => {
        // Use ref (not stale closure) to check if user is still viewing this agent
        if (activeAgentRef.current === agentId) {
          scrollBehaviorRef.current = "smooth";
          setMessages((prev) => {
            const updated = updater(prev);
            conversationStore.set(agentId, updated);
            return updated;
          });
        } else {
          // User switched away — update store only (not React state)
          const stored = conversationStore.get(agentId) || [];
          conversationStore.set(agentId, updater(stored));
        }
      };

      updateMessages((msgs) =>
        msgs.map((m) =>
          m.role === "user" && m.content === nextMessage && m.status === "queued"
            ? { ...m, status: "sending" }
            : m
        )
      );

      try {
        await sendToAgent(agentId, nextMessage, updateMessages);
      } finally {
        processingSet.delete(agentId);
        if ((messageQueues.get(agentId)?.length || 0) > 0) {
          processQueue(agentId);
        }
      }
    },
    [] // activeAgentRef is used instead of activeAgent state to avoid stale closures
  );

  async function sendToAgent(
    agentId: string,
    content: string,
    updateMessages: (updater: (msgs: ChatMessage[]) => ChatMessage[]) => void,
    retryCount?: number
  ) {
    const stored = conversationStore.get(agentId) || [];
    const history = stored
      .filter((m) => m.status !== "queued" && m.status !== "error")
      .map((m) => ({ role: m.role, content: m.content }));

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

    setIsStreaming(true);
    // Notify sidebar instantly that this agent is busy
    window.dispatchEvent(new CustomEvent("agent-busy", { detail: { agentId, busy: true } }));

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          messages: history,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "";
      const isSSE = contentType.includes("text/event-stream");
      let fullContent = "";

      if (isSSE && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

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
              // Not valid JSON SSE chunk
            }
          }
        }
      } else {
        // Non-streaming JSON response
        const data = await res.json();
        fullContent =
          data.choices?.[0]?.message?.content ||
          data.choices?.[0]?.text ||
          data.content ||
          "";
        if (fullContent) {
          updateMessages((msgs) =>
            msgs.map((m) =>
              m.id === assistantId
                ? { ...m, content: fullContent }
                : m
            )
          );
        }
      }

      if (!fullContent) {
        // The stream was empty — retry non-streaming to get the actual error message
        let errorDetail = "";
        try {
          const diagRes = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId, messages: history, stream: false }),
          });
          if (diagRes.ok) {
            const diagData = await diagRes.json();
            errorDetail = diagData.choices?.[0]?.message?.content || "";
          } else {
            const diagErr = await diagRes.json().catch(() => ({}));
            errorDetail = diagErr.error || "";
          }
        } catch {}

        // Check if the error is an auth issue from the provider
        const isAuthError = errorDetail.toLowerCase().includes("401") ||
          errorDetail.toLowerCase().includes("authentication") ||
          errorDetail.toLowerCase().includes("bearer token") ||
          errorDetail.toLowerCase().includes("api key");

        const displayError = isAuthError
          ? `Authentication failed: ${errorDetail}\n\nYour API key or subscription token may be expired. Re-connect in Settings.`
          : errorDetail
          ? `Agent error: ${errorDetail}`
          : "Agent returned an empty response. Check that your API key or subscription token is valid in Settings.";

        updateMessages((msgs) =>
          msgs.map((m) =>
            m.id === assistantId
              ? { ...m, status: "error" as const, content: displayError }
              : m
          )
        );
      } else {
        updateMessages((msgs) =>
          msgs.map((m) =>
            m.id === assistantId
              ? { ...m, status: "sent" as const, content: fullContent }
              : m
          )
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      const isAbort =
        errMsg === "The operation was aborted" ||
        (err instanceof DOMException && err.name === "AbortError");

      if (isAbort) {
        // User stopped the stream — keep whatever content was already streamed
        updateMessages((msgs) =>
          msgs.map((m) =>
            m.id === assistantId
              ? { ...m, status: "sent" as const }
              : m
          )
        );
        return;
      }

      // Detect network / transient errors — auto-retry instead of showing error
      const isNetwork =
        errMsg.includes("Failed to fetch") ||
        errMsg.includes("NetworkError") ||
        errMsg.includes("network") ||
        errMsg.includes("fetch") ||
        errMsg.includes("ECONNREFUSED");

      if (isNetwork && (retryCount || 0) < 2) {
        // Remove the empty assistant message, wait, then retry silently
        updateMessages((msgs) => msgs.filter((m) => m.id !== assistantId));
        setIsStreaming(false);
        window.dispatchEvent(new CustomEvent("agent-busy", { detail: { agentId, busy: false } }));
        await new Promise((r) => setTimeout(r, 2000));
        return sendToAgent(agentId, content, updateMessages, (retryCount || 0) + 1);
      }

      updateMessages((msgs) =>
        msgs.map((m) =>
          m.id === assistantId
            ? { ...m, status: "error" as const, content: `Error: ${errMsg}` }
            : m
        )
      );
    } finally {
      // Notify sidebar instantly that this agent is no longer busy
      window.dispatchEvent(new CustomEvent("agent-busy", { detail: { agentId, busy: false } }));
      // Always clear streaming state — if user switched agents, switchAgent already
      // reset it, so this is a no-op. If they're still here, this clears the Stop button.
      setIsStreaming(false);
      abortRef.current = null;
      markActiveAgentRead();
    }
  }

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    arr.forEach(async (file) => {
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let preview: string | undefined;
      if (isImageMime(file.type)) {
        preview = await readFileAsBase64(file);
      }
      setPendingAttachments((prev) => [...prev, { id, file, preview }]);
    });
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if we're leaving the drop zone entirely
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  async function uploadPendingFiles(messageId: string): Promise<ChatAttachment[]> {
    if (!activeAgent || pendingAttachments.length === 0) return [];
    const results = await Promise.allSettled(
      pendingAttachments.map(async (att) => {
        const formData = new FormData();
        formData.append("file", att.file);
        formData.append("agentId", activeAgent!);
        formData.append("messageId", messageId);
        const res = await fetch("/api/chat/upload", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(err.error);
        }
        const data = await res.json();
        return {
          filename: att.file.name,
          mimeType: att.file.type || "application/octet-stream",
          size: att.file.size,
          storagePath: data.storagePath,
          url: data.url,
          base64: att.preview,
          status: "uploaded" as const,
        };
      })
    );
    const uploaded: ChatAttachment[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") uploaded.push(r.value);
    }
    return uploaded;
  }

  async function handleSend() {
    if ((!input.trim() && pendingAttachments.length === 0) || !activeAgent) return;

    // If streaming and input is a stop word, stop instead of queuing
    if (isStreaming && STOP_WORDS.has(input.trim().toLowerCase())) {
      handleStop();
      setInput("");
      return;
    }

    const content = input.trim();
    setInput("");
    const hasAttachments = pendingAttachments.length > 0;
    const attachmentsToSend = [...pendingAttachments];
    setPendingAttachments([]);

    const agentId = activeAgent;
    const msgId = `msg-${Date.now()}-user`;

    // Build preliminary attachments for display (pending status)
    const displayAttachments: ChatAttachment[] = attachmentsToSend.map((att) => ({
      filename: att.file.name,
      mimeType: att.file.type || "application/octet-stream",
      size: att.file.size,
      base64: att.preview,
      status: "pending" as const,
    }));

    const userMsg: ChatMessage = {
      id: msgId,
      role: "user",
      content: content || (hasAttachments ? `Sent ${attachmentsToSend.length} file(s)` : ""),
      timestamp: Date.now(),
      status: processingSet.has(agentId) ? "queued" : "sending",
      attachments: hasAttachments ? displayAttachments : undefined,
    };

    const newMessages = [...messages, userMsg];
    scrollBehaviorRef.current = "smooth";
    setMessages(newMessages);
    conversationStore.set(agentId, newMessages);

    // Upload attachments in background
    let uploadedAttachments: ChatAttachment[] = [];
    if (hasAttachments) {
      uploadedAttachments = await uploadPendingFiles(msgId);
      // Update the message with uploaded attachment data
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === msgId ? { ...m, attachments: uploadedAttachments } : m
        );
        conversationStore.set(agentId, updated);
        return updated;
      });
    }

    // Build the content to send to the agent
    let sendContent = content;
    if (hasAttachments) {
      const parts: string[] = [];
      if (content) parts.push(content);

      for (const att of attachmentsToSend) {
        if (isImageMime(att.file.type)) {
          const b64 = att.preview || (await readFileAsBase64(att.file));
          parts.push(`[Image: ${att.file.name}]\n(Image data provided as base64 - ${formatFileSize(att.file.size)})`);
          void b64;
        } else if (isTextFile(att.file.name, att.file.type)) {
          try {
            const textContent = await readFileAsText(att.file);
            const truncated = textContent.length > 50000 ? textContent.slice(0, 50000) + "\n...(truncated)" : textContent;
            parts.push(`\`\`\`${att.file.name}\n${truncated}\n\`\`\``);
          } catch {
            parts.push(`[Attached file: ${att.file.name} (${formatFileSize(att.file.size)})]`);
          }
        } else {
          parts.push(`[Attached file: ${att.file.name} (${formatFileSize(att.file.size)})]`);
        }
      }
      sendContent = parts.join("\n\n");
    }

    if (processingSet.has(agentId)) {
      const queue = messageQueues.get(agentId) || [];
      queue.push(sendContent);
      messageQueues.set(agentId, queue);
    } else {
      processingSet.add(agentId);

      const updateMessages = (updater: (msgs: ChatMessage[]) => ChatMessage[]) => {
        // Use ref (not stale closure) to check if user is still viewing this agent
        if (activeAgentRef.current === agentId) {
          scrollBehaviorRef.current = "smooth";
          setMessages((prev) => {
            const updated = updater(prev);
            conversationStore.set(agentId, updated);
            return updated;
          });
        } else {
          // User switched away — update store only (not React state)
          const stored = conversationStore.get(agentId) || [];
          conversationStore.set(agentId, updater(stored));
        }
      };

      try {
        await sendToAgent(agentId, sendContent, updateMessages);
      } finally {
        processingSet.delete(agentId);
        if ((messageQueues.get(agentId)?.length || 0) > 0) {
          processQueue(agentId);
        }
      }
    }

    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }

  // Words that trigger stop when typed during streaming
  const STOP_WORDS = new Set(["stop", "cancel", "abort", "halt", "nevermind", "never mind", "nvm"]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming && STOP_WORDS.has(input.trim().toLowerCase())) {
        handleStop();
        setInput("");
        return;
      }
      handleSend();
    }
    if (e.key === "Escape" && isStreaming) {
      handleStop();
    }
  }

  const activeAgentData = agents.find((a) => a.id === activeAgent);
  const filteredAgents = agents.filter(
    (a) =>
      !searchFilter ||
      a.id.includes(searchFilter.toLowerCase()) ||
      a.displayName.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const queuedCount = activeAgent
    ? (messageQueues.get(activeAgent)?.length || 0)
    : 0;

  return (
    <div className="flex h-screen">
      {/* Agent List Sidebar — hidden on mobile */}
      <div
        className="hidden md:flex w-72 flex-shrink-0 flex-col border-r"
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
              placeholder="Search agents..."
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

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto py-1">
          {filteredAgents.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare
                className="w-8 h-8 mx-auto mb-2"
                style={{ color: "var(--mc-muted)", opacity: 0.3 }}
              />
              <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                {agents.length === 0
                  ? "No agents created yet"
                  : "No matching agents"}
              </p>
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const isActive = agent.id === activeAgent;
              const storedMsgs = conversationStore.get(agent.id) || [];
              const hasMessages = storedMsgs.length > 0;
              const isProcessing = processingSet.has(agent.id);
              const qCount = messageQueues.get(agent.id)?.length || 0;

              // Get last assistant message for preview
              const lastAssistantMsg = [...storedMsgs].reverse().find(
                (m) => m.role === "assistant" && m.content && m.status !== "error"
              );
              const lastMsg = lastAssistantMsg || (hasMessages ? storedMsgs[storedMsgs.length - 1] : null);

              // Fallback to disk-loaded preview when no in-memory messages
              const diskPreview = previews[agent.id];

              let preview = "";
              if (isProcessing) {
                preview = "Responding...";
              } else if (lastMsg) {
                const prefix = lastMsg.role === "user" ? "You: " : "";
                const text = lastMsg.content.replace(/\n/g, " ").trim();
                preview = prefix + (text.length > 60 ? text.slice(0, 60) + "..." : text);
              } else if (diskPreview) {
                const prefix = diskPreview.lastRole === "user" ? "You: " : "";
                const text = diskPreview.lastMessage.replace(/\n/g, " ").trim();
                preview = prefix + (text.length > 60 ? text.slice(0, 60) + "..." : text);
              } else if (gwDeploying) {
                preview = "Setting up...";
              } else {
                preview = "Start a conversation";
              }

              return (
                <button
                  key={agent.id}
                  onClick={() => switchAgent(agent.id)}
                  className="w-full px-3 py-2.5 flex items-center gap-3 text-left transition-all duration-150"
                  style={{
                    backgroundColor: isActive ? "var(--mc-surface)" : "transparent",
                    color: isActive ? "var(--mc-text)" : "var(--mc-muted)",
                  }}
                >
                  <div className="relative flex-shrink-0">
                    <Bot className="w-4 h-4" style={{ opacity: 0.6 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {agent.displayName || agent.id}
                    </div>
                    <div
                      className="text-[11px] truncate"
                      style={{
                        color: isProcessing ? "var(--mc-accent)" : "var(--mc-muted)",
                      }}
                    >
                      {preview}
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
      <div
        className="flex-1 flex flex-col min-w-0 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
          >
            <div
              className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed"
              style={{ borderColor: "var(--mc-accent)", backgroundColor: "var(--mc-surface)" }}
            >
              <Upload className="w-10 h-10" style={{ color: "var(--mc-accent)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
                Drop files to attach
              </p>
              <p className="text-xs" style={{ color: "var(--mc-muted)" }}>
                Images, code, documents, and more
              </p>
            </div>
          </div>
        )}
        {activeAgent && activeAgentData ? (
          <>
            {/* Chat Header */}
            <div
              className="px-6 py-3 border-b flex items-center gap-3"
              style={{ borderColor: "var(--mc-border)" }}
            >
              <Bot className="w-4 h-4" style={{ color: "var(--mc-muted)", opacity: 0.6 }} />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">
                  {activeAgentData.displayName || activeAgentData.id}
                </h3>
                <span className="text-[11px]" style={{ color: "var(--mc-muted)" }}>
                  {gwReady ? `openclaw:${activeAgentData.id}` : gwDeploying ? "Setting up gateway..." : "Connecting..."}
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
              {messages.length === 0 && loadingHistory ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div
                    className="w-6 h-6 border-2 rounded-full animate-spin mb-3"
                    style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
                  />
                  <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                    Loading conversation history...
                  </p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: "var(--mc-surface)" }}
                  >
                    <Bot className="w-8 h-8" style={{ color: "var(--mc-muted)", opacity: 0.4 }} />
                  </div>
                  <h3 className="font-heading text-lg font-semibold mb-1">
                    {gwDeploying ? "Setting up..." : "Start a conversation"}
                  </h3>
                  <p className="text-sm max-w-sm" style={{ color: "var(--mc-muted)" }}>
                    {gwDeploying ? (
                      <span className="flex flex-col items-center gap-2">
                        <span>The gateway is being set up. Chat will be available shortly.</span>
                        <span
                          className="w-5 h-5 border-2 rounded-full animate-spin inline-block"
                          style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-accent)" }}
                        />
                      </span>
                    ) : (
                      <>
                        Send a message to {activeAgentData.displayName || activeAgentData.id}
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} highlighted={msg.id === highlightedMsgId} />
                  ))}
                </AnimatePresence>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t" style={{ borderColor: "var(--mc-border)" }}>
              {/* Attachment preview strip */}
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {pendingAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="relative group rounded-lg border overflow-hidden"
                      style={{ borderColor: "var(--mc-border)", backgroundColor: "var(--mc-surface)" }}
                    >
                      {att.preview ? (
                        <img
                          src={att.preview}
                          alt={att.file.name}
                          className="w-20 h-20 object-cover"
                        />
                      ) : (
                        <div className="w-20 h-20 flex flex-col items-center justify-center gap-1 px-1">
                          <FileText className="w-5 h-5" style={{ color: "var(--mc-muted)" }} />
                          <span
                            className="text-[9px] text-center truncate w-full"
                            style={{ color: "var(--mc-muted)" }}
                          >
                            {att.file.name}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => removePendingAttachment(att.id)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <div
                        className="absolute bottom-0 left-0 right-0 text-[8px] text-center py-0.5"
                        style={{ backgroundColor: "rgba(0,0,0,0.5)", color: "white" }}
                      >
                        {formatFileSize(att.file.size)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div
                className="flex items-end gap-2 rounded-xl border p-2"
                style={{
                  backgroundColor: "var(--mc-surface)",
                  borderColor: "var(--mc-border)",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!gwReady}
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30"
                  style={{ color: "var(--mc-muted)" }}
                  title="Attach files"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={
                    gwReady
                      ? isStreaming
                        ? "Type \"stop\" to cancel, or send to queue..."
                        : "Send a message..."
                      : gwDeploying
                        ? "Gateway is being set up..."
                        : "Connecting..."
                  }
                  disabled={!gwReady}
                  rows={1}
                  className="flex-1 resize-none bg-transparent outline-none text-sm py-1.5 px-2 max-h-32"
                  style={{ color: "var(--mc-text)" }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = Math.min(target.scrollHeight, 128) + "px";
                  }}
                />
                {isStreaming ? (
                  <Button
                    onClick={handleStop}
                    size="sm"
                    className="rounded-lg h-8 w-8 p-0 flex-shrink-0"
                    style={{ backgroundColor: "#ef4444" }}
                    title="Stop responding (Esc)"
                  >
                    <Square className="w-3 h-3 text-white fill-white" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSend}
                    disabled={(!input.trim() && pendingAttachments.length === 0) || !gwReady}
                    size="sm"
                    className="rounded-lg h-8 w-8 p-0 flex-shrink-0"
                    style={{ backgroundColor: "var(--mc-accent)" }}
                  >
                    <Send className="w-3.5 h-3.5 text-white" />
                  </Button>
                )}
              </div>
              {isStreaming && input.trim() && !STOP_WORDS.has(input.trim().toLowerCase()) && (
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
              Agent Chat
            </h2>
            <p className="text-sm max-w-md text-center" style={{ color: "var(--mc-muted)" }}>
              {agents.length === 0
                ? "Create an agent first, then come back to chat with it."
                : "Select an agent from the sidebar to start chatting."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message, highlighted = false }: { message: ChatMessage; highlighted?: boolean }) {
  const isUser = message.role === "user";
  const isQueued = message.status === "queued";
  const isError = message.status === "error";
  const isStreaming = message.status === "streaming";
  const attachments = message.attachments || [];

  return (
    <motion.div
      id={`msg-${message.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} ${highlighted ? "notification-highlight" : ""}`}
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
        {/* Attachments above message content */}
        {attachments.length > 0 && (
          <div className={`flex flex-wrap gap-2 mb-2 ${isUser ? "justify-end" : ""}`}>
            {attachments.map((att, i) => (
              <AttachmentPreview key={i} attachment={att} isUser={isUser} />
            ))}
          </div>
        )}

        <div
          className={`inline-block rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser ? "rounded-tr-sm" : "rounded-tl-sm"
          }`}
          style={{
            backgroundColor: isUser
              ? isQueued
                ? "var(--mc-surface)"
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
            isUser ? (
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
            ) : (
              <MarkdownRenderer content={message.content} className="text-sm" />
            )
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

function AttachmentPreview({
  attachment,
  isUser,
}: {
  attachment: ChatAttachment;
  isUser: boolean;
}) {
  const isPending = attachment.status === "pending";
  const isImage = isImageMime(attachment.mimeType);

  if (isImage && (attachment.base64 || attachment.url)) {
    return (
      <div
        className="rounded-lg overflow-hidden border relative"
        style={{ borderColor: "var(--mc-border)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.base64 || attachment.url}
          alt={attachment.filename}
          className="max-h-64 max-w-xs object-contain"
          style={{ minWidth: 80 }}
        />
        {isPending && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          >
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
        )}
      </div>
    );
  }

  // Non-image file chip
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-3 py-2"
      style={{
        borderColor: "var(--mc-border)",
        backgroundColor: isUser ? "rgba(255,255,255,0.1)" : "var(--mc-bg)",
      }}
    >
      <FileIcon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />
      <div className="min-w-0">
        <p
          className="text-xs font-medium truncate max-w-[160px]"
          style={{ color: isUser ? "white" : "var(--mc-text)" }}
        >
          {attachment.filename}
        </p>
        <p className="text-[10px]" style={{ color: isUser ? "rgba(255,255,255,0.6)" : "var(--mc-muted)" }}>
          {formatFileSize(attachment.size)}
        </p>
      </div>
      {attachment.url && (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0"
          title="Download"
        >
          <Download className="w-3.5 h-3.5" style={{ color: isUser ? "rgba(255,255,255,0.7)" : "var(--mc-muted)" }} />
        </a>
      )}
      {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: "var(--mc-muted)" }} />}
    </div>
  );
}
