import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DateTime } from "luxon";
import { google } from "googleapis";
import type { Schedule } from "../domain/morningBriefing.js";
import type { ScheduleProvider, Today } from "../application/ports.js";

const execFileAsync = promisify(execFile);
const calendarScope = "https://www.googleapis.com/auth/calendar.readonly";

type GoogleCalendarConfig = {
  calendarId: string;
  credentialsPath: string;
  tokenPath: string;
};

type ClientCredentialsFile = {
  installed?: ClientCredentials;
  web?: ClientCredentials;
};

type ClientCredentials = {
  client_id: string;
  client_secret?: string;
};

type OAuthClient = InstanceType<typeof google.auth.OAuth2>;

export class GoogleCalendarScheduleProvider implements ScheduleProvider {
  constructor(private readonly config: GoogleCalendarConfig) {}

  async getSchedules(today: Today): Promise<Schedule[]> {
    const auth = await getAuthorizedClient(this.config);
    const dayStart = DateTime.fromISO(today.date, { zone: today.timeZone }).startOf("day");
    const dayEnd = dayStart.plus({ days: 1 });
    const timeMin = dayStart.toUTC().toISO();
    const timeMax = dayEnd.toUTC().toISO();
    if (!timeMin || !timeMax) {
      throw new Error(`日付またはタイムゾーンが正しくありません: ${today.date} (${today.timeZone})`);
    }
    const calendar = google.calendar({ version: "v3", auth });
    const result = await calendar.events.list({
      calendarId: this.config.calendarId,
      timeMin,
      timeMax,
      timeZone: today.timeZone,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 20,
    });

    return (result.data.items ?? [])
      .filter((event) => event.status !== "cancelled")
      .filter((event) => !event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined"))
      .map((event) => ({
        title: event.summary?.trim() || "名称未設定の予定",
        description: event.description?.trim() || undefined,
        startTime: event.start?.dateTime
          ? DateTime.fromISO(event.start.dateTime).setZone(today.timeZone).toFormat("HH:mm")
          : undefined,
        isAllDay: Boolean(event.start?.date),
      }));
  }
}

export async function authorizeGoogleCalendar(config: GoogleCalendarConfig): Promise<void> {
  const credentials = await loadClientCredentials(config.credentialsPath);
  const state = randomBytes(24).toString("hex");

  await new Promise<void>((resolve, reject) => {
    let client: OAuthClient | undefined;
    let redirectUri = "";
    const server = createServer(async (request, response) => {
      try {
        const callbackUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        if (callbackUrl.pathname !== "/oauth2callback") {
          response.writeHead(404).end();
          return;
        }
        if (callbackUrl.searchParams.get("state") !== state) {
          throw new Error("Google OAuthのstate検証に失敗しました。");
        }
        const error = callbackUrl.searchParams.get("error");
        const code = callbackUrl.searchParams.get("code");
        if (error || !code) {
          throw new Error(`Google OAuthが完了しませんでした: ${error ?? "認可コードがありません"}`);
        }

        if (!client) throw new Error("Google OAuthクライアントを初期化できませんでした。");
        const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
        if (!tokens.refresh_token) {
          throw new Error("更新トークンを取得できませんでした。Googleアカウントのアクセス権を一度削除して、もう一度 pnpm auth を実行してください。");
        }
        await saveToken(config.tokenPath, tokens);
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<p>認証が完了しました。このタブを閉じてターミナルに戻ってください。</p>");
        server.close((closeError) => (closeError ? reject(closeError) : resolve()));
      } catch (error) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("認証に失敗しました。ターミナルのエラーを確認してください。");
        server.close(() => reject(error));
      }
    });

    server.listen(0, "127.0.0.1", async () => {
      try {
        const address = server.address();
        if (!address || typeof address === "string") {
          throw new Error("OAuth用のローカルサーバーを開始できませんでした。");
        }
        redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
        client = new google.auth.OAuth2(
          credentials.client_id,
          credentials.client_secret,
          redirectUri,
        );
        const authUrl = client.generateAuthUrl({
          access_type: "offline",
          prompt: "consent",
          scope: [calendarScope],
          state,
        });
        console.log("ブラウザでGoogle Calendarの読み取りを許可してください。");
        console.log(authUrl);
        await execFileAsync("open", [authUrl]);
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

async function getAuthorizedClient(config: GoogleCalendarConfig): Promise<OAuthClient> {
  const client = await createOAuthClient(config.credentialsPath, "http://127.0.0.1");
  let token: unknown;
  try {
    token = JSON.parse(await readFile(config.tokenPath, "utf8"));
  } catch {
    throw new Error("Google Calendarの認証がまだです。先に pnpm auth を実行してください。");
  }
  if (!hasRefreshToken(token)) {
    throw new Error("Googleの更新トークンが見つかりません。pnpm auth を実行し直してください。");
  }
  client.setCredentials(token);
  return client;
}

async function createOAuthClient(credentialsPath: string, redirectUri: string): Promise<OAuthClient> {
  const credentials = await loadClientCredentials(credentialsPath);
  return new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    redirectUri,
  );
}

async function loadClientCredentials(credentialsPath: string): Promise<ClientCredentials> {
  let parsed: ClientCredentialsFile;
  try {
    parsed = JSON.parse(await readFile(credentialsPath, "utf8")) as ClientCredentialsFile;
  } catch {
    throw new Error(`Google OAuth認証情報を読めません: ${credentialsPath}`);
  }
  const credentials = parsed.installed ?? parsed.web;
  if (!credentials?.client_id) {
    throw new Error("Google OAuth認証情報の形式が正しくありません。デスクトップアプリのJSONを指定してください。");
  }
  return credentials;
}

function hasRefreshToken(token: unknown): token is { refresh_token: string } {
  return (
    typeof token === "object" &&
    token !== null &&
    "refresh_token" in token &&
    typeof token.refresh_token === "string" &&
    token.refresh_token.length > 0
  );
}

async function saveToken(tokenPath: string, token: object): Promise<void> {
  await mkdir(dirname(tokenPath), { recursive: true });
  const temporaryPath = `${tokenPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(token, null, 2), { mode: 0o600 });
  await rename(temporaryPath, tokenPath);
}
