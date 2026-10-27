import OpenAI from "openai";
import type { BriefingNarrator } from "../application/ports.js";
import type { MorningBriefingPlan } from "../domain/morningBriefing.js";

type BriefingProfile = {
  model: string;
  instructions: string;
  reasoningEffort?: "none" | "low";
  maxOutputTokens?: number;
};

export class OpenAiBriefingNarrator implements BriefingNarrator {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly profile: BriefingProfile,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async narrate(plan: MorningBriefingPlan): Promise<string> {
    const response = await this.client.responses.create({
      model: this.profile.model,
      store: false,
      max_output_tokens: this.profile.maxOutputTokens ?? 600,
      reasoning: { effort: this.profile.reasoningEffort ?? "none" },
      text: { verbosity: "medium" },
      instructions: this.profile.instructions,
      input: JSON.stringify(plan),
    });

    if (response.status !== "completed") throw new Error("原稿生成が完了しませんでした。");
    if (!response.output_text.trim()) throw new Error("原稿生成で空の文章が返されました。");
    return response.output_text;
  }
}
