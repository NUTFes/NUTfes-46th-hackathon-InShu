# 隠酒（インシュ）

公式広報の写真を確認し、写り込みを加工するローカル実行可能なアプリです。詳細設計10章の手順1〜5を実装しています。

## セットアップ（PowerShell）

Node.js 22 と pnpm 10.23 を使用します。`times/` と同じ依存バージョンをロックしています（Next.js 16.4.6、React 19.3.1、OpenNext 1.20.17、Drizzle 0.44.7）。

```powershell
Set-Location 'C:\Users\kamij\Documents\NUT\NUTFES\nutmeg-hackathon-2026\inshu'
Copy-Item .dev.vars.example .dev.vars
pnpm install
pnpm db:migrate:local
pnpm db:seed
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

http://localhost:3000 を開き、「開発ログイン」で架空の広報担当を選びます。シードは担当3人（責任者1人）と初期基準5件を作ります。再実行しても既存データを上書きしません。D1/R2 は `.wrangler/state/v3/` に保存されます。マイグレーションは必ず `--local` を使います。

pnpm が PATH にないこのリポジトリの環境では、各 `pnpm` を `& ../.tools/node_modules/.bin/pnpm.cmd` に置き換えられます。

## 環境変数

`.dev.vars` はローカル専用です。

| 変数 | 用途 |
|---|---|
| `SESSION_SECRET` | 32文字以上のセッション署名用の秘密 |
| `DEV_LOGIN` | `1` で開発用ユーザー切替を表示 |
| `APP_ENV` | ローカルでは `local`。開発ログインはさらに `NODE_ENV=development` が必要 |
| `GEMINI_API_KEY` | 未設定なら外部送信しないオフラインモード |
| `GEMINI_DETECT_MODEL` | 判定モデル。初期値 `gemini-2.5-flash` |
| `GEMINI_EDIT_MODEL` | 画像編集モデル。初期値 `gemini-2.5-flash-image` |
| `REPLACE_DAILY_LIMIT` | 1人1日あたり置き換え回数。初期値100、日付はJST |

Bindings は D1 `DB`、R2 `PHOTOS`。`wrangler.jsonc` の ID はローカル用プレースホルダーです。`pnpm build:worker` は OpenNext による Worker パッケージ生成、`pnpm preview` はローカルプレビュー用です。今回の検証ではリモートへの接続・デプロイ・実 Gemini 呼び出しは実施していません。Slack OIDC の設定方法は下記を参照してください。

## オフラインで試す

1. `GEMINI_API_KEY` を設定せず、開発ログインします。
2. `/` で写真を20枚まで選びます。ブラウザで長辺2048pxに縮小してJPEGに再エンコードし、EXIFを落とします。JPEG/PNGに対応し、HEICはブラウザがデコードできる場合のみ利用できます。変換できない場合はエラーで案内します。
3. チェック結果の画面で、ブラウザが最大2並列で判定します。オフラインの枠は画像のハッシュに基づくダミーで、実際の写り込みを認識しません。
4. 写真の枠を選び、「ジュースにする」で枠をオレンジ色に着色、「ぼかす」でブラウザ内のキャンバスによるモザイクぼかしを保存します。お酒もぼかせるため、日次上限後の代替にできます。
5. 誤検出の除外・復元、ドラッグによる枠追加、1つ前の加工への復元、比較スライダー、JPEG・一括ZIPダウンロードを試せます。加工・枠の状態が変わるとスナップショットの重みでリスクを再計算します。

実AIモードでは、判定に有効な基準を渡してJSON出力を検証し、未知の基準は捨てます。失敗は最大3回で打ち切り、再試行できます。置き換えは現在の画像を入力にし、出力を元の寸法のJPEGに統一します。失敗時は使用回数を戻します。実サービスへの疎通は未検証です。

## 権限と履歴

- 署名付きHttpOnly/Secure/SameSite=Lax CookieとD1で30日セッションを管理。在籍中の担当のみ利用できます。
- 元画像は本人限定。加工済みのcurrentは全担当が閲覧可能です。未加工currentから別担当に元画像を返すこともありません。
- バッチの閲覧、判定・加工・枠修正は本人限定です。全変更APIでOriginを確認します。責任者向けガードも用意しています。
- 同時アップロードでも宣言枚数を超えず、同時加工でも日次上限を超えないようD1の条件付き更新を使用します。
- editsに直前の画像と枠状態を保存し、復元操作も履歴に残します。再判定は現在の画像に対して実施し、以前の加工の復元履歴を閉じます。
- R2の加工キーは衝突しない `edit-{UUID}.jpg` を使用します（設計の `edit-{n}.jpg` からの変更）。
- 保存期限を過ぎた画像へのアクセスは410で拒否します。ギャラリーは全員の加工済み写真を表示し、本人のみ比較モーダルで元画像を表示できます。責任者は基準と担当を管理できます。基準変更は次の判定から反映され、既存の判定スナップショットは維持します。担当の在籍解除はセッションを失効させます。自分自身の在籍・責任者権限は解除できません。

## 検証

`pnpm test` はリスク計算、JSON検証、飲み物名の正規化、画像権限、状態遷移、セッション、オフライン加工、Geminiの失敗・再試行（fetchモック）を確認します。

開発サーバーをポート3200で起動すると、リポジトリ内のplaywright-coreとChromeを使って実画面も検証できます。

```powershell
Set-Location 'C:\Users\kamij\Documents\NUT\NUTFES\nutmeg-hackathon-2026\inshu'
pnpm dev --port 3200
```

別のターミナルで：

```powershell
Set-Location 'C:\Users\kamij\Documents\NUT\NUTFES\nutmeg-hackathon-2026\inshu'
node scripts/smoke.cjs
pnpm exec tsx scripts/verify-limits.ts
```

`INSHU_URL` で接続先、`CHROME_PATH` でChromeの実行パスを変更できます。画像はテストで生成した架空の素材だけを使用します。`smoke.cjs` はアップロード・判定・置換・ぼかし・比較・ダウンロード・復元・手動枠・他担当のアクセス制限・モバイルの横はみ出しを検証し、`.wrangler/verification/` に画像を保存します。`verify-limits.ts` は加工前409・日次上限429・同時加工時の上限を検証します。いずれもローカルにサンプル写真が残り、上限検証用のusageとセッションは終了時に元へ戻します。

### この制限付きWindows環境での補助設定

OSのユーザー情報APIが `uv_os_get_passwd ENOMEM` を返す場合は、既存のリポジトリ内補助スクリプトを使用できます。Wranglerの設定・ログも作業フォルダ内へ指定します。ユーザーの設定ファイルは変更しません。

```powershell
Set-Location 'C:\Users\kamij\Documents\NUT\NUTFES\nutmeg-hackathon-2026\inshu'
$env:NODE_OPTIONS='--require=C:\Users\kamij\Documents\NUT\NUTFES\nutmeg-hackathon-2026\.tools\runtime-compat.cjs'
$env:XDG_CONFIG_HOME='C:\Users\kamij\Documents\NUT\NUTFES\nutmeg-hackathon-2026\inshu\.wrangler\config'
$env:WRANGLER_LOG_PATH='C:\Users\kamij\Documents\NUT\NUTFES\nutmeg-hackathon-2026\inshu\.wrangler\logs'
$env:WRANGLER_SEND_METRICS='false'
```

原本の設計書は `docs/01-requirements.md`、`02-basic-design.md`、`03-detailed-design.md` に複製しています。

## Task 05：デザインと残りの画面

指定のCSS変数・BIZ UDPGothic（next/font/google、400/700）、ジョッキSVG、オレンジ／ソーダの配色を適用。1280pxと390pxに対応し、判定結果は3列、ギャラリーは4列（スマートフォンは2列）です。加工成功時にFramer Motionの約700msの煙とクロスフェードを表示し、炎上メーターを下げます。動きを減らすOS設定も尊重します。

- `/gallery`：加工済み写真・担当名・残り日数・本人だけの比較モーダル。
- `/lead/rules`：追加・編集・無効化。扱い、重み1〜5、説明を検証。同名の基準は拒否します。
- `/lead/staff`：SlackユーザーIDと表示名で追加、責任者切替、在籍解除／復帰。Slackへの検索・通信はありません。
- API：`GET /api/gallery`、`GET/POST /api/lead/rules`、`POST /api/lead/rules/{id}`、`GET/POST /api/lead/staff`、`POST /api/lead/staff/{id}`。変更はPOSTと同一Originで受け付けます。責任者APIはサーバー側で権限を検証します。

### 期限切れの定期削除

OpenNextの生成ファイルを書き換えず、専用の小さなWorker `src/cleanup-worker.ts` と `wrangler.cleanup.jsonc` を用意しました。Cronの `0 19 * * *`（UTC）は毎日04:00 JSTです。アプリと同じDB・R2をバインドし、`src/lib/cleanup.ts` を実行します。実運用では両設定のバインドを同じ実リソースに設定してWorkerを別途配備する必要があります。この作業ではローカルのみ検証し、配備は行っていません。

`pnpm cleanup:local` は同じロジックを `.wrangler/state/v3` に対して実行します。期限切れ写真のR2プレフィックスをページ送りで列挙し、元画像・加工版・残った画像を削除後、findings/editsを削除し、photosはexpiredの記録だけ残します。usageはJSTの日付で30日前より古い行を削除します。R2削除失敗時はDB行を残して再試行できます。期限前の写真は対象外です。

`pnpm exec tsx scripts/verify-cleanup.ts` は実ローカルD1/R2に期限切れ／未期限の架空データを作り、削除・維持・冪等性を確認して試験用データを片付けます。`scripts/smoke.cjs` からも実行します。拡張したsmokeは基準の追加・編集・無効化、担当の追加・責任者切替・在籍解除、ギャラリー比較、他担当の制限、各画面の390px幅も検証します。smoke用の無効な基準・解除済み担当・サンプル写真はローカルDBに残ります。

## Slack ログイン（times / kagesutagram 共通アプリ）

同じ Slack アプリの Sign in with Slack を使います。アプリの Redirect URLs に各アプリの `https://<ホスト>/api/auth/slack/callback` をそれぞれ登録し、OpenID Connect scopes は `openid profile email` を指定してください。Bot のメッセージ送信権限は不要です。ローカルのリダイレクト先は Slack 側が許可する開発用URLを使用します。

