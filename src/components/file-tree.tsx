"use client";

import { useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  FileImage,
  File,
} from "lucide-react";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
  extension?: string;
}

interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp"]);

function FileIcon({ extension }: { extension?: string }) {
  if (extension && IMAGE_EXTS.has(extension)) {
    return <FileImage className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#a855f7" }} />;
  }
  if (extension === ".md") {
    return <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#3b82f6" }} />;
  }
  return <File className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mc-muted)" }} />;
}

function TreeNode({
  node,
  depth,
  expanded,
  toggleExpand,
  selectedPath,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const isDir = node.type === "directory";
  const isOpen = expanded.has(node.path);
  const isSelected = node.path === selectedPath;

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) {
            toggleExpand(node.path);
          } else {
            onSelect(node.path);
          }
        }}
        className="w-full flex items-center gap-1.5 py-1 px-1.5 rounded-md text-left text-xs transition-colors"
        style={{
          paddingLeft: `${depth * 16 + 6}px`,
          backgroundColor: isSelected ? "var(--mc-surface)" : "transparent",
          color: isSelected ? "var(--mc-text)" : "var(--mc-muted)",
        }}
        onMouseEnter={(e) => {
          if (!isSelected)
            e.currentTarget.style.backgroundColor = "var(--mc-surface)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected)
            e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        {isDir ? (
          <>
            <ChevronRight
              className="w-3 h-3 flex-shrink-0 transition-transform"
              style={{
                transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
              }}
            />
            {isOpen ? (
              <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#eab308" }} />
            ) : (
              <Folder className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#eab308" }} />
            )}
          </>
        ) : (
          <>
            <span className="w-3 flex-shrink-0" />
            <FileIcon extension={node.extension} />
          </>
        )}
        <span className="truncate flex-1">{node.name}</span>
        {!isDir && node.size !== undefined && (
          <span
            className="text-[10px] flex-shrink-0 ml-1"
            style={{ color: "var(--mc-muted)", opacity: 0.5 }}
          >
            {formatSize(node.size)}
          </span>
        )}
      </button>

      {isDir && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggleExpand={toggleExpand}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  if (nodes.length === 0) {
    return (
      <div className="text-xs text-center py-8" style={{ color: "var(--mc-muted)" }}>
        Empty workspace
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          toggleExpand={toggleExpand}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
