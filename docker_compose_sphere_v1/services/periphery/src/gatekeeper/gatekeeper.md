# Gatekeeper - Capsule Validator

## 役割

ExperienceCapsule の入口検証を担当する STATELESS コンポーネント。
Agent が提出する Capsule が Sphere の受け入れ基準を満たすかを判定する。

## アーキテクチャ (2026-02-06 更新)

### スキーマ駆動バリデーション

検証ロジックはハードコードではなく、JSON スキーマから動的に実行される。

```
schema/*.schema.json  (単一の真実源)
       ↓ loadSchemas()
   SchemaRegistry (Map<name, SchemaDefinition>)
       ↓ inject
   Gatekeeper.validate()
       ↓
   ValidationResult
```

### スキーマファイル

| ファイル | 内容 |
|---------|------|
| `capsule.schema.json` | ExperienceCapsule 構造、配列上限 |
| `node-seed.schema.json` | NodeSeed フィールド制約 |
| `node-evaluation.schema.json` | NodeEvaluation フィールド制約 |

### 検証ロジックの変更方法

**重要**: 検証ルールは随時変更される可能性がある。

1. **フィールド制約の変更** (maxLength, max, pattern 等)
   - 対応する `*.schema.json` を編集
   - コード変更不要

2. **新規フィールド追加**
   - スキーマに `fields` を追加
   - `required: true` なら必須検証が自動適用

3. **複合制約の追加** (例: 総ペイロードバイト数)
   - スキーマの `constraints` に追加
   - `validator.ts` の `validateConstraints()` に対応ロジック追加

4. **ビジネスルール追加** (例: 空カプセル拒否)
   - `gatekeeper.ts` の `validate()` に直接記述
   - スキーマで表現困難なルールはここに

## 現在の検証項目

### スキーマ由来 (自動)

- `topTier`: max 2
- `normalNodes`: max 5
- `ghostNodes`: max 3
- `summary`: maxLength 500
- `links`: maxItems 5
- `ref_url`: maxLength 256, pattern `^https?://`
- `h/w/d`: min 0, max 10

### 複合制約 (constraints)

- `maxTotalPayloadBytes`: 8192 (summary + payload + links + ref_url + sourceNodeId)

### ビジネスルール (コード)

- 空カプセル拒否 (`EMPTY_CAPSULE`)

## API エンドポイント

```
GET /schema
```

スキーマをそのまま返却。Agent やツールが事前に制約を確認できる。

## 後方互換性

```typescript
// 両方の呼び出しが有効
new Gatekeeper(schemaRegistry)  // 推奨: 明示的注入
new Gatekeeper()                // 互換: 自動ロード
```

## 参考

- [schema/types.ts](../schema/types.ts) - 型定義
- [schema/validator.ts](../schema/validator.ts) - 検証関数
- [rulebook/index.ts](../rulebook/index.ts) - Agent 向けルールブック (constraints セクション)

---

*最終更新: 2026-02-06*
