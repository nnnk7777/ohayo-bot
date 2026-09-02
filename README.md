# ohayo-bot

Macで、今日の天気とGoogle Calendarの予定から朝の短い原稿を作り、読み上げる個人用CLIです。

## 必要なもの

- Node.js 20以降
- pnpm
- OpenAI APIキー
- Googleアカウント

## セットアップ

```bash
pnpm install
cp .env.example .env
mkdir -p .secrets
```

`.env` にOpenAI APIキー、天気を知りたい地点の緯度・経度、Google認証情報のパスを設定します。`.env` と `.secrets/` はGit管理されません。

### Google Calendar OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成します。
2. **Google Calendar API** を有効化します。
3. OAuth同意画面を設定します。個人のGoogleアカウントなら `External` を選び、自分をテストユーザーへ追加します。
4. OAuthクライアントを **デスクトップアプリ** として作成し、JSONをダウンロードします。
5. ダウンロードしたJSONを `.secrets/google-credentials.json` に保存します。
6. 認証を実行します。

```bash
pnpm auth
```

ブラウザが開くので、Calendarの読み取り権限を許可してください。認証後の更新トークンは `.secrets/google-token.json` に保存されます。

予定の説明（メモ欄）も朝の原稿の補足情報として使われます。予定名だけでは意味が伝わりにくい場合は、短い事実メモを追加してください。たとえば、予定名を `荷物受取（ヤマト段ボール）`、説明を `ネット注文済み。午前中に届く。` のようにします。説明の内容もOpenAI APIに送られるため、住所・暗証番号・認証情報などは書かないでください。

> OAuth同意画面をTestingのまま使うと、Googleの仕様で認証が約7日後に失効します。自分だけで継続利用する場合は、Googleの案内を確認したうえで公開状態を `In production` にしてください。

## 実行

天気と予定をOpenAI APIへ送り、朝に聞きやすい短い日本語の原稿を作って読み上げます。原稿には、その日の天気や予定に応じた短いしめの一言も含めます。

```bash
pnpm dev
```

標準ではmacOSの `say` を使います。OpenAI TTSを使う場合は、`.env` を次のように設定してください。原稿がOpenAI APIへ送られ、生成音声は一時ファイルから再生されます。

```env
SPEECH_ENGINE=openai
```

OpenAI TTSの再生プレイヤーは標準でOSに合わせて選びます。macOSでは `afplay`、Linux（Raspberry Piを含む）では `mpg123` を使います。Linuxでは事前に `sudo apt install mpg123` を実行してください。

Mac上でLinux用の再生経路を試す場合は、Homebrewで `mpg123` を入れ、`.env` に次を設定します。

```bash
brew install mpg123
```

```env
AUDIO_PLAYER=mpg123
```

音声再生経路だけを確認する場合は、固定原稿を1ボイスで再生します。

```bash
AUDIO_PLAYER=mpg123 pnpm voice:sample -- --voices=marin
```

文章生成のモデル・原稿ルールは [briefingProfile.ts](src/bootstrap/briefingProfile.ts)、音声のモデル・声・速度・話し方は [speechProfile.ts](src/bootstrap/speechProfile.ts) でGit管理します。現在の採用ボイスは `marin` です。

OpenAI TTSへ渡す直前に、月日表記だけを読み上げ向けに正規化します。表示する原稿は変えず、たとえば `9月1日` は `九月一日`、`9月6日` は `九月むいか` として読み上げます。

### 原稿のシナリオ確認

実際の天気・予定を使わず、代表的な入力でOpenAIの原稿を確認できます。標準では音声を再生せず、`rain` シナリオを1回生成します。

```bash
pnpm briefing:sample
```

シナリオには、雨と外出有無、予定多数、予定なし、暑さ・冷え込み・日差し・強風、終日予定、月曜・金曜の予定補足があります。全パターンを試す場合は、シナリオの数だけ原稿生成が行われます。

```bash
pnpm briefing:sample -- --scenario=all
```

原稿に加えて読み上げも試す場合だけ、`--speech` を付けます。

```bash
pnpm briefing:sample -- --scenario=rain --speech
```

シナリオが増えたら、対話モードで番号をカンマ区切りにして条件を複数選択できます。選んだ条件は一つの原稿へまとめられ、生成前に読み上げるかどうかも選べます。たとえば `rain`、`cold`、`busy` を選ぶと、「雨で寒く、予定が多い日」の原稿を確認できます。

```bash
pnpm briefing:sample -- --interactive
```

### 声の比較

`marin` と `sage` 以外の候補を、固定原稿で連続再生できます。デフォルトでは `ash`、`ballad`、`coral`、`cedar` を順に再生します。

```bash
pnpm voice:sample
```

任意の声だけを試す場合は、カンマ区切りで指定します。

```bash
pnpm voice:sample -- --voices=alloy,echo,fable,nova,onyx,shimmer,verse
```

OpenAI TTSで指定できる標準ボイスは、`alloy`、`ash`、`ballad`、`coral`、`echo`、`fable`、`onyx`、`nova`、`sage`、`shimmer`、`verse`、`marin`、`cedar` です。

音声を流さず、原稿だけ確認するには次のようにします。

```bash
pnpm dev -- --no-speech
```

本番向けビルドは次のとおりです。

```bash
pnpm build
pnpm start
```

## 構成

- `src/domain`: 朝に何を伝えるかを決める純粋なルール
- `src/application`: 天気・予定取得から原稿・読み上げまでの順序
- `src/infrastructure`: Google、Open-Meteo、OpenAI、macOS `say` の実装
- `src/bootstrap`: `.env` と依存関係の組み立て
- `src/cli`: コマンド引数の処理

`Speaker` という境界を設けているため、macOS `say` とOpenAI TTSを切り替えられます。将来はVOICEVOXなども追加できます。
