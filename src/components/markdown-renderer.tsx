"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function CodeBlock({
  children,
  language,
}: {
  children: string;
  language: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div
      className="relative group my-3 rounded-lg overflow-hidden"
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
        <span>{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          style={{ color: "var(--mc-muted)" }}
        >
          {copied ? (
            <Check className="w-3 h-3" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed font-mono m-0">
        <code style={{ color: "var(--mc-text)" }}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={`mc-prose ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ children, className: codeClassName, ...props }) {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code className="mc-inline-code" {...props}>
                  {children}
                </code>
              );
            }
            const language = codeClassName?.replace("language-", "") || "";
            return (
              <CodeBlock language={language}>
                {String(children).replace(/\n$/, "")}
              </CodeBlock>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--mc-accent)" }}
                className="underline underline-offset-2 hover:opacity-80"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
