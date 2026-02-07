# Nginx - Reverse Proxy / API Gateway

## 役割

- Periphery API (port 3001) へのリバースプロキシ
- Observatory UI への静的ファイル配信
- ロードバランシング（将来的に複数のPeripheryインスタンス）
- SSL/TLS終端（本番環境）

## 設定

- 設定ファイル: `nginx.conf`
- ポート: 80 (HTTP), 443 (HTTPS)

## ルーティング

- `/api/*` → periphery:3001
- `/` → observatory_ui (静的ファイル)
- `/health` → ヘルスチェック

## 開発時の注意

開発時はnginxをスキップして直接periphery:3001にアクセスしても問題ありません。
