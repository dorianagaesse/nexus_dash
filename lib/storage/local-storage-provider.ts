import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import type {
  GetSignedDownloadUrlInput,
  SaveStorageFileInput,
  SaveStorageFileResult,
  StorageProvider,
} from "@/lib/storage/types";

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

export class LocalStorageProvider implements StorageProvider {
  async saveFile(input: SaveStorageFileInput): Promise<SaveStorageFileResult> {
    const originalName = input.file.name || "file";
    const safeName = sanitizeFilename(originalName);
    const uniquePrefix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const storageKey = `${input.scope}/${input.ownerId}/${uniquePrefix}-${safeName}`;
    const absolutePath = resolveAbsolutePath(storageKey);

    await ensureDirectory(absolutePath);

    const arrayBuffer = await input.file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(absolutePath, buffer);

    return {
      storageKey,
      mimeType: input.file.type || "application/octet-stream",
      sizeBytes: buffer.byteLength,
      originalName,
    };
  }

  async readFile(storageKey: string): Promise<Buffer> {
    const absolutePath = resolveAbsolutePath(storageKey);
    return fs.readFile(absolutePath);
  }

  async deleteFile(storageKey: string): Promise<void> {
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

  async getSignedDownloadUrl(
    _input: GetSignedDownloadUrlInput
  ): Promise<string | null> {
    return null;
  }
}

