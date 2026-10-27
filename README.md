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
cp src/bootstrap/personalProfile.example.ts src/bootstrap/personalProfile.ts
```

`.env` にOpenAI APIキー、天気を知りたい地点の緯度・経度、Google認証情報のパスを設定します。`.env` と `.secrets/` はGit管理されません。

勤務曜日や今後追加する個人的な案内ルールは、`src/bootstrap/personalProfile.ts` に設定します。このファイルはGit管理されません。公開リポジトリには、雛形の [personalProfile.example.ts](src/bootstrap/personalProfile.example.ts) だけを含めます。`scheduleRules` では、朝に読み上げない予定、略称の言い換え、絵文字で表した予定の補助情報を設定できます。絵文字の意味はタイトルやメモより弱い情報として扱われます。

`dailyRoutine.commute.segments` に通勤区間とJR東日本または東京メトロの対象路線公式URLを設定すると、出社日だけ運行情報を確認します。遅延・運休などがある場合だけ原稿に含め、平常運転は読み上げません。取得失敗や更新時刻が古い場合は正常とみなさず、公式情報を確認できなかったことを伝えます。この案内は公式アプリや駅の案内を置き換えるものではありません。

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

SPEECH_ENGINE=openai の通常の読み上げは、GPT-Liveの `gpt-live-1` と日本語音声 `harema` を使います。試聴で調整した穏やかな口調・自然な間・挨拶の明瞭な発音を `src/bootstrap/liveSpeechProfile.ts` で管理します。個人の固有名詞の読みはGit管理しない `src/bootstrap/personalProfile.ts` の `speechReadings` に設定し、音声生成の指示へ取り込みます。音声はMP3へ変換したうえで、既存の末尾検査・再生成・締めの補完・時刻待機を通します。

OpenAI TTSの再生プレイヤーは標準でOSに合わせて選びます。macOSでは `afplay`、Linux（Raspberry Piを含む）では `mpg123`、AndroidのTermuxでは `termux-media-player` を使います。Linuxでは事前に `sudo apt install mpg123 ffmpeg` を実行してください。macOSでは `brew install ffmpeg`、AndroidではTermux本体と同じ配布元のTermux:APIアプリをインストールしたうえで、Termuxから `pkg install termux-api ffmpeg` を実行してください。

OpenAI TTSでは生成音声の末尾を検査し、締めが欠けていた場合に限り、時間の許す範囲で全文を最大2回再生成します。すべて欠けた場合でも、一つ前の文まで完全なら、Git管理された `assets/audio/generic-closing-zero-lead.wav` を自然な文間へ調整して連結します。生成音声・生成側の文字起こし・音声末尾の独立した文字起こし・モデル名を含む判定結果は、認証情報を含まないローカル診断データとして `~/.local/state/ohayo-bot/tts/` に権限を制限して保存され、14日を過ぎた実行分は次回生成時に削除されます。原稿には個人的な予定が含まれ得るため、このディレクトリを公開したりGitへ追加したりしないでください。

Cronより少し前に生成を始め、指定時刻まで再生を待つ場合は、そのCronプロセスだけに `SPEECH_PLAY_AT=08:30` を設定します。手動実行では未設定のままにすると、準備が完了次第すぐ再生します。

AndroidのTermuxで毎朝8:30に再生する場合は、Git管理されたランナーを配置して、2分前にCronを起動します。Termuxの最小Cron環境でもNode.jsのshebangを解決できるよう、ランナーが `LD_PRELOAD` を設定します。成功時の詳細ログは削除し、失敗時は `~/.local/state/ohayo-bot/current-run.log` に権限600で残します。

```bash
install -m 700 scripts/run-ohayo-bot-cron "$HOME/bin/run-ohayo-bot-cron"
(crontab -l 2>/dev/null | grep -v 'run-ohayo-bot-cron'; printf '%s\n' '28 8 * * * /data/data/com.termux/files/home/bin/run-ohayo-bot-cron') | crontab -
```

Cron・SSH・再生サービスと監視をまとめて配置し直す場合は、Android上で次を実行します。既存の対象スクリプトとcrontabは端末内へバックアップし、無関係なCronエントリは残します。アプリ本体のビルド・配備は別途必要です。

```sh
sh scripts/install-ohayo-services
~/bin/start-ohayo-services
termux-job-scheduler --job-id 830 --script "$HOME/bin/watch-ohayo-services" \
  --period-ms 900000 --persisted true --network none --battery-not-low false
