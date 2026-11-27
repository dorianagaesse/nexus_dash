import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const KEY_PATTERN = /^[a-f0-9]{64}$/;
const VALUE_PATTERN = /^[A-Za-z0-9_-]{1,16384}$/;
const KEYCHAIN_SERVICE = "nexusdash-nd-cli";

export function resolveNdHome(overrideHome) {
  const configured = overrideHome ?? process.env.ND_HOME?.trim();
  return configured || join(homedir(), ".nexusdash");
}

// Never pass secret values in process arguments, environment variables, or logs.
function runVaultCommand(file, args, input = "") {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (process.platform === "win32") {
      for (const name of Object.keys(env)) {
        if (name.toLowerCase() === "psmodulepath") {
          delete env[name];
        }
      }
    }
    const child = execFile(
      file,
      args,
      { windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024, env },
      (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout.trim());
        }
      }
    );
    child.stdin.end(input);
  });
}

export function createCliVault(options = {}) {
  const getVaultFolder = () => join(resolveNdHome(options.homeDir), "vault");

  return {
    async write(key, rawValue) {
      const encoded = Buffer.from(String(rawValue), "utf8").toString("base64url");
      if (!KEY_PATTERN.test(key) || !VALUE_PATTERN.test(encoded)) {
        throw new Error("Invalid OS vault entry");
      }

      try {
        if (process.platform === "win32") {
          const encrypted = await runVaultCommand(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "$v=[Console]::In.ReadToEnd(); ConvertTo-SecureString -String $v -AsPlainText -Force | ConvertFrom-SecureString",
            ],
            encoded
          );
          const folder = getVaultFolder();
          await mkdir(folder, { recursive: true, mode: 0o700 });
          await writeFile(join(folder, key), encrypted, { mode: 0o600 });
          return;
        }

        if (process.platform === "darwin") {
          await runVaultCommand(
            "security",
            ["-i"],
            `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${key} -w ${encoded}\n`
          );
          return;
        }

        if (process.platform === "linux") {
          await runVaultCommand(
            "secret-tool",
            [
              "store",
              "--label=NexusDash nd CLI",
              "service",
              KEYCHAIN_SERVICE,
              "binding",
              key,
            ],
            encoded
          );
          return;
        }
      } catch {
        throw new Error(
          "OS credential vault unavailable. Unlock or configure your OS credential vault and retry."
        );
      }

      throw new Error("This platform has no supported OS credential vault");
    },

    async read(key) {
      if (!KEY_PATTERN.test(key)) {
        throw new Error("Invalid OS vault key");
      }

      let encoded;
      if (process.platform === "win32") {
        let encrypted;
        try {
          encrypted = await readFile(join(getVaultFolder(), key), "utf8");
        } catch (error) {
          if (error?.code === "ENOENT") {
            return null;
          }
          throw new Error(
            "OS credential vault unavailable. Unlock or configure your OS credential vault and retry."
          );
        }
        try {
          encoded = await runVaultCommand(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd()); $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}",
            ],
            encrypted
          );
        } catch {
          throw new Error(
            "OS credential vault entry could not be decrypted. Run \"nd login\" in your terminal to reconnect."
          );
        }
      } else if (process.platform === "darwin") {
        try {
          encoded = await runVaultCommand("security", [
            "find-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            key,
            "-w",
          ]);
        } catch {
          return null;
        }
      } else if (process.platform === "linux") {
        try {
          encoded = await runVaultCommand("secret-tool", [
            "lookup",
            "service",
            KEYCHAIN_SERVICE,
            "binding",
            key,
          ]);
        } catch {
          return null;
        }
      } else {
        throw new Error("This platform has no supported OS credential vault");
      }

      if (!encoded || !VALUE_PATTERN.test(encoded)) {
        return null;
      }
      return Buffer.from(encoded, "base64url").toString("utf8");
    },

    async remove(key) {
      if (!KEY_PATTERN.test(key)) {
        return;
      }
      if (process.platform === "win32") {
        await rm(join(getVaultFolder(), key), { force: true });
        return;
      }
      if (process.platform === "darwin") {
        await runVaultCommand("security", [
          "delete-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          key,
        ]).catch(() => {});
        return;
      }
      if (process.platform === "linux") {
        await runVaultCommand("secret-tool", [
          "clear",
          "service",
          KEYCHAIN_SERVICE,
          "binding",
          key,
        ]).catch(() => {});
      }
    },
  };
}
