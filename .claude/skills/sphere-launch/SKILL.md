---
name: sphere-launch
description: Sphere の起動・動作確認・データ投入・探索(dive)・停止。Docker Compose で periphery + インフラ4層を立てる。「Sphereを起動して」「動作確認して」「dive してみて」「止めて」などで使う。対象は正史の sphere-original であり、sphere リポジトリではない点に注意。
---

# Sphere 起動ガイド

**対象ディレクトリ(唯一の正解):**

```
C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1
```

Sphere は Docker Compose で動く。`docker compose up -d` 一発で立ち上がる。

---

## ⚠️ 最初に読む: リポジトリを間違えない

`DockerFiles/` 配下に sphere 系が **4つ** ある。**正史は `sphere-original` だけ**。

| ディレクトリ | 素性 | 触ってよいか |
|---|---|---|
| **sphere-original** | HuggingFace Space にデプロイされる正史。2026-04-14 まで更新 | **これを使う** |
| sphere | GitHub `sphere-project.git`。2026-02-06 で停止した旧線 | 参照のみ。**起動不可** |
| sphere-sidecar | sphere-original の fork。phi-agent 送出層が本体 | phi-agent 作業時のみ |
| sphere-lifelog | sphere-original の fork | 別用途 |

補足:
- `sphere` と `sphere-original` は **git 履歴を一切共有していない**。2026-02-07 にファイルコピーから init し直した別リポジトリ。
- `sphere` でチェックアウトされている branch 名が `original` だが、これは linknode 実験の**廃案ブランチ**。ディレクトリ名 `sphere-original` と紛らわしいので混同しないこと。
- `sphere` は periphery/src が要求する `updateAgentCount` を自前 renalCore が持たず、`npm run build` が通らない。docker ビルドも不可能。

### 致命的な罠: compose project 名の衝突

4つとも compose ディレクトリ名が `docker_compose_sphere_v1` で、どれも `name:` を書いていない。
つまり **Compose の project 名が4つとも同一**で、イメージ名 `docker_compose_sphere_v1-periphery` を共有する。

さらに sphere と sphere-original は container_name まで同じ(`sphere-periphery` 等)。

> **他の3ディレクトリで `docker compose build` を打つと、sphere-original のイメージを上書き破壊する。**
> 起動前に必ず `pwd` で sphere-original 配下にいることを確認する。

---

## 起動

```bash
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1"
docker compose up -d
```

既定で 5 サービスが上がる。

| コンテナ | ポート | 役割 |
|---|---|---|
| `sphere-periphery` | 3001 | 本体 (HTTP API + WebSocket Gateway) |
| `sphere-nginx` | 80, 443 | リバースプロキシ (`/api/` → periphery) |
| `sphere-postgres` | 5432 | Reference DB (pgvector) |
| `sphere-minio` | 9000, 9001 | Projection DB (S3互換) |
| `sphere-redis` | 6379 | キャッシュ |

`.env` は配置済み(`.env.example` からコピーする形)。`POSTGRES_PASSWORD` / `MINIO_ROOT_*` / `REFDB_BACKEND` / `STORAGE_BACKEND` を持つ。

### 起動完了の確認

`periphery` が `healthy` になるまで 15〜30 秒。

```bash
docker compose ps
curl -s http://localhost:3001/health
# → {"status":"ok","service":"periphery","sphereId":"sphere-original"}
```

ログの要点:

```
[Config] Loaded: /app/sphere.config.json
[Init] Starting RenalCore heartbeat (1 tick/second)...
[CleanerFishPool] initialized with 10 fish
[GatewayServer] WebSocket attached to HTTP server (same port)
[Seed] Loading 158 items from /app/dist/mock/mock_data.json
Sphere Phase 3: Periphery initialized successfully
```

**この `[Seed]` 行に騙されないこと。** ノードの実体は mock_data ではなく
リモートの Turso から復元されている(下記「RefDB はクラウド」を参照)。

```
[refdb:turso] Initialized — 180 records restored
[projdb:snapshot] Restored 180 nodes (180 from snapshot, 0 from RefDB initial state)
```

mock_data の 158 件は既存ノードと重複するため、新規ノードにはならない。

---

## エンドポイント

