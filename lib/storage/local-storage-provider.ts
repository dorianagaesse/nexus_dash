import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { AttachmentStorageUnavailableError } from "@/lib/storage/errors";
import type {
  CreateSignedUploadUrlInput,
  CreateSignedUploadUrlResult,
  GetSignedDownloadUrlInput,
  SaveStorageFileInput,
  SaveStorageFileResult,
  StoredFileMetadata,
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

function isFilesystemPermissionError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null | undefined)?.code;
  return code === "EROFS" || code === "EACCES" || code === "EPERM";
}

export class LocalStorageProvider implements StorageProvider {
  async saveFile(input: SaveStorageFileInput): Promise<SaveStorageFileResult> {
    const originalName = input.file.name || "file";
    const safeName = sanitizeFilename(originalName);
    const uniquePrefix = `${process.hrtime.bigint()}-${randomUUID().slice(0, 8)}`;
    const storageKey = `${input.scope}/${input.ownerId}/${uniquePrefix}-${safeName}`;
    const absolutePath = resolveAbsolutePath(storageKey);

    let buffer = Buffer.alloc(0);
    try {
      await ensureDirectory(absolutePath);

      const arrayBuffer = await input.file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(absolutePath, buffer);
    } catch (error) {
      if (isFilesystemPermissionError(error)) {
        const originalError = error as NodeJS.ErrnoException;
        throw new AttachmentStorageUnavailableError(
          "Local attachment storage is unavailable in this runtime. Configure STORAGE_PROVIDER=r2 with R2 credentials.",
          {
            cause: originalError,
            filesystemCode: originalError.code,
            filesystemPath:
              typeof originalError.path === "string"
                ? originalError.path
                : undefined,
          }
        );
      }

      throw error;
    }

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

  async createSignedUploadUrl(
    _input: CreateSignedUploadUrlInput
  ): Promise<CreateSignedUploadUrlResult | null> {
    return null;
  }

  async readStoredFileMetadata(storageKey: string): Promise<StoredFileMetadata | null> {
    try {
      const absolutePath = resolveAbsolutePath(storageKey);
      const stats = await fs.stat(absolutePath);

      return {
        sizeBytes: stats.size,
        mimeType: null,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }
}

