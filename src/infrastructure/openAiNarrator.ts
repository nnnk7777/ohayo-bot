import OpenAI from "openai";
import type { BriefingNarrator } from "../application/ports.js";
import type { MorningBriefingPlan } from "../domain/morningBriefing.js";

type BriefingProfile = {
  model: string;
  instructions: string;
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
      max_output_tokens: 300,
      reasoning: { effort: "none" },
      text: { verbosity: "medium" },
      instructions: this.profile.instructions,
      input: JSON.stringify(plan),
    });

    return response.output_text;
  }
}