すべて `http://localhost:3001`。nginx 経由なら `http://localhost/api/...`。

| パス | 内容 |
|---|---|
| `/health` | 生存確認 |
| `/sphere/status` | 総合ステータス (uptime, gateway, nodes, tickets) |
| `/sphere/manifest` | スフィア定義 (sphereId, version, ethos, nodeCount) |
| `/nodes/stats` | 種別カウントと heat/weight/ttl 平均 |
| `/nodes/metrics` | 全ノードの実測値一覧 |
| `/nodes/:id` | 個別ノード |
| `/sphere/contribute` | 外部投入 (POST) |
| `/sphere/explore` | 探索 (POST) |
| `/sphere/snapshot` | スナップショット |
| `/dive/request` | dive チケット発行 (POST) |
| `/dive/stats` | チケット/セッション数 |
| `/rulebook` | エージェント向け規則書 |
| `/schema` | スキーマ定義 |
| `/metrics` | メトリクス |

---

## 動作確認・データ投入

ホスト側から実行する。node_modules は配置済み。

### 3層 dive (これが本命の総合確認)

```bash
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original"
node sphere-dive-run.mjs
```

tutorial → sanctuary → core と潜り、sense / focus / evaluate / move / return を一通り実行して
`=== DIVE COMPLETE ===` で終わる。energy 会計 (初期 100、evaluate と move で減る)、
TRAIL の記録、receipt、farewell まで確認できる。
対話的に操作したい場合は `sphere-dive-cli.mjs`。
自分でクライアントを書いて潜る場合は **「dive を自分で操作する場合」の節を先に読むこと**。
プロトコルの待ち合わせとエネルギー会計で確実に躓く。

### npm scripts

```bash
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1\services\periphery"
```

| コマンド | 内容 |
|---|---|
| `npm run contribute:batch` | 158 件を 16 カプセルに分けて投入 |
| `npm run contribute` | 単発投入 |
| `npm run explore` | 探索エージェント |
| `npm run swarm` / `swarm:5` / `swarm:10` | 群体エージェント |
| `npm run observe` | リアルタイム観測 |
| `npm run observe:fast` | 高速観測 |
| `npm run observe:heavy` | 高負荷観測 (`-W 20 -n 3 -w 900`) |

**注意: `npm run dev` はコンテナと競合する。** ローカルプロセスで動かしたいときだけ使い、
その場合は先に `docker compose stop periphery` すること。

---

## dive を自分で操作する場合

`sphere-dive-run.mjs` は行動が決め打ちの自動運転。自分で判断しながら潜るなら
**`sphere-dive-manual.mjs` + `sphere-dive-plan.mjs`** を使う(リポジトリ直下)。

```bash
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original"
node sphere-dive-manual.mjs > dive.log 2>&1
```

潜り方を変えるときは `sphere-dive-plan.mjs` のステップ列だけ書き換える。
`{ label, send, waitFor, render }` の配列で、`send` が `null` を返せばそのステップは飛ぶ。
**既定の plan には `evaluate` が1件入っている。本番 Turso に書き込まれるので、
汚したくないならそのステップを消すこと。**

以下は実際に書いて踏んだ落とし穴。

### 接続手順

```
POST /dive/request            → { ticket: { token } }        (HTTP)
ws://localhost:3001?token=…   → welcome                      (WS)
send entry                    → processing → positioned
```

`welcome` を受け取る**前に** `entry` を送ってはいけない。
チケットは使い捨てで、セッションは **180秒**、Vestibule は **120秒**で強制切断。

### エラーを起こしやすい点(すべて実測で踏んだもの)

**`ws` モジュールが解決できない。**
scratchpad などプロジェクト外にスクリプトを置くと `Cannot find module 'ws'`。
`sphere-original` 直下なら root の node_modules が効くのでそのまま `require('ws')` で通る。
外に置く必要があるときは periphery の node_modules を絶対パスで require する。

```js
const WebSocket = require('C:/…/services/periphery/node_modules/ws');
```

**node の stdout がパイプでブロックバッファされる。**
`node dive.mjs | head -100` だと何も出ないまま固まったように見え、
タイムアウトを疑って無駄な時間を使う。ファイルにリダイレクトしてから読む。

