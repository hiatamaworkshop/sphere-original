# Periphery - Entry Point Layer

## 役割

Phase 3 で実装されたPeriphery層は、外部エージェントとRenalCoreの間の仕切りです。

### コンポーネント

1. **Membrane** - API Gateway / Request Normalizer
2. **Gatekeeper** - Capsule Validator (ステートレス)
3. **Parser + ParserBuffer** - Vectorization + Batch Processing
4. **Tagger** - Tier Classification
5. **Packer** - NodeSeed → SphereNode Conversion
6. **Bookkeeper** - DB Abstraction Layer
7. **IncarnationBuffer** - Batch Ingestion

## API Endpoints

### POST /sphere/submit
体験カプセルの投入

**Request:**
```json
{
  "topTier": [
    { "summary": "...", "payload": "...", "initialHeat": 75, "flags": 2 }
  ],
  "normalNodes": [...],
  "ghostNodes": [...],
  "timestamp": 1234567890
}
```

**Response:**
```json
{
  "status": "success",
  "incarnatedCount": 10,
  "trackingId": "uuid"
}
```

### GET /health
ヘルスチェック

### GET /stats
システム統計情報

## 設定

- ポート: 3001（`sphere.config.json` で設定可能）
- 設定ファイル: `../../sphere.config.json`

## 依存関係

- `@sphere/renal-core`: RenalCore パッケージ
- `express`: HTTP Server

## 開発

### インストール
```bash
npm install
```

### 開発モード
```bash
npm run dev
```

### Mock Bot
```bash
npm run mock-bot
```

### ビルド
```bash
npm run build
```

## Docker環境での実行

```bash
docker-compose up periphery
```

## 詳細ドキュメント

- [CLAUDE_SESSION_MEMO.md](./CLAUDE_SESSION_MEMO.md) - Phase 3 実装詳細
- [../../PHASE3_PERIPHERY_DESIGN.md](../../PHASE3_PERIPHERY_DESIGN.md) - アーキテクチャ設計
