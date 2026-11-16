# 隠酒（インシュ） 詳細設計

基本設計（`inshu-basic-design.md`）の F-xx・S-xx をそのまま使う。「暫定」の値は設定値として実装する。

## 0. 技術スタック
| 層 | 選定 | 備考 |
|---|---|---|
| フレームワーク | Next.js（App Router）+ TypeScript | Cloudflare Workers（@opennextjs/cloudflare）、良良タイムズと同じ構成 |
| DB | D1 + Drizzle | |
| ファイル | R2 | 元画像・加工後の画像 |
| 認証 | Sign in with Slack（良良タイムズと同じ Slack アプリ）。用意できるまで開発用ユーザー切替 | |
| AI | Gemini API。判定は画像理解モデル（`GEMINI_DETECT_MODEL`）、置き換えは画像編集モデル（`GEMINI_EDIT_MODEL`） | |
| 定期処理 | Workers Cron Trigger（1日1回）で30日経過の削除 | 無料プランで使える |
| 画像処理 | 縮小・EXIF 削除・ぼかし・zip はブラウザ側（canvas、JSZip） | Worker の CPU を使わない |
| UI | Tailwind CSS、Framer Motion（変身アニメーション・炎上メーター） | |

## 1. 命名
| 日本語 | 識別子 |
|---|---|
| 広報担当 | staff |
| 広報責任者 | lead（staff.is_lead） |
| チェック（1回のアップロード） | batch |
| 写真 | photo |
| 写り込み（判定結果1件） | finding |
| NG 項目（基準） | rule |
| 加工 | edit |
| 写真の状態 | uploaded / detecting / detected / failed / edited / expired |
| 扱い | replace（置き換え）/ blur（ぼかし）/ warn（警告のみ） |

規則は良良タイムズに合わせる（snake_case、`/api/...`、責任者向けは `/api/lead/...`、状態変更は `POST .../{id}/<動詞>`）。

## 2. 認証と権限
- Slack OpenID Connect。NUTMEG（技大祭実行委員会）のワークスペース以外は拒否
- `staff` に登録された人だけが使える。未登録なら「広報担当に登録されていません」と出す
- `is_lead` の人だけが `/api/lead/...` と S-06・S-07 を使える
- セッションは良良タイムズと同じ方式（署名付き Cookie＋D1、30日）
- 開発用ユーザー切替：`DEV_LOGIN=1` のときだけ。シードで架空の広報担当3人（うち責任者1人）を作る

## 3. データ設計（D1）
**staff**：id, slack_user_id（一意）, display_name, avatar_url, is_lead, is_active, created_at

**sessions**：id, staff_id, expires_at, created_at

**rules（NG 項目）**
| カラム | 型 | 備考 |
|---|---|---|
| id | TEXT | |
| name | TEXT | 例「お酒」 |
| description | TEXT | 判定の指示にそのまま入れる説明 |
| treatment | TEXT | replace / blur / warn |
| weight | INTEGER | 1〜5。リスク点数の重み |
| is_active | INTEGER | |
| sort_order | INTEGER | |
| updated_by, updated_at | TEXT | |

初期データ
| name | treatment | weight | description |
|---|---|---|---|
| お酒 | replace | 5 | 酒類の缶・瓶・グラス・ジョッキ・ラベル。ソフトドリンクは含めない |
| タバコ | blur | 5 | タバコ・電子タバコ・灰皿・喫煙中の様子 |
| 個人情報 | blur | 4 | 名札・学生証・ナンバープレート・読める画面やメモ |
| 他社のロゴ・著作物 | blur | 2 | 協賛企業以外のロゴ、キャラクター |
| 危険・不適切な行為 | warn | 4 | 立入禁止区域への立ち入り、危険な行為、不適切なジェスチャー |

**batches**：id, staff_id, photo_count, created_at