**`return` の応答は `layerChanged` ではなく `vestibuleEntered`。**
層移動と同じイベントで待つと永久に返らない。実際にこれで1セッション溶かした。

**`entry` の直後に `positioned` は来ない。**
まず `processing`(384次元ベクトル化は非同期)が来て、待っている間に
`amber_showcase` が挟まることがある。「次に来たメッセージ」で進める作りは崩れる。
**必ず `type` で待ち合わせること。**

**`/nodes/metrics` は配列ではない。** `{ total, nodes }` でラップされている。
`.map()` を直接呼ぶと `TypeError: metrics.map is not a function`。

**`/nodes/:id` はレート制限がある。**
180件を連続取得したら **429 で61件落ちた**。全ノード走査は間隔を空ける。
ベクトル(384次元)が取れるのは `/nodes/:id` だけで、`/nodes/metrics` には含まれない。

**ghost / fossil は `focus` できない。**
`sense` / `scanL1` からは見えるし `evaluate` もできるが、focus は拒否される。
**拒否されてもエネルギーは満額(10)引かれる**ので、事前に kind で弾くこと。

**`evaluate` は即時反映されない。**
`Evaluation buffered for return-time processing` としてバッファされ、
`return` した時点で一括 flush される。打った直後に `/nodes/:id` を見ても変わっていない。
上限は **1セッション10件**。

### エネルギー実測 (Core 層、初期値100)

| アクション | コスト | 備考 |
|---|---|---|
| `scanL1` | 1 | 広く浅く。id + tags のみ。fossil / relic も拾う |
| `sense` | 3 | 狭く深く。summary / heat / weight / decay / flags 付き |
| `move` | 5 | 距離に依らず一律。step 0.45 でも近傍はほぼ変わらない |
| `focus` | 10 | active のみ。**失敗しても課金される** |
| `warp` | 15 | **遠方へ行く唯一の手段**。近傍が総入れ替わりになる |
| `evaluate` | 3 | 最大10回/セッション |
| `emitBus` | 20 | 64バイトを全エージェントへ同報 |
| `return` | 0 | 無料 |

Tutorial は無料、Sanctuary は半額、Core は全額。
実測の一例: `100 →(scanL1)99 →(sense)96 →(warp)81 →(sense)78 →(focus)68 →(evaluate)65`

### Vestibule (`return` 後)

探索アクションは一切使えない。使えるのは5つだけ。

`submitCapsule`(**新規ノード投稿の唯一の経路**) / `viewReceipt` / `viewTrail` /
`viewDiscoveries` / `acknowledge`(farewell を受けて切断)

---

## 綻び (2026-08-21、dive 2回で実測)

### 修正済み (2026-08-21)

以下3件は同一の原因だった。`focus()` が課金を先頭で行い、`coreAdapter.focus()` が
`null` を返すと `mockFocus()` の捏造ノードを**成功として**返していた。
経緯と設計判断は `sphere-original/reports/DESIGN_ENERGY_REFUND_20260821.md` に記録。

1. ~~失敗した `focus` が満額課金される~~ → **課金後に失敗したら返金する**ようになった。
   `focus` / `warp` / `move` が対象。`error` 応答に `energy` が載るので返金を観測できる。
2. ~~`focusResult` の `kind` が誤っている~~ → **捏造フォールバックを廃止**。
   ghost/fossil への focus は正しくエラーになる。
3. ~~`⚠️ Mock data` が混入している~~ → `mockFocus` は adapter 無しのモックモード専用になった。

4. ~~`ws://localhost:0` の表示バグ~~ → attached mode では HTTP サーバが listen した後に
   実ポートを引いて案内するようにした。`ws://localhost:3001?token=<ticket>` と出る。
5. **`emitBus` が無課金だった。** rulebook は cost 20 と公表しているのに `consumeEnergy` が
   無く、同報が無料だった。公表どおり課金するようにした。
6. **コスト表が4箇所に分裂して食い違っていた。** rulebook は sense を 2 と公表していたが
   実際は 3 引かれていた。`types/config.ts` の `DEFAULT_ENERGY_CONFIG` を正典に統一。

検証は以下で再現できる。

