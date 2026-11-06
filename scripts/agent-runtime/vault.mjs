import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Never pass secret values in process arguments, environment variables or logs.
function command(file, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error)
          reject(
            new Error(
              "OS credential vault unavailable. Unlock or configure the OS vault and retry."
            )
          );
        else resolve(stdout.trim());
      }
    );
    child.stdin.end(input);
  });
}

export function createVault() {
  return {
    async write(key, value) {
      if (!/^[a-f0-9]{64}$/.test(key) || !/^[A-Za-z0-9_-]{43}$/.test(value))
        throw new Error("Invalid vault entry");
      if (process.platform === "win32") {
        const encrypted = await command(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$v=[Console]::In.ReadToEnd(); ConvertTo-SecureString -String $v -AsPlainText -Force | ConvertFrom-SecureString",
          ],
          value
        );
        const folder = join(homedir(), ".nexusdash", "vault");
        await mkdir(folder, { recursive: true, mode: 0o700 });
        await writeFile(join(folder, key), encrypted, { mode: 0o600 });
      } else if (process.platform === "darwin") {
        // security's interactive input keeps the password out of argv.
        await command(
          "security",
          ["-i"],
          `add-generic-password -U -s nexusdash-agent -a ${key} -w ${value}\n`
        );
      } else if (process.platform === "linux") {
        await command(
          "secret-tool",
          [
            "store",
            "--label=NexusDash agent runtime",
            "service",
            "nexusdash-agent",
            "binding",
            key,
          ],
          value
        );
      } else
        throw new Error("This platform has no supported OS credential vault");
    },
    async read(key) {
      if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid vault binding");
      let value;
      if (process.platform === "win32") {
        let encrypted;
        try {
          encrypted = await readFile(
            join(homedir(), ".nexusdash", "vault", key),
            "utf8"
          );
        } catch {
          throw new Error(
            "Device binding missing. Run login for this exact project and identity."
          );
        }
        value = await command(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd()); $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}",
          ],
          encrypted
        );
      } else if (process.platform === "darwin") {
        value = await command("security", [
          "find-generic-password",
          "-s",
          "nexusdash-agent",
          "-a",
          key,
          "-w",
        ]);
      } else if (process.platform === "linux") {
        value = await command("secret-tool", [
          "lookup",
          "service",
          "nexusdash-agent",
          "binding",
          key,
        ]);
      } else
        throw new Error("This platform has no supported OS credential vault");
      if (!/^[A-Za-z0-9_-]{43}$/.test(value))
        throw new Error("Device binding missing or invalid. Run login again.");
      return value;
    },
  };
}
