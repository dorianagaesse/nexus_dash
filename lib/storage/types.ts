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

export interface StorageProvider {
  saveFile(input: SaveStorageFileInput): Promise<SaveStorageFileResult>;
  readFile(storageKey: string): Promise<Buffer>;
  deleteFile(storageKey: string): Promise<void>;
  getSignedDownloadUrl(input: GetSignedDownloadUrlInput): Promise<string | null>;
}