```

Termux:Bootはインストール後に一度開き、Termux・Termux:API・Termux:Bootを電池最適化の対象外にします。起動時と約15分間隔の永続JobSchedulerでは監視ループそのものをTermuxのバックグラウンドタスクとして実行し、5分ごとのCronからもループの停止を補います。ループはrunitとは独立して約1分ごとにサービスを確認し、停止したループ自体もCron／JobSchedulerから再作成します。JobSchedulerはネット接続を起動条件にせず、正確な時刻の実行はCronが担当します。Androidの強制停止やメーカー独自のバックグラウンド制限まで復旧を保証するものではありません。

監視はSSHの実際の鍵交換と、再生HTTPサービスへの再生しないGET要求の応答も確認します。runitの親を失った既知のサービスプロセスを整理してポート競合を防ぎ、再生サービスのログはsvlogdで約1.1MBまでに制限します。復旧・監視ログも1MBを超えたら末尾512KBを残します。実行が重なった場合はロック取得前に音声停止や共有ログの変更を行いません。直前の失敗ログは次の実行時に `~/.local/state/ohayo-bot/last-failed-run.log` へ残します。原稿を含み得るため公開しないでください。

Wi-Fiを変更したら、Androidの接続とインターネット疎通に加え、iPhoneショートカットの接続先IP、Androidの `REMOTE_PLAYBACK_ALLOWED_IP`（iPhone側のIP）を更新します。SSHは標準の8022番・全アドレス待受を使い、固定IPをSSH設定へ埋め込みません。ルーターのDHCP予約でAndroidとiPhoneのIPを固定すると、変更時の作業を減らせます。

### Android端末上での更新とビルド

Termux上でも、Gitから更新して端末内でビルドできます。`.env`、`.secrets/`、`src/bootstrap/personalProfile.ts` はGit管理されないため、初回クローン後に端末へ配置し、そのまま保持してください。

```bash
cd ~/ohayo-bot
git pull --ff-only
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
```

Termux版Node.jsでは、esbuildのインストール時検証がAndroidの実行方法と合わないため、依存関係の取得に `--ignore-scripts` を付けます。本番用ビルドはTypeScriptコンパイラだけを使うため、`dist` の生成と `pnpm start` には影響しません。TypeScriptはAndroidでも動作する純JavaScript版の5.9.3に固定し、メモリの少ない端末でもビルドできるよう `pnpm build` のヒープ上限を1.5GBに設定しています。

`tsx`、Vitest、esbuildを使う開発・テストはMacで実行してください。Android端末はpull、依存関係の取得、本番ビルド、実行を担当する運用を推奨します。Macの `node_modules` はAndroidへコピーしないでください。

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

文章生成のモデル・原稿ルールは [briefingProfile.ts](src/bootstrap/briefingProfile.ts)、採用音声のモデル・声・話し方は [liveSpeechProfile.ts](src/bootstrap/liveSpeechProfile.ts) でGit管理します。原稿生成は `gpt-6-luna` の推論 `low`、推論と本文を合わせた出力上限は4096トークンです。生成が未完了の場合は途中の文章を読み上げず、エラーにします。現在の採用ボイスは `harema` です。旧TTS・Realtimeの比較用設定は [speechProfile.ts](src/bootstrap/speechProfile.ts) に残しています。

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
- `src/infrastructure`: Google、Open-Meteo、OpenAI、OSごとの音声再生の実装
- `src/bootstrap`: `.env` と依存関係の組み立て
- `src/cli`: コマンド引数の処理

`Speaker` という境界を設けているため、macOS `say` とOpenAI TTSを切り替えられます。将来はVOICEVOXなども追加できます。

## エラーメール通知

`.env.example` の `ERROR_REPORT_*` 設定を `.env` に設定します。送信先は、たとえば送信者のGmailアドレスに `+ohayo-bot` を付けたアドレスです。Google CloudでGmail APIを有効にし、`pnpm auth:mail` を実行して送信者のGoogleアカウントでメール送信を許可してください。カレンダーとは別のトークンを保存します。Androidにも設定と専用トークンの反映が必要です。準備できたら `ERROR_REPORT_EMAIL_ENABLED=true` にします。

通常の朝の実行（`--no-speech` を含む）で、リトライしても残ったエラーを実行終了時に1通にまとめます。電車情報の取得失敗やTTS検査の失敗など、処理を続行できる部分失敗も対象です。リトライで正常復旧した場合は通知しません。通知は音声再生後に行い、予定内容・原稿・認証情報はメールに含めません。AI呼び出しは増えません。

メール送信失敗時は、安全なレポートを `~/.local/state/ohayo-bot/error-reports/` に権限600で保存します。自動再送は行いません。メール失敗は朝の処理の終了結果を変えません。Cronが起動しない、Node.js起動前に失敗する、強制終了するケースは対象外です。認証とサンプルの操作では通知しません。

## AndroidのSSH・Cron監視

端末の `~/bin/ensure-ohayo-services` に `scripts/ensure-ohayo-services`、`~/bin/watch-ohayo-services` に `scripts/watch-ohayo-services`、`~/.termux/boot/start-ohayo-services` に `scripts/start-ohayo-services` を権限700で配置します。Termux:Bootから独立した復旧ループを開始し、1分おきに監視します。復旧は排他制御され、複数起動しても重複しません。

監視はPIDの存在だけでなく、監視親の実行ファイル・引数とSSHのローカル応答を確認します。失敗した場合は監視親またはSSHを復旧し、原因と結果を `~/.local/state/ohayo-bot/service-watchdog.log` に記録します。詳細な起動エラーは `service-recovery-errors.log` に残します。監視親をSSHから切り離して起動し、孤立したSSH・Cronを引き継ぐ際には実行ファイルを検証します。

補助としてCronで次を5分おきに実行します。朝のブリーフィングの既存エントリは維持します。

```cron
*/5 * * * * /data/data/com.termux/files/usr/bin/timeout 50 /data/data/com.termux/files/usr/bin/sh /data/data/com.termux/files/home/bin/ensure-ohayo-services cron >/dev/null 2>&1
```

AndroidのJobSchedulerは復旧補助として15分間隔、再起動後も保持、ネットワーク・低バッテリーの制約なしで登録します。JobSchedulerのタイミングは厳密ではないため、毎朝の実行時刻の管理はCronに任せます。

```sh
termux-job-scheduler --script /data/data/com.termux/files/home/bin/ensure-ohayo-services --job-id 830 --period-ms 900000 --persisted true --network none --battery-not-low false
```

手動復旧は `~/.termux/boot/start-ohayo-services` を実行します。状態は `sv status "$PREFIX/var/service/sshd" "$PREFIX/var/service/crond"` と監視ログで確認します。AndroidがTermux全体を強制停止した場合やWi-FiのIPが変わった場合には、この監視だけでは外部からの接続を保証できません。

## iPhoneショートカットからAndroidで即時再生

iOSの「URLの内容を取得」からAndroidへ再生リクエストを送れます。エンドポイントは任意コマンドを受け付けず、`POST /v1/play` のJSON本文が完全一致した場合だけ `run-ohayo-bot-cron --now` を起動します。次の防御をすべて通過する必要があります。

- 送信元IPv4アドレスが `REMOTE_PLAYBACK_ALLOWED_IP` と完全一致する。
- `Content-Type: application/json` で、本文のキーが `action` と `token` だけである。
- `action` が `play`、トークンのSHA-256が設定値と一致する。
- 前回受理から標準3分が経過し、標準1日6回の上限内である。
- 朝の実行を含む既存の排他ロックを取得できる。

トークンは十分に長いランダム値をiPhoneだけに保存し、Androidの `.env` には平文ではなくSHA-256を設定します。リクエスト本文・トークン・原稿はログへ残しません。状態は `~/.local/state/ohayo-bot/remote-playback.json` に権限600で保存され、サービス再起動後も回数制限が続きます。

Androidではビルド後、runitサービスを次のように配置します。

```sh
install -d -m 700 "$PREFIX/var/service/ohayo-remote-playback"
install -m 700 scripts/run-ohayo-remote-playback-service "$PREFIX/var/service/ohayo-remote-playback/run"
sv up "$PREFIX/var/service/ohayo-remote-playback"
```

iPhoneショートカットではURLを `http://<Androidの固定LAN IP>:8765/v1/play`、メソッドをPOST、本文をJSONにして次の辞書を送ります。

