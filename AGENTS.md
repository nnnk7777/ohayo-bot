# ohayo-bot 開発ガイド

ohayo-botは、毎朝の天気とGoogle Calendarの予定を短い日本語の朝の原稿にまとめ、音声で届ける個人用ツールである。現在はMacで動かし、将来はRaspberry Piの専用端末へ広げることを想定する。

## 基本方針

- MVPを優先し、必要になるまで抽象化や依存を増やさない。
- TypeScript / ESM / pnpm を使う。実行前後の設定は `src/bootstrap`、外部サービスとの接続は `src/infrastructure`、判断ロジックは `src/domain` に置く。
- APIキー、OAuthトークン、認証JSONはGit管理しない。`.env` と `.secrets/` の内容をログやコミットに含めない。
- 音声の好み（モデル、声、話し方、速度）は秘密情報ではないため、`src/bootstrap/speechProfile.ts` でGit管理する。

## 変更時の確認

コードを変更したら、変更の規模に応じて次を実行する。

```bash
pnpm typecheck
pnpm build
pnpm test
git diff --check
```

OpenAI TTS、Google Calendar、Open-Meteoを呼ぶ実行は外部通信・費用・個人データを伴う。必要な場合だけ実行し、原稿や認証情報を出力へ含めない。

## ユニットテスト方針

テストは早い段階から、外部サービスに依存しない振る舞いを守るために追加する。テストランナーはVitestで、対象モジュールと同じディレクトリに `*.test.ts` を置く。

次の場合はUTを追加または更新する。

- ドメインルールを追加・変更したとき（例: 傘を案内する条件、予定の件数、原稿の長さ）。
- 文字列の正規化・日付や時刻の読み替えなど、入力と出力を明確にできる処理を追加したとき。
- バグを修正したとき。再発する入力をまずテストケースにする。
- アプリケーション層の分岐を増やしたとき（例: `--no-speech`、予定がない場合、失敗時の扱い）。

優先してテストするもの:

- `src/domain`: 入力から朝のブリーフィング計画を作る純粋なルール。
- `src/infrastructure/japaneseSpeechText.ts` のような、外部I/Oを持たない変換関数。
- `src/application`: Provider / Narrator / Speaker をモックした実行順序と分岐。

UTではGoogle、OpenAI、Open-Meteo、`say`、`afplay` を実際に呼ばない。Portをモックして、渡した入力・呼び出し回数・返り値を検証する。外部SDKそのものや単純な配線だけのテストは、壊れやすい独自ロジックがない限り不要。

将来、固定原稿を動的なAI原稿へ戻す場合は、AIの文章そのものを完全一致でテストしない。代わりに、渡す事実データ、予定メモの扱い、空の原稿を拒否する挙動など、アプリ側で保証できる契約をテストする。
