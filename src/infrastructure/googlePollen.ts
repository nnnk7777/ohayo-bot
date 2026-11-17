import type { PollenProvider, Today } from "../application/ports.js";
import { parsePollenForecast } from "../domain/pollen.js";

export class GooglePollenProvider implements PollenProvider {
  constructor(
    private readonly apiKey: string,
    private readonly location: { latitude: number; longitude: number },
  ) {}

  async getForecast(today: Today) {
    const params = new URLSearchParams({
      "location.latitude": String(this.location.latitude),
      "location.longitude": String(this.location.longitude),
      days: "1", languageCode: "ja", plantsDescription: "false",
    });
    // キーをURL・例外本文に含めない。送信先は固定し、リダイレクトもしない。
    try {
      const response = await fetch(`https://pollen.googleapis.com/v1/forecast:lookup?${params}`, {
        headers: { "X-Goog-Api-Key": this.apiKey },
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("花粉APIの取得に失敗しました。");
      return parsePollenForecast(await response.json(), today.date);
    } catch {
      throw new Error("花粉予報を取得または解析できませんでした。");
    }
  }
}
