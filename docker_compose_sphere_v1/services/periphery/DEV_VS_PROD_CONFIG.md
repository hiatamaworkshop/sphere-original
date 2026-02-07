# Development vs Production Configuration

## 🎯 設計思想の違い

### 開発環境（Development）
**目的**: すぐに結果が見える、高速なフィードバックループ

- ✅ **即座に変化が観測できる**
- ✅ 数秒〜数分で全プロセスが完了
- ✅ デバッグしやすい

### 本番環境（Production）
**目的**: 現実的な時間スケールでの運用

- 📅 数時間〜数日の寿命
- 🌍 大量のノード（数万〜数十万）
- ⚡ 負荷に応じた動的調整

---

## 🔧 今回の調整（2026-01-30）

### loadFactor の調整

**問題**:
```typescript
// 元の設計（本番想定）
const loadFactor = projectionDB.size / 50000;
// ノード数=22 → loadFactor=0.00044 → 減衰がほぼゼロ
```

**解決（開発用）**:
```typescript
const rawLoadFactor = projectionDB.size / 50000;
const loadFactor = Math.max(1.0, Math.min(2.0, rawLoadFactor * 100));
// 常に loadFactor ≥ 1.0 → 減衰が確実に動作
```

**理由**:
- 開発初期は少数のノード（10-100個）でテスト
- 減衰が見えないと動作確認できない
- **すぐに結果が出ることが最優先**

---

## 📊 設定値の比較

### Decay Rate（減衰率）

| 設定 | 開発環境 | 本番環境 |
|------|---------|---------|
| `loadFactor` | 固定 1.0-2.0 | 動的 0.0-2.0 |
| `alpha` | 0.01 | 0.01 |
| `heatDecayFactor` | 0.02 | 0.02 |
| **実効減衰率** | **常に動作** | ノード数依存 |

### TTL（寿命）

| Tier | 開発環境 | 本番環境（提案） |
|------|---------|-----------------|
| Top | 172800s (2日) | 604800s (7日) |
| Normal | 86400s (1日) | 259200s (3日) |
| Ghost | 3600s (1時間) | 7200s (2時間) |

### Buffer Size

| Buffer | 開発環境 | 本番環境 |
|--------|---------|---------|
| ParserBuffer | 3-8 | 32-64 |
| IncarnationBuffer | 3-8 | 32-64 |

---

## 🚀 将来の改善案

### 環境変数での切り替え

```typescript
// index.ts
const isDev = process.env.NODE_ENV === 'development';

const loadFactor = isDev
  ? Math.max(1.0, Math.min(2.0, rawLoadFactor * 100))  // 開発: 固定
  : Math.max(0.1, Math.min(2.0, rawLoadFactor));       // 本番: 動的
```

### 設定ファイルの分離

```
sphere.config.development.json  ← 開発用
sphere.config.production.json   ← 本番用
sphere.config.test.json         ← テスト用
```

### 時間加速モード

```typescript
// 開発専用: 時間を10倍速にする
const timeAcceleration = isDev ? 10 : 1;
const effectiveTTLDecay = baseTTLDecay * timeAcceleration;
```

---

## 💡 開発のベストプラクティス

### 1. 即座にフィードバック

**悪い例**:
```
ノード投入 → 1時間待つ → Ghost化 → さらに1時間待つ → Evaporation
（合計2時間！デバッグ不可能）
```

**良い例**:
```
ノード投入 → 30秒待つ → Ghost化 → さらに30秒待つ → Evaporation
（合計1分！即座に確認可能）
```

### 2. ログの充実

```typescript
// 開発環境では詳細ログ
if (isDev) {
  console.log(`[RenalCore] decay node=${node.id} ttl=${ttl} heat=${heat}`);
}
```

### 3. 観測ツールの活用

- `npm run observe` - リアルタイム監視
- `npm run seed` - テストデータ投入
- `npm run mock-bot` - 継続的負荷テスト

---

## 🎓 学び

> "Premature optimization is the root of all evil" - Donald Knuth

**今回のケース**:
- 本番を想定した設計（loadFactor）は正しい
- **しかし、開発初期には適さない**
- 開発用の設定を別途用意することが重要

**原則**:
1. まず動作確認（開発設定）
2. 次に最適化（本番設定）
3. 環境ごとに設定を分ける

---

**作成日**: 2026-01-30
**目的**: 開発と本番の設定の違いを明確化し、今後の参考とする
