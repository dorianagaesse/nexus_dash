import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

interface SaveAttachmentFileInput {
  scope: "task" | "context-card";
  ownerId: string;
  file: File;
}

interface SaveAttachmentFileResult {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
}

const STORAGE_ROOT = path.join(process.cwd(), "storage", "uploads");

function sanitizeFilename(filename: string): string {
  const normalized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const compact = normalized.replace(/_+/g, "_").replace(/^_+|_+$/g, "");

  if (!compact) {
    return "file";
  }

  return compact.slice(0, 120);
}

function resolveAbsolutePath(storageKey: string): string {
  const normalizedKey = storageKey.replace(/\\/g, "/");
  const absolutePath = path.resolve(STORAGE_ROOT, normalizedKey);
  const normalizedRoot = `${path.resolve(STORAGE_ROOT)}${path.sep}`;

  if (!absolutePath.startsWith(normalizedRoot)) {
    throw new Error("Invalid storage key");
  }

  return absolutePath;
}

async function ensureDirectory(absolutePath: string): Promise<void> {
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
}

export async function saveAttachmentFile({
  scope,
  ownerId,
  file,
}: SaveAttachmentFileInput): Promise<SaveAttachmentFileResult> {
  const originalName = file.name || "file";
  const safeName = sanitizeFilename(originalName);
  const uniquePrefix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const storageKey = `${scope}/${ownerId}/${uniquePrefix}-${safeName}`;
  const absolutePath = resolveAbsolutePath(storageKey);

  await ensureDirectory(absolutePath);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(absolutePath, buffer);

  return {
    storageKey,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: buffer.byteLength,
    originalName,
  };
}

export async function readAttachmentFile(storageKey: string): Promise<Buffer> {
  const absolutePath = resolveAbsolutePath(storageKey);
  return fs.readFile(absolutePath);
}

export async function deleteAttachmentFile(storageKey: string): Promise<void> {
  try {
    const absolutePath = resolveAbsolutePath(storageKey);
    await fs.unlink(absolutePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw error;
    }
  }
}
