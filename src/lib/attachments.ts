import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getMcDir } from "./mc-state";

const ATTACHMENTS_DIR = join(getMcDir(), "attachments");
const INDEX_FILE = join(ATTACHMENTS_DIR, "index.json");

export interface Attachment {
  id: number;
  agentId: string;
  messageId: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  createdAt: string;
}

export interface UploadResult {
  storagePath: string;
  url: string;
  attachment: Attachment;
}

interface AttachmentIndex {
  nextId: number;
  records: Attachment[];
}

function readIndex(): AttachmentIndex {
  if (!existsSync(INDEX_FILE)) return { nextId: 1, records: [] };
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf-8"));
  } catch {
    return { nextId: 1, records: [] };
  }
}

function writeIndex(index: AttachmentIndex): void {
  mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * Upload a file to local filesystem and record it in the index.
 */
export async function uploadAttachment(
  agentId: string,
  messageId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<UploadResult> {
  const storagePath = `${agentId}/${messageId}/${filename}`;
  const fullPath = join(ATTACHMENTS_DIR, storagePath);

  // Write file to disk
  mkdirSync(join(ATTACHMENTS_DIR, agentId, messageId), { recursive: true });
  writeFileSync(fullPath, buffer);

  // Record in index
  const index = readIndex();
  const id = index.nextId++;
  const attachment: Attachment = {
    id,
    agentId,
    messageId,
    filename,
    mimeType,
    size: buffer.length,
    storagePath,
    createdAt: new Date().toISOString(),
  };
  index.records.push(attachment);
  writeIndex(index);

  return {
    storagePath,
    url: `/api/chat/attachments?download=${encodeURIComponent(storagePath)}`,
    attachment,
  };
}

/**
 * Get attachments for a specific message.
 */
export async function getMessageAttachments(
  messageId: string
): Promise<Attachment[]> {
  const index = readIndex();
  return index.records
    .filter((r) => r.messageId === messageId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Get all attachments for an agent (for history loading).
 */
export async function getAgentAttachments(
  agentId: string
): Promise<Attachment[]> {
  const index = readIndex();
  return index.records
    .filter((r) => r.agentId === agentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Get the local file path for a stored attachment.
 * Returns a local API URL for downloading.
 */
export async function getAttachmentUrl(
  storagePath: string
): Promise<string> {
  const fullPath = join(ATTACHMENTS_DIR, storagePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Attachment not found: ${storagePath}`);
  }
  return `/api/chat/attachments?download=${encodeURIComponent(storagePath)}`;
}

/**
 * Read an attachment file from disk. Used by the download API route.
 */
export function readAttachmentFile(storagePath: string): {
  buffer: Buffer;
  mimeType: string;
  filename: string;
} | null {
  // Prevent path traversal
  const fullPath = join(ATTACHMENTS_DIR, storagePath);
  if (!fullPath.startsWith(ATTACHMENTS_DIR)) return null;
  if (!existsSync(fullPath)) return null;

  const buffer = readFileSync(fullPath);
  const filename = storagePath.split("/").pop() || "file";

  // Look up mime type from index
  const index = readIndex();
  const record = index.records.find((r) => r.storagePath === storagePath);
  const mimeType = record?.mimeType || "application/octet-stream";

  return { buffer, mimeType, filename };
}
