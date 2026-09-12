import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

export function desktopEnvironment() {
  let env = { ...process.env };
  if (process.platform === "win32") {
    const vswhere = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft Visual Studio", "Installer", "vswhere.exe");
    if (!existsSync(vswhere)) throw new Error("Install Visual Studio with Desktop development with C++ to build the native app.");
    const discovered = spawnSync(vswhere, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"], { encoding: "utf8", windowsHide: true });
    const installation = discovered.stdout?.trim();
    if (discovered.status !== 0 || !installation) {
      const inventory = spawnSync(vswhere, ["-all", "-products", "*", "-format", "json"], { encoding: "utf8", windowsHide: true });
      if (inventory.status === 0 && JSON.parse(inventory.stdout).some((entry) => entry.isComplete === false)) throw new Error("Visual Studio installation or update is incomplete. Finish that operation before building the native app.");
      throw new Error("Install the Visual Studio Desktop development with C++ workload to build the native app.");
    }
    const vcvars = join(installation, "VC", "Auxiliary", "Build", "vcvars64.bat");
    if (!existsSync(vcvars)) throw new Error("The installed Visual Studio C++ environment is incomplete. Repair the C++ workload.");
    const configured = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `""${vcvars}" >nul && set"`], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true });
    if (configured.status !== 0) throw new Error("Visual Studio could not initialize its C++ build environment.");
    for (const line of configured.stdout.split(/\r?\n/)) {
      const separator = line.indexOf("=");
      if (separator > 0) {
        const name = line.slice(0, separator);
        const previous = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());
        if (previous && previous !== name) delete env[previous];
        env[name] = line.slice(separator + 1);
      }
    }
  }
  const pathName = Object.keys(env).find((name) => name.toLowerCase() === "path") || "PATH";
  env[pathName] = `${join(homedir(), ".cargo", "bin")}${delimiter}${env[pathName] || ""}`;
  return env;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const child = spawn(process.execPath, [join("node_modules", "@tauri-apps", "cli", "tauri.js"), ...process.argv.slice(2)], {
      env: desktopEnvironment(), stdio: "inherit", windowsHide: true,
    });
    child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
    child.on("exit", (code) => { process.exitCode = code ?? 1; });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to start the native build.");
    process.exitCode = 1;
  }
}