```bash
node sphere-dive-manual.mjs ./sphere-dive-plan.test-refund.mjs    # 返金
node sphere-dive-manual.mjs ./sphere-dive-plan.test-emitbus.mjs   # emitBus 課金
```

### 綻びではなかったもの

- **`viewTrail` の 384次元ベクトル。** 意図的な設計だった。`lastPosition` は
  セッションをまたいだ再開用 (2026-02-25 に追加)、`events[].positionSnapshot` は
  軌跡解析の waypoint。どちらも phi-agent が `appendTrail` で永続化し digestor が使う。
- **`dormancy: true`。** 「6回連続でエージェント不在を観測」で立つフラグ
  (`sanctification-neuron.ts`)。エージェントが接続すれば解除される。dive 後は `false` になった。

### 未修正

- **Sanctuary が実質空。** amber が 0件なので `sense` しても 0件。3層構造の真ん中が機能していない。
- **`/nodes/:id` の 429。** 連続取得で落ちる (180件中61件が失敗)。
- **`moveIntent()` に課金が無い。** ただし Gateway に case が無く WebSocket からは到達不能。
  公開するなら課金が要る。

**decay はほとんど動かない。**
`dormancy: false` の状態でも 180ノード中 178ノードの decay は 1000 のまま。
動いたのは評価を受けた2ノード (970 / 985) だけだった。
decay は時間ではなく評価に反応している。腐敗が進む世界はまだ観測できていない。

---

## dive の感触 (何を期待して潜るか)

- **クエリは検索語ではなく着地座標。** 自然文の問いが 384次元ベクトルになり、その位置に立たされる。同じ世界でも問いが違えば別の景色になる。
- **並びは分野ではなく意味。** 「忘却」で潜ると心理学・神経科学・並行プログラミング(STM)が同じ近傍に出る。「剥ぎ取られたあとに残るもの」で潜ると考古学・ブラックホール・ブルームフィルタが隣り合う。
- **歩いても景色は変わらない。** `move step=0.45` で8件中7件が同一。移動手段は事実上 `warp` だけ。
- **世界は毎秒動いている。** 同じノードの heat が数十秒で 510.5 → 519.7 と変わる。RenalCore の tick が効いている。
- **種別で数値プロファイルが違う。** active は heat≈500 / weight≈100、relic は heat 185 / **weight 272**(不変のアンカー)、ghost は weight 49(痩せている)。

---

## agent profile (phi-agent 系)

既定では上がらない。5サービスが `agent` profile に入っている。

```bash
docker compose --profile agent up -d --build
```

ビルド込みで **約12分**かかる(2026-08-21 実測、4イメージのビルド)。
出力がバッファされて何も表示されない時間が長いが、失敗ではない。待つこと。

| サービス | port | 素性 | 実測挙動 |
|---|---|---|---|
| `ollama` | 11434 | `ollama/ollama:latest` | モデルは `sphere-ollama-models` ボリュームに既存。`phi3:mini` 2.2GB / `gemma2:2b` 1.6GB / `qwen2.5:0.5b` 397MB の3つ。**pull 不要** |
| `phi-agent` | — | `../phi-agent` をビルド | **自律ループで動き続ける**。下記参照 |
| `digestor` | 5000 | `../digestor` をビルド | io-gateway。`/stats` `/narratives` `/trails` `/species` `/generations` |
| `pool-service` | 4000 | `../pool-service` をビルド | 投稿の品質ゲート。`POST /ingest` → LLM 判定 → `/sphere/contribute` へ中継 |
| `explorers` | 7860 | `../explorers` をビルド | Python (`app.py`, Gradio)。`docker.sock` をマウントして agent コンテナを起動する管理 UI |

### phi-agent は放置すると勝手に潜り続ける

`DAEMON=true` / `DAEMON_SLEEP_MS=10000` が compose に直書きされているため、
起動した瞬間から10秒間隔で dive し、LLM で評価を出し、**それが Turso に書き込まれる**。

