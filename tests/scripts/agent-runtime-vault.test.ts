import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

const sandbox = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: () => sandbox.home,
}));

import { createVault } from "../../scripts/agent-runtime/vault.mjs";

test.skipIf(process.platform === "win32" || process.env.ND_NATIVE_VAULT_TEST !== "1")(
  "native Keychain or Secret Service stores, replaces and reads an exact binding",
  async () => {
    const vault = createVault();
    const key = randomBytes(32).toString("hex");
    const first = randomBytes(32).toString("base64url");
    const replacement = randomBytes(32).toString("base64url");
    await vault.write(key, first);
    expect(await vault.read(key)).toBe(first);
    await vault.write(key, replacement);
    expect(await vault.read(key)).toBe(replacement);
    await expect(vault.read(randomBytes(32).toString("hex"))).rejects.toThrow();
  },
  30_000
);

test.skipIf(process.platform !== "win32")(
  "Windows DPAPI stores encrypted credentials and reads them from a PowerShell parent",
  async () => {
    sandbox.home = await mkdtemp(join(tmpdir(), "nd658-vault-"));
    // PowerShell 7 module discovery must not leak into Windows PowerShell.
    vi.stubEnv("PSModulePath", join(sandbox.home, "unavailable-parent-modules"));
    const key = randomBytes(32).toString("hex");
    const value = randomBytes(32).toString("base64url");
    try {
      const vault = createVault();
      await vault.write(key, value);
      const encrypted = await readFile(
        join(sandbox.home, ".nexusdash", "vault", key),
        "utf8"
      );
      expect(encrypted).not.toContain(value);
      expect(await vault.read(key)).toBe(value);
      await expect(vault.read(randomBytes(32).toString("hex"))).rejects.toThrow(
        "Device binding missing"
      );
    } finally {
      vi.unstubAllEnvs();
      await rm(sandbox.home, { recursive: true, force: true });
    }
  },
  20_000
);
