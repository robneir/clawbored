"use client";

import { File, Loader2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface FileContent {
  type: "text" | "image" | "binary";
  content: string;
  size: number;
  mimeType: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileViewer({
  file,
  filename,
  loading,
}: {
  file: FileContent | null;
  filename: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2
          className="w-5 h-5 animate-spin"
          style={{ color: "var(--mc-muted)" }}
        />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <File
          className="w-8 h-8 mb-3"
          style={{ color: "var(--mc-muted)", opacity: 0.3 }}
        />
        <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
          Select a file to view
        </p>
      </div>
    );
  }

  // Image
  if (file.type === "image") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div
          className="text-xs font-mono px-3 py-1.5 rounded-lg"
          style={{
            backgroundColor: "var(--mc-surface)",
            color: "var(--mc-muted)",
          }}
        >
          {filename} — {formatSize(file.size)}
        </div>
        <img
          src={`data:${file.mimeType};base64,${file.content}`}
          alt={filename}
          className="max-w-full max-h-[500px] rounded-lg object-contain"
          style={{ border: "1px solid var(--mc-border)" }}
        />
      </div>
    );
  }

  // Text content
  if (file.type === "text") {
    const isMarkdown = filename.endsWith(".md");

    if (isMarkdown) {
      return (
        <div>
          <div
            className="text-xs font-mono px-3 py-1.5 rounded-lg mb-3 inline-block"
            style={{
              backgroundColor: "var(--mc-surface)",
              color: "var(--mc-muted)",
            }}
          >
            {filename} — {formatSize(file.size)}
          </div>
          <MarkdownRenderer content={file.content} className="text-sm" />
        </div>
      );
    }

    // Code / text file
    const ext = filename.split(".").pop() || "";
    return (
      <div>
        <div
          className="rounded-lg overflow-hidden"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            border: "1px solid var(--mc-border)",
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-1.5 text-[10px]"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.2)",
              color: "var(--mc-muted)",
            }}
          >
            <span>{filename}</span>
            <span>{formatSize(file.size)}</span>
          </div>
          <pre className="p-3 overflow-x-auto text-xs leading-relaxed font-mono m-0">
            <code style={{ color: "var(--mc-text)" }}>{file.content}</code>
          </pre>
        </div>
      </div>
    );
  }

  // Binary
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <File
        className="w-10 h-10 mb-3"
        style={{ color: "var(--mc-muted)", opacity: 0.3 }}
      />
      <p className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
        {filename}
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--mc-muted)" }}>
        Binary file — {formatSize(file.size)}
      </p>
      <p
        className="text-xs mt-1"
        style={{ color: "var(--mc-muted)", opacity: 0.6 }}
      >
        Cannot preview this file type
      </p>
    </div>
  );
}
