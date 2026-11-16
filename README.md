# 隠酒（インシュ）

公式広報の写真を確認し、写り込みを加工するローカル実行可能なアプリです。今回の範囲は詳細設計10章の手順1〜3です。

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

Bindings は D1 `DB`、R2 `PHOTOS`。`wrangler.jsonc` の ID はローカル用プレースホルダーです。`pnpm build:worker` は OpenNext による Worker パッケージ生成、`pnpm preview` はローカルプレビュー用です。今回の検証ではリモートへの接続・デプロイ・実 Gemini 呼び出しは実施していません。Slack OIDC のログイン・コールバックは 501 を返します。

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
- 保存期限を過ぎた画像へのアクセスは410で拒否します。物理削除のCron、ギャラリー、責任者の管理画面、高度なアニメーションは次の作業です。画面にも自動削除が未実装であることを表示します。

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
