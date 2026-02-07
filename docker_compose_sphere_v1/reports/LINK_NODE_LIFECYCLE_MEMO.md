# Link Node Lifecycle (リンクノード生成機構)

## ステータス: 実装完了 ✅

---

## 1. 現状フロー

### 1.1 リンク生成

```
[セッション]
  Agent が複数の Amber ノードを訪問
  └─ VisitRecord[] に記録

[セッション終了]
  └─ arbiter.processCoOccurrence(visits)
  └─ co-occurrence スコア蓄積 (Map<key, {count, lastUpdated}>)

[Pulse Broadcast] (毎10 tick)
  └─ arbiter.getLinkCandidates()
  └─ スコア ≥ 5 のペアを LinkCandidate として配信
  └─ 配信後、coOccurrenceStore から削除

[外部システム]
  └─ POST /links → NodeForge.forgeLink()
  └─ MidpointLinkForge.forge() でノード生成
```

### 1.2 関連コンポーネント

| Component | 役割 | DB変更 |
|-----------|------|--------|
| **Arbiter** | 観察・判定・co-occurrence蓄積 | ❌ 読み取りのみ |
| **NodeForge** | ノード生成（返却のみ） | ❌ |
| **Bookkeeper** | 状態変更の実行 | ✅ 唯一の変更者 |
| **CleanerFish** | 期限切れ検出 | ❓ 要確認 |

### 1.3 Link Node 構造

```typescript
{
  id: linkId,              // sha256("link:" + sorted(id1, id2)).slice(0,16)
  kind: "link",
  vector: midpoint,        // (sourceVector + targetVector) / 2
  linkMeta: {
    source_id: string;
    target_id: string;
    isDirected: false;     // 双方向
  },
  metrics: {
    ttl: 1000,
    h: 0.1,
    w: 0,
    d: 0.01,
    flg: NodeFlag.Catalyst,
  }
}
```

---

## 2. 発見された問題点

### 2.1 重複 co-occurrence 蓄積

**問題:**
- Arbiter は既存リンクの存在を知らない
- リンク生成後も同じ Amber ペアの訪問で co-occurrence が蓄積される
- 閾値超えで無駄な LinkCandidate 配信
- NodeForge で重複チェック (`projDB.has(linkId)`) により弾かれる

```
[セッション1] Amber A-B 訪問 → 蓄積 → 閾値超え → リンク生成 ✅

[セッション2] Amber A-B 再訪問 → 蓄積継続 (問題)
  → 閾値超え → LinkCandidate 配信 (無駄)
  → NodeForge で弾かれる
```

**影響:**
- 無駄な計算・メモリ消費
- 無駄な Pulse 配信
- 無駄な API 呼び出し

### 2.2 リンク消滅後の再生成

**事実:**
- リンクノードも代謝する（heat減衰 → ttl減少 → fossil化 → 削除）
- 道が使われなくなれば消える

**要件:**
- リンク消滅後は co-occurrence 蓄積を再開すべき
- 再び頻繁に通られれば道が復活する（自然な獣道の挙動）

---

## 3. 提案設計

### 3.1 Arbiter の拡張

```typescript
// Arbiter に追加
private linkedPairs: Set<string> = new Set();

/**
 * リンク成立時に呼び出し - co-occurrence 蓄積を停止
 */
registerLinkedPair(sourceId: string, targetId: string): void {
  const key = this.coKey(sourceId, targetId);
  this.linkedPairs.add(key);
  // 既存の蓄積も削除
  this.coOccurrenceStore.delete(key);
}

/**
 * リンク削除時に呼び出し - co-occurrence 蓄積を再開
 */
unregisterLinkedPair(sourceId: string, targetId: string): void {
  const key = this.coKey(sourceId, targetId);
  this.linkedPairs.delete(key);
}

/**
 * processCoOccurrence の修正
 */
processCoOccurrence(visits: VisitRecord[]): void {
  // ...
  for (const pair of amberPairs) {
    const key = this.coKey(pair.a, pair.b);

    // リンク済みペアはスキップ
    if (this.linkedPairs.has(key)) continue;

    // 蓄積処理...
  }
}
```

### 3.2 Bookkeeper による一元管理

**原則:** Bookkeeper を唯一の状態変更実行者とする

