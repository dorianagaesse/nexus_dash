import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const CLI_PACKAGE_FILES: ReadonlyArray<{
  relativePath: string;
  executable?: boolean;
}> = [
  { relativePath: "package.json" },
  { relativePath: "README.md" },
  { relativePath: "bin/nd.mjs", executable: true },
  { relativePath: "src/cli.mjs" },
  { relativePath: "src/profiles.mjs" },
  { relativePath: "src/runtime.mjs" },
  { relativePath: "src/vault.mjs" },
];

function writeOctal(
  buffer: Buffer,
  offset: number,
  length: number,
  value: number
): void {
  const encoded = value.toString(8).padStart(length - 1, "0");
  buffer.write(encoded, offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

function createTarHeader(
  archivePath: string,
  size: number,
  mode: number
): Buffer {
  const header = Buffer.alloc(512, 0);
  header.write(archivePath, 0, Math.min(archivePath.length, 100), "utf8");
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  // Fixed mtime keeps archive output deterministic across instances.
  writeOctal(header, 136, 12, 1_700_000_000);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  header.write("ustar", 257, 5, "ascii");
  header.write("00", 263, 2, "ascii");

  let checksum = 0;
  for (let index = 0; index < 512; index += 1) {
    checksum += header[index]!;
  }
  const checksumOctal = checksum.toString(8).padStart(6, "0");
  header.write(checksumOctal, 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

let cachedBundle: Buffer | null = null;

export async function buildNdCliTarball(): Promise<Buffer> {
  if (cachedBundle && process.env.NODE_ENV === "production") {
    return cachedBundle;
  }

  const chunks: Buffer[] = [];
  for (const entry of CLI_PACKAGE_FILES) {
    const fullPath = path.join(
      process.cwd(),
      "packages",
      "nd-cli",
      entry.relativePath
    );
    const content = await readFile(fullPath);
    const archivePath = `package/${entry.relativePath}`;
    const header = createTarHeader(
      archivePath,
      content.length,
      entry.executable ? 0o755 : 0o644
    );
    chunks.push(header, content);
    const remainder = content.length % 512;
    if (remainder > 0) {
      chunks.push(Buffer.alloc(512 - remainder, 0));
    }
  }

  chunks.push(Buffer.alloc(1024, 0));
  const tarball = gzipSync(Buffer.concat(chunks), { level: 9 });
  if (process.env.NODE_ENV === "production") {
    cachedBundle = tarball;
  }
  return tarball;
}
