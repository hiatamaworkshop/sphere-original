# Redis - Cache Layer

## 役割

- Bookkeeper のキャッシュレイヤー
- Reference DB の読み取りキャッシング
- セッション管理（将来的）

## 設定

- ポート: 6379
- 永続化: RDB + AOF（設定可能）
- メモリ上限: 256MB（開発環境）/ 2GB（本番環境）

## 使用箇所

### Bookkeeper (Phase 3)
- Reference DB の読み取り結果をキャッシュ
- ノードメタデータの高速アクセス
- 近傍計算結果のキャッシング

### 将来的な用途
- SphereContext のセッション状態
- Gatekeeper のレート制限カウンター
- Parser のベクトルキャッシュ

## 開発時の注意

Phase 3 の初期実装では Redis は**オプション**です。
Bookkeeper がインメモリ Map で動作している間は不要です。
