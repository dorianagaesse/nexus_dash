import { getStorageProvider } from "@/lib/storage/storage-provider";

import type { SaveStorageFileInput, SaveStorageFileResult } from "@/lib/storage/types";

interface GetAttachmentDownloadUrlInput {
  storageKey: string;
  contentType: string;
  contentDisposition: string;
}

export async function saveAttachmentFile(
  input: SaveStorageFileInput
): Promise<SaveStorageFileResult> {
  const provider = getStorageProvider();
  return provider.saveFile(input);
}

export async function readAttachmentFile(storageKey: string): Promise<Buffer> {
  const provider = getStorageProvider();
  return provider.readFile(storageKey);
}

export async function deleteAttachmentFile(storageKey: string): Promise<void> {
  const provider = getStorageProvider();
  await provider.deleteFile(storageKey);
}

export async function getAttachmentDownloadUrl(
  input: GetAttachmentDownloadUrlInput
): Promise<string | null> {
  const provider = getStorageProvider();
  return provider.getSignedDownloadUrl({
    storageKey: input.storageKey,
    contentType: input.contentType,
    contentDisposition: input.contentDisposition,
  });
}

