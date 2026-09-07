import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type OpenUrlCommand = {
  command: "open" | "xdg-open" | "termux-open-url";
  args: string[];
};

export function resolveOpenUrlCommand(url: string, platform: NodeJS.Platform): OpenUrlCommand {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "linux") return { command: "xdg-open", args: [url] };
  if (platform === "android") return { command: "termux-open-url", args: [url] };
  throw new Error(`ブラウザ起動に対応していないOSです: ${platform}`);
}

export async function openUrl(url: string): Promise<void> {
  const { command, args } = resolveOpenUrlCommand(url, process.platform);
  await execFileAsync(command, args);
}
