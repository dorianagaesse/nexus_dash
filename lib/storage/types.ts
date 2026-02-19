export interface SaveStorageFileInput {
  scope: "task" | "context-card";
  ownerId: string;
  file: File;
}

export interface SaveStorageFileResult {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
}

export interface GetSignedDownloadUrlInput {
  storageKey: string;
  contentType: string;
  contentDisposition: string;
}

export interface CreateSignedUploadUrlInput {
  scope: "task" | "context-card";
  ownerId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface CreateSignedUploadUrlResult {
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface StoredFileMetadata {
  sizeBytes: number | null;
  mimeType: string | null;
}

export interface StorageProvider {
  saveFile(input: SaveStorageFileInput): Promise<SaveStorageFileResult>;
  readFile(storageKey: string): Promise<Buffer>;
  deleteFile(storageKey: string): Promise<void>;
  getSignedDownloadUrl(input: GetSignedDownloadUrlInput): Promise<string | null>;
  createSignedUploadUrl(
    input: CreateSignedUploadUrlInput
  ): Promise<CreateSignedUploadUrlResult | null>;
  readStoredFileMetadata(storageKey: string): Promise<StoredFileMetadata | null>;
}

