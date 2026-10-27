import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiBriefingNarrator } from "./openAiNarrator.js";
import { getBriefingScenario } from "../domain/briefingScenarios.js";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
const plan = getBriefingScenario("rain");
const profile = { model: "test-model", instructions: "test instructions", reasoningEffort: "low" as const, maxOutputTokens: 4096 };
beforeEach(() => create.mockReset());

describe("briefing narration", () => {
  it("passes the facts unchanged and reserves output space for the configured reasoning effort", async () => {
    create.mockResolvedValue({ status: "completed", output_text: "テスト原稿" });
    const narrator = new OpenAiBriefingNarrator("test-key", profile);
    expect(await narrator.narrate(plan)).toBe("テスト原稿");
    const request = create.mock.calls[0][0];
    expect(request).toMatchObject({ model: profile.model, instructions: profile.instructions, store: false,
      max_output_tokens: 4096, reasoning: { effort: "low" } });
    expect(JSON.parse(request.input)).toEqual(JSON.parse(JSON.stringify(plan)));
  });
  it.each(["incomplete", "failed", "cancelled"])("rejects a partial script when the response is %s", async status => {
    create.mockResolvedValue({ status, output_text: "途中までの原稿" });
    await expect(new OpenAiBriefingNarrator("test-key", profile).narrate(plan)).rejects.toThrow("完了しませんでした");
  });
  it("rejects an empty completed script", async () => {
    create.mockResolvedValue({ status: "completed", output_text: "  " });
    await expect(new OpenAiBriefingNarrator("test-key", profile).narrate(plan)).rejects.toThrow("空の文章");
  });
});
