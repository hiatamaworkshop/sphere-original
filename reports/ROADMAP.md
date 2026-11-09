# 台帳

作業の単位を `### C<n>. 題` で置く。規則は agent-hub の `docs/roadmap.md` 冒頭に従う。

## 予定

## 項目

### C1. Capsule 差分評価
状態: 提案

dive の終わりに、サーバーが行動ログから作る AutoCapsule と、エージェントが `return` で出す capsule を比べ、食い違いをエージェントの信頼度に反映する。
AutoCapsule の生成は `periphery/src/types/auto-capsule.ts` と `gateway/sphere-context.ts` にあるが、比較の処理は無い (旧 `FORK_DEPLOY_AGENDA.md` §8 では完成度 40%、重要度は高)。

### C2. Sanctuary bundle の署名検証
状態: 提案

`periphery/src/sanctuary/bundle-loader.ts` の `verifySignature()` は sha256 を計算するが比べておらず、`signature` が空でなければ通す (`TODO: Compare _hash with bundle.signature`)。
ハッシュの比較か、鍵による署名検証に置き換える。

### C3. Repository 抽象化の残り
状態: 提案

`periphery/src/index.ts:161-163` が `getInternalMap()` で Map を直接取り出して使っている。
RefDB は `REFDB_BACKEND` で差し替えられるようになったが、ProjDB と SpatialField は Map に依存したまま。

### C4. Loader (データ投入ウィザード)
状態: 保留(別リポジトリを始めるとき)

フォーク時の最初の作業であるデータ投入 (バッチ投入・マージ・再ベクトル化) を担う外部ツール。Sphere 本体とは別のリポジトリにする想定。
設計は `WIZARD_DESIGN_MEMO.md` にある (v3 の `payload` は v4 で `content` に改名済み)。今の投入経路は `POST /sphere/contribute` の batch だけ。