**photos**
| カラム | 型 | 備考 |
|---|---|---|
| id | TEXT | |
| batch_id, staff_id | TEXT | |
| status | TEXT | uploaded / detecting / detected / failed / edited / expired |
| original_key | TEXT | R2 `photos/{id}/original.jpg` |
| current_key | TEXT / null | 最新の加工後 `photos/{id}/edit-{n}.jpg` |
| width, height | INTEGER | |
| risk_score | INTEGER / null | 0〜100 |
| rules_snapshot | TEXT (JSON) | 判定に使った基準の写し |
| error | TEXT / null | |
| created_at, detected_at, edited_at | TEXT | |
| expires_at | TEXT | created_at + 30日 |

**findings**
| カラム | 型 | 備考 |
|---|---|---|
| id | TEXT | |
| photo_id | TEXT | |
| rule_id | TEXT | |
| box | TEXT (JSON) | {x, y, w, h} 0〜1 の割合 |
| reason | TEXT | 例「右奥のテーブルにビール缶」 |
| confidence | REAL | 0〜1 |
| source | TEXT | ai / manual（F-08 で人が足した） |
| status | TEXT | open / fixed（加工済み）/ dismissed（人が誤検出として消した） |

**edits**：id, photo_id, kind（replace / blur / revert）, finding_ids（JSON）, drink（置き換え時の飲み物）, result_key, created_by, created_at

**usage**：staff_id, date（JST の YYYY-MM-DD）, replace_count。(staff_id, date) で一意

## 4. R2 のキー
- `photos/{photo_id}/original.jpg`
- `photos/{photo_id}/edit-{n}.jpg`
- 画像は Worker 経由で配信（`/api/photos/{id}/image?v=original|current`）。権限は §6 のとおり

## 5. 炎上リスクの点数
- 写り込みごとに `weight × confidence × 20` を計算し、最大のものに、2件目以降の合計の 20% を足して 100 で頭打ち
- dismissed と fixed の写り込みは数えない。加工後は再計算して下がる（炎上メーターが鎮火）
- 表示：0〜19「安全」、20〜49「注意」、50〜79「危険」、80〜「炎上」

## 6. API 一覧
| メソッド | パス | 用途 |
|---|---|---|
| GET | /api/auth/slack/login, /api/auth/slack/callback | Slack ログイン |
| POST | /api/auth/dev-login, /api/auth/logout | 開発用ログイン、ログアウト |
| POST | /api/batches | チェックを作る（枚数を宣言、20枚まで） |
| POST | /api/batches/{id}/photos | 写真を1枚アップロード（縮小・EXIF 削除済みの JPEG、5MB まで） |
| GET | /api/batches/{id} | 進み具合と写真一覧（リスク順） |
| POST | /api/photos/{id}/detect | 判定（再判定にも使う）。基準を読み、Gemini に投げ、findings を保存 |
| GET | /api/photos/{id} | 写真の詳細（findings・edits） |
| GET | /api/photos/{id}/image?v= | 画像。original は処理した本人だけ、current は広報担当全員 |
| POST | /api/photos/{id}/replace | お酒の置き換え（finding_ids, drink）。1日の上限を超えたら 429 |
| POST | /api/photos/{id}/blur | ぼかし結果の保存（ブラウザで加工した JPEG と finding_ids） |
| POST | /api/photos/{id}/revert | 1つ前の加工に戻す |
| POST | /api/photos/{id}/findings | 枠を足す（rule_id, box, reason） |
| POST | /api/findings/{id}/dismiss, /restore | 誤検出として消す・戻す |
| GET | /api/gallery | 加工済みの写真（全員分、新しい順）。元画像の URL は本人分だけ |
| GET | /api/usage | 今日の置き換え回数と上限 |
| GET/POST/PATCH | /api/lead/rules | 基準の一覧・追加・編集・無効化 |
| GET/POST/PATCH | /api/lead/staff | 広報担当の一覧・追加・解除・責任者の付け外し |

- エラー形式とコードは良良タイムズと同じ（400/401/403/404/409/413/429）
- 判定は1枚ずつ順番に呼ぶ（ブラウザが S-03 から順に `/detect` を呼ぶ）。並列は2まで（暫定）