```json
{
  "action": "play",
  "token": "iPhoneだけに保存するランダムトークン"
}
```

AndroidとiPhoneはルーターのDHCP予約でIPを固定してください。ポート8765をルーターでインターネットへ転送しないでください。HTTPのためLAN管理者や侵害済み端末からの盗聴可能性は残りますが、送信元IP制限、長いトークン、クールダウン、日次上限により再生の悪用を局所化します。外出先から使う場合はポート公開ではなくVPNを使用します。

## GPT-Live音声の試聴

通常実行と同じHarema設定で、固定原稿だけを音声化できます。

```sh
pnpm voice:live -- --text-file=/absolute/path/sample.txt --output-dir=/absolute/path/new-sample --play
```

保存先は新規ディレクトリを指定します。`sample.wav`・`input.txt`・`transcript.txt`・`profile.json`・`usage.json` をディレクトリ700、ファイル600で保存します。`--play` を外すと保存だけ行います。プロフィールには個人の読み指定が含まれ得るので、試聴データもGitへ追加しないでください。

Liveには音声終了イベントがないため、発話後の約6秒の無音を検知して `session.close` を送り、終了応答と最終使用秒数を確認します。最大90秒で終了し、開始しない・途中切断・終了応答がない・無音だけの出力は失敗として扱います。待機用の冒頭・末尾の無音だけを除去し、文中の間は保ちます。通常実行では生成後に独立した末尾検査も行い、正常に生成できた各試行のセッション使用秒数を診断メタデータへ記録します。Liveは無音を含む接続時間にも課金されます。

