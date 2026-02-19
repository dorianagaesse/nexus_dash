import { randomUUID } from "crypto";

import {
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  CreateSignedUploadUrlInput,
  CreateSignedUploadUrlResult,
  GetSignedDownloadUrlInput,
  SaveStorageFileInput,
  SaveStorageFileResult,
  StoredFileMetadata,
  StorageProvider,
} from "@/lib/storage/types";

const MIN_SIGNED_URL_TTL_SECONDS = 60;
const MAX_SIGNED_URL_TTL_SECONDS = 3600;

interface R2StorageProviderInput {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  signedUrlTtlSeconds: number;
}

function sanitizeFilename(filename: string): string {
  const normalized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const compact = normalized.replace(/_+/g, "_").replace(/^_+|_+$/g, "");

  if (!compact) {
    return "file";
  }

  return compact.slice(0, 120);
}

function createStorageKey(scope: string, ownerId: string, originalName: string): string {
  const safeName = sanitizeFilename(originalName || "file");
  const uniquePrefix = `${process.hrtime.bigint()}-${randomUUID().slice(0, 8)}`;
  return `${scope}/${ownerId}/${uniquePrefix}-${safeName}`;
}

function clampSignedUrlTtl(value: number): number {
  return Math.min(
    Math.max(value, MIN_SIGNED_URL_TTL_SECONDS),
    MAX_SIGNED_URL_TTL_SECONDS
  );
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const namedError = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    namedError.name === "NotFound" ||
    namedError.Code === "NotFound" ||
    namedError.$metadata?.httpStatusCode === 404
  );
}

export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  private readonly bucketName: string;

  private readonly signedUrlTtlSeconds: number;

  constructor(input: R2StorageProviderInput) {
    this.bucketName = input.bucketName;
    this.signedUrlTtlSeconds = clampSignedUrlTtl(input.signedUrlTtlSeconds);
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${input.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async saveFile(input: SaveStorageFileInput): Promise<SaveStorageFileResult> {
    const originalName = input.file.name || "file";
    const storageKey = createStorageKey(input.scope, input.ownerId, originalName);
    const buffer = Buffer.from(await input.file.arrayBuffer());
    const mimeType = input.file.type || "application/octet-stream";

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.byteLength,
      })
    );

    return {
      storageKey,
      mimeType,
      sizeBytes: buffer.byteLength,
      originalName,
    };
  }

  async readFile(storageKey: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      })
    );

    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error("Attachment file body is empty");
    }

    return Buffer.from(bytes);
  }

  async deleteFile(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      })
    );
  }

  async getSignedDownloadUrl(
    input: GetSignedDownloadUrlInput
  ): Promise<string | null> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: input.storageKey,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: input.contentDisposition,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: this.signedUrlTtlSeconds,
    });
  }

  async createSignedUploadUrl(
    input: CreateSignedUploadUrlInput
  ): Promise<CreateSignedUploadUrlResult | null> {
    const storageKey = createStorageKey(
      input.scope,
      input.ownerId,
      input.originalName || "file"
    );

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: input.mimeType || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.signedUrlTtlSeconds,
    });

    return {
      storageKey,
      uploadUrl,
      method: "PUT",
      headers: {
        "Content-Type": input.mimeType || "application/octet-stream",
      },
      expiresInSeconds: this.signedUrlTtlSeconds,
    };
  }

  async readStoredFileMetadata(storageKey: string): Promise<StoredFileMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        })
      );

      return {
        sizeBytes:
          typeof result.ContentLength === "number" ? result.ContentLength : null,
        mimeType: result.ContentType ?? null,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }
}