```
[リンク生成フロー]
NodeForge.forge() → linkNode 返却
Bookkeeper.addLinkNode(linkNode)
  → ProjDB 追加
  → Arbiter.registerLinkedPair(source, target)

[リンク削除フロー]
CleanerFish → 期限切れ Link 検出 → deletionQueue 返却
Bookkeeper.processCleanup(deletionQueue)
  → ProjDB 削除
  → Arbiter.unregisterLinkedPair(source, target)
```

**利点:**
- 状態変更が Bookkeeper に一元化
- Arbiter への通知漏れがない
- トランザクション的な一貫性

---

## 4. 確定事項

### 4.1 採用方針: 案A（蓄積停止）

- リンク生成後、同じ Amber ペアの co-occurrence 蓄積を停止
- 道の利用頻度は Link ノード自体の heat/traversal で把握
- シンプル、メモリ効率良い

### 4.2 CleanerFish の処理フロー

```
[TTL=0 検出]
           ↓
┌─────────────────────────────────────────┐
│ active/link (TTL≤0)                     │
│   └─ fossilize() → fossil ノード生成    │
│      └─ kind: "fossil"                  │
│      └─ linkMeta 保持（リンクの場合）    │
│      └─ 新しい TTL 付与                  │
│      └─ linkedPairs は維持（残骸存在）   │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ fossil (TTL≤0)                          │
│   └─ decompose() → fertility還元 + 削除 │
│   └─ linkMeta があれば凍結解除           │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ ghost (TTL≤0)                           │
│   └─ evaporate() → 痕跡なし消滅         │
└─────────────────────────────────────────┘
```

**重要:** CleanerFish は結果を返すのみ、DB更新は Bookkeeper が実行

### 4.3 凍結/解除タイミング

| イベント | Arbiter 通知 | linkedPairs | co-occurrence |
|----------|--------------|-------------|---------------|
| Link 生成 | `registerLinkedPair` | add | 蓄積停止 |
| Link → fossil | なし | 維持 | 停止継続 |
| fossil → 削除 | `unregisterLinkedPair` | delete | **蓄積再開** |

### 4.4 Bookkeeper の責務

```typescript
// リンク生成時
addLinkNode(linkNode: SphereNode): void {
  this.projDB.set(linkNode.id, linkNode);
  this.arbiter.registerLinkedPair(
    linkNode.linkMeta!.source_id,
    linkNode.linkMeta!.target_id
  );
}

// 分解処理時（削除前にノードを取得）
processDecomposition(fossilNode: SphereNode, result: DecompositionResult): void {
  // 元リンクだった場合、凍結解除
  if (fossilNode.linkMeta) {
    this.arbiter.unregisterLinkedPair(
      fossilNode.linkMeta.source_id,
      fossilNode.linkMeta.target_id
    );
  }

  // ProjDB から削除
  this.projDB.delete(result.nodeId);
}
```

---

## 5. 実装状況

### 5.1 完了 ✅

- [x] Arbiter に `linkedPairs: Set<string>` 追加 → `arbiter.ts:250`
- [x] Arbiter に `registerLinkedPair()` / `unregisterLinkedPair()` 追加 → `arbiter.ts:1060-1097`
- [x] `processCoOccurrence()` で linkedPairs チェック追加 → `arbiter.ts:953`
- [x] Bookkeeper に `setArbiter()` 追加（遅延バインディング）→ `bookkeeper.ts:38-45`
- [x] `ingestLinkNode()` で `registerLinkedPair()` 呼び出し → `bookkeeper.ts:166-172`
- [x] `applyDecomposition()` で `unregisterLinkedPair()` 呼び出し → `bookkeeper.ts:393-404`

### 5.2 配線・復元 ✅

- [x] 初期化時に `bookkeeper.setArbiter(arbiter)` を呼び出す配線追加 → `index.ts:292`
- [x] 再起動時の linkedPairs 復元（既存 link/fossil の linkMeta からスキャン）→ `index.ts:294-310`

---

## 6. 関連ドキュメント

- [arbiter.ts](../services/periphery/src/arbiter/arbiter.ts) - Arbiter 実装
- [link-forge.ts](../services/periphery/src/forge/link-forge.ts) - LinkForge 実装
- [bookkeeper.ts](../services/periphery/src/bookkeeper/bookkeeper.ts) - Bookkeeper 実装

---

*Created: 2026-02-03*
*Updated: 2026-02-03*
*Status: 実装完了 ✅*