## 7. Gemini への指示
### 判定（F-04）
- 入力：写真、有効な rules の name と description の一覧
- 出力（JSON）：`findings: [{rule_name, box: {x,y,w,h}（0〜1）, reason（30字以内・日本語）, confidence（0〜1）}]`
- 指示：「広報写真のチェック係として、次の基準に当てはまる写り込みだけを挙げる。当てはまらないものは挙げない。迷ったら confidence を低くして挙げる。人物の容姿については述べない」
- rules に無い rule_name が返ってきたら捨てる。3回失敗したら status=failed

### 置き換え（F-06）
- 入力：現在の画像（加工済みならそれ）、置き換える枠の一覧、飲み物名
- 指示：「枠の中の酒類だけを『{飲み物}』に置き換える。容器の形・大きさ・光の当たり方・影を保つ。枠の外、特に人物の顔・体・背景は変えない。{飲み物}が飲み物でない場合は置き換えず、元の画像を返す」
- 飲み物名：定番（オレンジジュース・リンゴジュース・ぶどうジュース・ラムネ・麦茶）か、おまかせ（元のお酒の色に近いソフトドリンク）か、自由入力（20字まで、改行・記号を除く）
- 返ってきた画像のサイズが違えば元のサイズに合わせる。失敗したら回数を数えずにエラーを返す

## 8. 画面詳細
**S-01 ログイン（/login）**：ロゴ（ビールジョッキが「ポンッ」とジュースに変わるアニメーション）、「Slack でログイン」、開発時のみユーザー切替

**S-02 チェック（/）**：ドロップ領域（20枚まで、JPEG/PNG/HEIC）、選んだ写真のサムネイル、注意書き「写真は判定と加工のため AI（Gemini）に送られます。30日で自動的に削除されます」、「チェックする」。送信前にブラウザで長辺 2048px に縮小し EXIF を消す

**S-03 判定結果の一覧（/batches/{id}）**：進み具合（n / 20 判定済み）、写真カード（サムネイル・炎上メーター・NG 項目のバッジ）、並び替え（リスク順／アップロード順）、「まとめてダウンロード」（加工後があればそれ、なければ元画像）、注意書き（要求11）

**S-04 写真の詳細（/photos/{id}）**
- 写真の上に枠（項目ごとの色）、枠を押すと理由と確からしさ
- お酒の枠：飲み物の選択（定番・おまかせ・自由入力）＋「ジュースにする」→ 変身アニメーション（煙が出て切り替わる）
- ぼかし対象の枠：「ぼかす」（ブラウザで加工して保存）
- 警告のみの枠：理由の表示だけ
- 枠の手直し：「誤検出として消す」、「枠を足す」（ドラッグで囲み、項目を選ぶ）
- 炎上メーター（加工ごとに下がり、0〜19 で「鎮火」表示）
- ビフォーアフター（スライダー）、「1つ戻す」、「ダウンロード」
- 今日の置き換え回数（n / 100）
- 注意書き（要求11）

**S-05 ギャラリー（/gallery）**：加工済みの写真のグリッド（全員分）、処理した人の名前、残り日数。自分の作品はビフォーアフターも見られる

**S-06 基準の編集（/lead/rules）**：NG 項目の表（名前・説明・扱い・重み・有効）、追加・編集。説明の書き方の例を表示

**S-07 広報担当の管理（/lead/staff）**：一覧、Slack の名前で検索して追加、解除、責任者の付け外し

## 9. 定期処理
- Cron（毎日 4:00 JST）：expires_at を過ぎた photos の R2 オブジェクトを消し、photos を expired にして findings・edits を消す
- usage は 30 日より古い行を消す

## 10. 開発の順番
1. 土台（Next.js on Workers、D1/R2、スキーマ、開発用ログイン、シード）
2. S-02 アップロード → S-03 一覧 → 判定 API（Gemini、キーがなければ固定のダミー判定で動く）
3. S-04 枠表示・ぼかし・置き換え（キーがなければダミー置き換え：枠に色を塗るだけ）・ビフォーアフター・ダウンロード
4. S-05 ギャラリー、S-06・S-07 責任者画面、Cron
5. 演出（変身アニメーション・炎上メーター）
