import { spawn } from "node:child_process";
import type { Speaker } from "../application/ports.js";

export class MacSaySpeaker implements Speaker {
  async speak(text: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const process = spawn("say", [text], { stdio: "inherit" });
      process.once("error", reject);
      process.once("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`say コマンドが終了コード ${code ?? "unknown"} で失敗しました。`));
      });
    });
  }
}