| 環境変数 | 設定 |
|---|---|
| `SLACK_CLIENT_ID` | 共通SlackアプリのClient ID |
| `SLACK_CLIENT_SECRET` | 共通SlackアプリのClient Secret（サーバー専用） |
| `SLACK_TEAM_ID` | 利用を許可するワークスペースID |
| `APP_BASE_URL` | このアプリのorigin。末尾のパスなし。例 `https://inshu.example.com` |

アプリごとに `APP_BASE_URL` と `SESSION_SECRET` を設定します。認証用Cookie名はアプリ別です。同一ホストに置く場合はアプリ間のCookie衝突を避けるためホストを分けてください。設定値は `.dev.vars.example` を参照し、秘密は公開しないでください。

`/api/auth/slack/login` は10分有効の署名Cookieにstate・nonce・安全な戻り先を保存します。callbackでtoken交換、Slack JWKSによるRS256署名、issuer/audience/期限/nonce/teamを検証します。検証に失敗した場合はログイン画面へ戻り、セッションを作りません。開発ログインの既存条件も維持しています。

未登録者には依頼文とコピー可能なSlackユーザーIDを表示し、セッションを発行しません。D1の `pending_logins` には未登録者の直近20人だけを保存（同じ人は最終試行日時を更新）します。責任者は `/lead/staff` でIDを貼り付けて追加するか、登録待ち一覧の「広報担当に追加」で登録できます。登録後は一覧から消え、本人が再ログインすると利用できます。在籍解除済みの担当は自動復帰せず、責任者の在籍復帰操作が必要です。表示名・アイコンのみログイン時の検証済みプロフィールで更新し、責任者権限は変更しません。

