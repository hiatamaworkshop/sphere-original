# Sphere QuickStart - 即座に起動する手順

## ⚡ 3ステップで起動

### Step 1: サーバー起動

```bash
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery
npm run dev
```

待機（以下の表示が出るまで）:
```
✨ Sphere Phase 3: Periphery initialized successfully
💚 RenalCore heartbeat: ACTIVE
🌐 Periphery server: LISTENING
```

### Step 2: 初期ノード投入（新しいターミナル）

```bash
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery
npm run seed
```

### Step 3: 観測開始（さらに別のターミナル）

```bash
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery
npm run observe
```

**完了！** 5秒ごとにノードの状態が表示されます。

---

## 📋 1行コマンド集

```bash
# サーバー起動
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery && npm run dev

# 初期ノード投入
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery && npm run seed

# 観測
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery && npm run observe

# Mock Bot（継続投入）
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery && npm run mock-bot
```

---

## 🚨 起動できない場合

### 1. RenalCore の dist がない

```bash
cp -r c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\renalCore\dist c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery\node_modules\@sphere\renal-core\
```

### 2. ポート 3001 が使用中

```bash
netstat -ano | findstr 3001
# プロセスを確認して終了
taskkill /PID <PID> /F
```

### 3. npm install が必要

```bash
cd c:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere\docker_compose_sphere_v1\services\periphery
npm install
```

---

## 📚 詳細情報

- **テスト手順**: [README_TESTING.md](./README_TESTING.md)
- **トラブルシューティング**: [SETUP_TROUBLESHOOTING.md](./SETUP_TROUBLESHOOTING.md)
- **設定**: [sphere.config.json](./sphere.config.json)