```
[phi-agent] --- Cycle 3 (energy: 64) [camp] mode=hot step=0.00 ---
[phi-agent] Sensed 7 nodes
[phi-agent] FastGate pick: [1] P versus NP computational complexity (flags: 0x0010)
[phi-agent] Focused: [active] computer-science, mathematics, theory
[phi-agent] phi eval: h=9 w=8 d=7 — The node's high heat score indicates active usage...
[phi-agent] Feelings: F=[sat:0.68,frust:0.00,stam:0.36,stale:0.00] desire=0.376 → 0%
[phi-agent] DeltaProfile: Δ: [h:+0.40, w:+0.10, p:-0.40, hit:+1.00, nov:+0.00] entropy=1.000
```

`phi eval: h=undefined w=undefined d=undefined — No JSON found in response` が
時々混ざるが、phi3:mini が JSON を返し損ねているだけでクラッシュはしない。

digestor 側に評価が溜まっていく様子は `curl -s localhost:5000/stats` で見える:

```json
{"sessions":2,"evaluations":6,"species":[{"name":"sniper","evaluations":5},{"name":"hunter","evaluations":1}]}
```

digestor は **50評価たまるまで何もしない**(`[digestor] Skip: 1 < 50 minimum evaluations`)。
すぐに narrative や generation が出ないのは仕様。

**したがって agent profile は「動作確認のために気軽に上げる」ものではない。**
上げっぱなしにすると本番 Turso のノードが LLM の評価で書き換わり続ける。
確認が済んだら `docker compose --profile agent stop phi-agent` で止めること。

### phi-agent 実装の版差

phi-agent の実装自体は **sidecar / lifelog の方が新しい**(12ファイル 4,870行 / sphere-original は 8ファイル 4,247行)。
差分は `server.ts` / `llm-client.ts` / `groq-client.ts` / `test-tracer.ts` の4つで、
これらは phi-agent をサーバー化して外部の sphere へ送るための層。

---

## 停止

```bash
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original\docker_compose_sphere_v1"
docker compose stop          # コンテナを残して停止
docker compose down          # コンテナ削除 (ボリュームは残る)
docker compose down -v       # ボリュームも削除。データが消えるので通常使わない
```

`agent` profile も落とすなら `docker compose --profile agent down`。

---

## 既知の挙動 (2026-08-21 実測)

**重複投入で総数が増えないのは正常。**
`contribute:batch` で 158 件投入しても total は 180 のまま変わらず、heat だけが上がる
(482.8 → 483.1)。投入内容が Turso に既存のノードと重複するため、新規ノードにならず
既存ノードへ熱として畳まれる。Sphere の設計どおりの代謝挙動であって、失敗ではない。
逆に言えば **total が増えないことは投入が届いていない証拠にはならない**。
届いたかどうかは `/nodes/stats` の heat 平均か periphery のログで見る。

**WebSocket Gateway は 3001 に統合されている。**
`ws://localhost:3001?token=<ticket>` で繋ぐ。古い資料にある 8081 の分離ポートは
旧線 (`sphere`) の設計で、現在は存在しない。

**⚠️ RefDB はクラウド。投入は即座に本番 Turso へ書かれる。**
`.env` の `REFDB_BACKEND=turso` が効いており、接続先はローカルではない。

```
TURSO_URL=libsql://sphere-original-hiatamaworkshop.aws-ap-northeast-1.turso.io
```

ログに `TursoReferenceRepository (RefDB — write-through)` と出るとおり **write-through** で、
`contribute` や dive の evaluate は**その場でクラウドの DB に反映される**。
起動のたびにそこから復元されるので、前回の実験結果が残っているのは正常。
「ローカルの使い捨て環境」ではないので、投入や評価を行う前に必ず意図を確認すること。
汚したくない場合は `.env` の `REFDB_BACKEND` を `map` に変えてから起動する。

**postgres / redis / minio は起動するが periphery は使っていない。**
periphery の依存は `@libsql/client` / `@xenova/transformers` / `express` /
`express-rate-limit` / `ws` / `@sphere/renal-core` のみで、pg / ioredis / minio の
クライアントが無い。`sphere_nodes` テーブルが 0 件、redis の `dbsize` が 0 のままなのが正常。

**古いドキュメントの記述は信用しない。**
`sphere` 側の README / QUICKSTART / DEPLOYMENT_GUIDE は旧線のもの。
`sphere-original` では `npm run observe` 等は実在するが、記述の細部は古い可能性がある。
迷ったら `package.json` の scripts を直接見る。