原稿は会話モデルに読み上げを指示するため、忠実な発音や全文一致を保証するものではありません。生成側の文字起こしだけでなく、実際の音声も確認してください。この試聴コマンドは天気・予定・ニュースを取得せず、メールを送信しません。

## 旧Realtime音声との比較試聴

`gpt-realtime-2.1-mini` を、原稿を生成し直さず固定テキストで試聴できます。モデルは `src/bootstrap/realtimeSpeechProfile.ts`、声・速度・話し方は `src/bootstrap/speechProfile.ts` で管理します。

```sh
pnpm voice:realtime -- --text-file=/absolute/path/sample.txt --output-dir=/absolute/path/new-sample
```

新規の保存先ディレクトリへ `sample.wav`、`input.txt`、`transcript.txt`、`profile.json` を保存します。ディレクトリは700、ファイルは600に制限し、既存の保存先は上書きしません。原稿と生成側の文字起こしを比較してから再生するには、Macで `afplay /absolute/path/new-sample/sample.wav` を実行します。すぐ再生する場合は生成コマンドへ `--play` を付けてください。

このコマンドはRealtime APIによる音声生成だけを行い、予定・天気の取得、ニュース検索、原稿生成、メール送信は行いません。60秒で生成を打ち切り、未完了の音声は保存しません。通常のTTS経路の音声末尾検査や再生成・締めの連結は試聴には含めていません。`transcript.txt` は生成側の文字起こしであり、音声から独立に認識し直した結果ではありません。