更新時は `pnpm db:migrate:local` で `0001_pending_logins.sql` を適用してください。`tests/slack.test.ts` は実RSA鍵・fetch/JWKSモックで認証・拒否・登録待ち・セッション発行を検証します。Slack/Geminiの実接続やデプロイはこの検証に含みません。

## デモ環境のセットアップ

デモ専用の Cloudflare 環境に `SESSION_SECRET`（32文字以上）と `DEMO_PASSCODE`（16文字以上）を Worker のシークレットとして設定します。デモ用ログインでは、シードで登録した架空アカウントを選べます。パスコードの入力を同じ IP から10分間に30回誤ると、最初の失敗から10分が経過するまでログインが制限されます。

以下のコマンドはアプリのディレクトリで実行します。`<db>` はデモ専用の本番 D1 データベース名に置き換えてください。SQL の生成はローカルで行われ、再適用しても既存のシード行は維持されます。

```sh
pnpm demo:seed-sql
pnpm exec wrangler d1 migrations apply <db> --remote
pnpm exec wrangler d1 execute <db> --remote --file demo/seed.sql
```

ローカル D1 で SQL を検証する場合は、次のコマンドを使います。

```sh
pnpm exec wrangler d1 migrations apply inshu-local --local --persist-to .wrangler/demo-check
pnpm exec wrangler d1 execute inshu-local --local --persist-to .wrangler/demo-check --file demo/seed.sql
```

## デモ用ログインの注意

- `DEMO_PASSCODE` は、本番とは別のデモ専用の Worker・D1 にだけ設定する。Slack ログインの設定（`SLACK_*`）がある環境には入れない（架空の責任者・編集部が、本物のユーザーに権限を付けられてしまうため）
- パスコードはランダムな文字列にする（例：`openssl rand -base64 24`）
- 本番に移るときは `DEMO_PASSCODE` を削除し、`FAKE_` で始まる架空データを D1 から消す
