import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

export interface FileNode {
  name: string;
  path: string; // Relative to workspace root
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
  extension?: string;
}

const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg",
  ".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".rs", ".java",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".swift", ".kt", ".sh", ".bash",
  ".zsh", ".sql", ".html", ".css", ".scss", ".less", ".xml",
  ".svg", ".env", ".gitignore", ".dockerignore", ".editorconfig",
  ".prettierrc", ".eslintrc", ".csv", ".log", ".conf",
]);

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
]);

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".next", ".cache", "dist", ".turbo",
]);

export function isTextFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Files with no extension are often text (Makefile, Dockerfile, etc.)
  if (!ext && !filename.startsWith(".")) return true;
  return false;
}

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(filename).toLowerCase());
}

/**
 * Recursively list the file tree under a workspace directory.
 */
export function listWorkspaceTree(
  workspacePath: string,
  maxDepth = 10
): FileNode[] {
  function walk(dirPath: string, depth: number): FileNode[] {
    if (depth > maxDepth) return [];
    if (!existsSync(dirPath)) return [];

    let entries;
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relPath = relative(workspacePath, fullPath);

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        nodes.push({
          name: entry.name,
          path: relPath,
          type: "directory",
          children: walk(fullPath, depth + 1),
        });
      } else if (entry.isFile()) {
        try {
          const stat = statSync(fullPath);
          nodes.push({
            name: entry.name,
            path: relPath,
            type: "file",
            size: stat.size,
            extension: extname(entry.name).toLowerCase(),
          });
        } catch {
          continue;
        }
      }
    }

    // Directories first, then alphabetical
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return nodes;
  }

  return walk(workspacePath, 0);
}

/**
 * Read file content from a workspace.
 * Returns text content for text files, base64 for images, or metadata for binary.
 */
export function readWorkspaceFile(
  workspacePath: string,
  filePath: string
): { type: "text" | "image" | "binary"; content: string; size: number; mimeType: string } {
  // Security: prevent path traversal
  const resolved = join(workspacePath, filePath);
  if (!resolved.startsWith(workspacePath)) {
    throw new Error("Invalid file path");
  }
  if (!existsSync(resolved)) {
    throw new Error("File not found");
  }

  const stat = statSync(resolved);
  const filename = resolved.split("/").pop() || "";

  if (isImageFile(filename)) {
    const buffer = readFileSync(resolved);
    const ext = extname(filename).toLowerCase().slice(1);
    const mime =
      ext === "svg"
        ? "image/svg+xml"
        : `image/${ext === "jpg" ? "jpeg" : ext}`;
    return {
      type: "image",
      content: buffer.toString("base64"),
      size: stat.size,
      mimeType: mime,
    };
  }

  if (isTextFile(filename)) {
    const MAX_SIZE = 1_000_000; // 1MB
    let content = readFileSync(resolved, "utf-8");
    if (content.length > MAX_SIZE) {
      content = content.slice(0, MAX_SIZE) + "\n\n[File truncated — exceeds 1MB]";
    }
    return {
      type: "text",
      content,
      size: stat.size,
      mimeType: "text/plain",
    };
  }

  // Binary file — metadata only
  return {
    type: "binary",
    content: "",
    size: stat.size,
    mimeType: "application/octet-stream",
  };
}