移行先と接続方式は [OpenAI公式のTTS移行案内](https://developers.openai.com/api/docs/guides/text-to-speech) と [RealtimeのWebSocketガイド](https://developers.openai.com/api/docs/guides/realtime-websocket) を参照してください。APIのモデル名を変更するだけでは移行できないため、試聴用の経路を分けています。

## 朝のニュース

`NEWS_ENABLED=true` にすると、興味分野に合う最近のニュースを最大1件追加します。`src/bootstrap/newsProfile.ts` の重みで、音楽・映画・ゲームを優先し、文学・言語・料理・道具・体験も候補に含め、技術は補助的に選びます。個人の地域名・好きな作品やアーティスト・除外したい話題は、Git管理しない `src/bootstrap/personalProfile.ts` の `news.localAreas`・`news.interests`・`news.excludedTopics` に設定します。個人設定がある項目はそちらを優先します。既存プロフィールへ追加する場合は `NewsPreferences` 型を `src/domain/morningNews.ts` から読み込み、型に `news?: NewsPreferences` を追加してください。公開する雛形には具体的な地域名や好みを入れません。

分野名が合うだけでは採用せず、好きな作品・アーティスト・表現との具体的な接点、または聴く・観る・読む・出かける・試すにつながる機会を説明できる話題を選びます。選定理由にもその接点を記載します。

取得には [OpenAI Responses APIのWeb検索](https://developers.openai.com/api/docs/guides/tools-web-search)を使います。検索結果で確認された元記事URLがあり、一般ニュースは公開日が当日から過去3日以内のものを採用します。イベント・特集上映は公開日が古くても、確認済みの開催期間が開催前・開催中なら候補にします。開催開始日・終了日・場所を確認し、終了済みのものや開催期間が不明なものは選びません。良い話題がない日は省略します。追加のAIリクエストは1回で、検索は20秒で打ち切り、失敗時も天気・予定の案内を続けます。

音声には固有名詞を含む80文字以内の短い一文だけを渡します。予定が4件以上ある場合など原稿の目安が45秒を超える朝や、運行情報の案内がある朝には検索を行いません。ニュースを追加した場合の原稿の目安は10秒だけ延ばします。

詳細メールには見出し・要約・選定理由・公開日・元記事URLだけを含め、予定・天気・朝の原稿は含めません。既存の `pnpm auth:mail` による送信専用権限（`gmail.send`）のトークンと `ERROR_REPORT_GOOGLE_*`、`ERROR_REPORT_EMAIL_FROM` を再利用します。受信メールを読む権限や処理は追加しません。宛先は `NEWS_EMAIL_TO`、未指定なら `ERROR_REPORT_EMAIL_TO` を使います。自分宛てのアドレスを設定してください。エラー通知自体の有効・無効とは独立しています。

通常の実行では原稿生成後にニュースメールを1通送り、送信に失敗しても音声を続けます。`--no-speech` ではニュース検索と原稿生成は行いますが、メールを送りません。再生が成功した後に、紹介した記事の見出しとURLを `~/.local/state/ohayo-bot/news-history.json` に直近200件まで保存し、次回の検索で除外します。予定や天気は保存しません。追跡パラメータやフラグメントだけが違う同じ記事も除外します。別媒体の同じイベントを除外する判断はAIが行います。`--no-speech` や再生失敗時は紹介済みとして記録しません。履歴の読込に失敗した場合はニュースを省き、保存失敗の場合はエラーレポートに記録します。履歴は端末ごとに保持します。
