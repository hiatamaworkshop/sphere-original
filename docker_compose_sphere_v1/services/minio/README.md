# MinIO - Projection DB (Object Storage)

## 役割

- Projection DB（投影データベース）
- ノードの本体データ（payload, summary, media）を保存
- S3互換のオブジェクトストレージ

## データ構造

### バケット構成

#### sphere-projections
- ノードの payload と summary を保存
- オブジェクトキー: `nodes/{nodeId}.json`
- 構造:
  ```json
  {
    "summary": "要約テキスト（64-256 bytes）",
    "payload": "完全なコンテンツ（可変長）"
  }
  ```

#### sphere-media (将来)
- 画像、音声、その他のメディアファイル
- オブジェクトキー: `media/{nodeId}/{filename}`

## 設定

- API ポート: 9000
- Console ポート: 9001
- アクセスキー: 環境変数 `MINIO_ROOT_USER`
- シークレットキー: 環境変数 `MINIO_ROOT_PASSWORD`

## 負荷特性

設計ドキュメントより:
> **Projection DB は負荷に鈍感**
> ストレージ容量のみ気にする。Reference DB のような負荷最適化は不要。

- Sequential write は高速
- Random read も問題なし
- ストレージ容量のみ管理が必要

## Progressive Loading との連携

### Level 0: Metadata
- Reference DB から取得（PostgreSQL）
- MinIO 不使用

### Level 1: Summary
- MinIO から取得（プリフェッチ可能）
- 軽量（64-256 bytes）

### Level 2: Payload
- MinIO から取得（`.focus()` 時のみ）
- 重量（可変長、数KB〜数MB）

## 開発環境

Phase 3 初期実装では**ファイルシステム**を使用します。
MinIO への移行は Phase 3.2 以降で実施します。

### マイグレーションパス
1. Phase 3.1: Filesystem（現在）
2. Phase 3.2: MinIO (docker-compose)
3. Phase 3.3: S3 / MinIO (本番環境)
