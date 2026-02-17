import { getStorageRuntimeConfig } from "@/lib/env.server";
import { LocalStorageProvider } from "@/lib/storage/local-storage-provider";
import { R2StorageProvider } from "@/lib/storage/r2-storage-provider";
import type { StorageProvider } from "@/lib/storage/types";

let cachedStorageProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cachedStorageProvider) {
    return cachedStorageProvider;
  }

  const config = getStorageRuntimeConfig();

  if (config.provider === "r2" && config.r2) {
    cachedStorageProvider = new R2StorageProvider({
      accountId: config.r2.accountId,
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
      bucketName: config.r2.bucketName,
      signedUrlTtlSeconds: config.r2.signedUrlTtlSeconds,
    });
    return cachedStorageProvider;
  }

  cachedStorageProvider = new LocalStorageProvider();
  return cachedStorageProvider;
}

