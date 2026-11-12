# 台帳

作業の単位を `### C<n>. 題` で置く。規則は agent-hub の `docs/roadmap.md` 冒頭に従う。

## 予定

## 項目

### C4. Loader (データ投入ウィザード)
状態: 保留(別リポジトリを始めるとき)

フォーク時の最初の作業であるデータ投入 (バッチ投入・マージ・再ベクトル化) を担う外部ツール。Sphere 本体とは別のリポジトリにする想定。
設計は `WIZARD_DESIGN_MEMO.md` にある (v3 の `payload` は v4 で `content` に改名済み)。今の投入経路は `POST /sphere/contribute` の batch だけ。

### C5. submitCapsule の evaluations を検証する
状態: 提案

`periphery/src/gateway/sphere-context.ts` の `submitCapsule()` に届く `evaluations` は Gatekeeper が検証しておらず、`evaluate()` の制約 (1 node 1 回、1 セッション 10 件、所持している node だけ) を迂回して ProjDB に届く。
サーバーが自動で適用した評価 (vestibule 入場時の flush) と二重に効くこともある。C1 で `compareCapsules()` が食い違い (matched / altered / unwitnessed) を数えるようになったので、その結果を受け入れの判断に使える。
決めること: 記録のない評価を捨てるか、capsule の `evaluations` 自体を受けないか (自動 flush があるので冗長)。`phi-agent` が `submitCapsule` の `evaluations` に頼っていないかも確かめる。

## 閉じた項目

- [x] C1 Capsule 差分評価 (2026-11-12, ユーザーの依頼。レビュアー無しで閉じた)
  - 範囲はユーザーが決めた: セッション内だけ。エージェントの識別も永続化も無く、「信頼度」は持たず、セッション限りの `consistency` 0-1 を返す
  - `types/capsule-diff.ts` の `compareCapsules()` (サーバーの記録と提出 capsule を比べる) と `demoteUnvisitedSeeds()` (focus していない node を `sourceNodeId` に挙げた seed を ghost へ降格) を足し、`SphereContext.submitCapsule()` から呼ぶ。`submitCapsuleResult` に `divergence` / `demoted` / `dropped` を載せ、rulebook の `contribution.audit` に書いた
  - 降格先の ghost にはスキーマの上限 (`ghostNodes.max`) があり、溢れた seed は capsule ごと拒否されないよう落とす (`dropped`)。閾値は持たない
  - 試験: 単体 `npm run test:capsule-diff` (periphery) 8 件、実機の dive plan `npm run test:capsule-diff` (リポジトリ直下) が REFDB_BACKEND=map の periphery で PASS。Pipeline には top=1 normal=0 ghost=1 で渡り ghost が 1 件増えた。既存の test:refund / emitbus / walkmode も通る
  - 評価の迂回は C5 に起票した
- [x] C2 Sanctuary bundle の署名検証 (2026-11-12, ユーザーの依頼。レビュアー無しで閉じた)
  - 署名の対象を version / frozenAt / sourceCore / nodes 全体の正規化 JSON に広げ、`timingSafeEqual` で比べる。旧形式は nodeCount しか覆っておらず、比較を足すだけでは中身の改ざんを検出できなかった
  - 鍵 (`SANCTUARY_BUNDLE_KEY` か引数) があれば HMAC-SHA256、無ければ SHA-256 (破損の検出のみで改ざん耐性は無い)。呼び出し元も既存の bundle ファイルも無く、旧形式との互換は不要だった
  - 試験: `npm run test:bundle` (periphery) 10 件 (内容・ベクトル・指標・frozenAt・sourceCore の改ざん、鍵違い、sha256 での偽造を弾く)
- [x] C3 Repository 抽象化の残り (2026-11-12, ユーザーの依頼。レビュアー無しで閉じた)
  - 方針はユーザーが決めた: Map のまま整理して閉じる。RenalCore は同期の `NodeStore` (`size` と `values()`) を受けており、非同期 Repository にすると同期・純粋関数の tick (Rust 移植性) と衝突する。ProjDB / SpatialField は揮発が前提で、永続化は `ProjectionSnapshot`
  - `getInternalMap()` (`@deprecated`) を `getStore()` に改名し、index.ts の TODO を設計の説明に置き換えた。`DB_DESIGN_PRINCIPLES_MEMO.md` §6 と `PHASE4_AGENT_SPATIAL_DESIGN.md` の古い記述も直した。挙動は変えていない
