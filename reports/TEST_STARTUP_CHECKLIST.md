# Test Startup Checklist — テスト開始前の落とし穴集

**Date**: 2026-02-15
**Purpose**: デーモンテスト開始時に繰り返される失敗パターンを集約。毎回参照すること。

---

## 1. ビルド順序

```
renalCore → periphery → phi-agent
```

periphery は renalCore の `file:` 依存を持つ。renalCore の `dist/` がないと periphery の tsc がエラーになる。

```bash
cd docker_compose_sphere_v1/services/renalCore && npm run build
cd docker_compose_sphere_v1/services/periphery && npm install && npm run build
cd phi-agent && npm run build
```

---

## 2. tsc は JSON をコピーしない

**症状**: mock_data.json を編集したのに Sphere に反映されない

`npx tsc` は `.ts` → `.js` の変換のみ。JSON ファイルは `dist/` にコピーされない。

```bash
# 手動コピー必須
cp services/periphery/src/mock/mock_data.json services/periphery/dist/mock/mock_data.json
```

**確認方法**: `dist/mock/mock_data.json` のタイムスタンプが `src/mock/mock_data.json` と一致するか。

---

## 3. Sphere 再起動が必要

**症状**: ビルドしたのに新コードが動かない / 新フラグが付与されない

起動中の Sphere (periphery) は旧コードのまま動作する。ビルド後は必ず再起動。

Docker の場合:
```bash
docker compose restart periphery
```

ホスト実行の場合: プロセスを kill して再起動。

**確認方法**: Cognitive キーワード (theorem, paradox 等) を含むノードを投入し、flags に 0x0100-0x0800 が含まれるか確認。

---

## 4. WS ポート

**症状**: AggregateError で全セッション失敗 (0 cycles, 0 evals)

| 環境 | HTTP | WebSocket |
|------|------|-----------|
| Docker (PORT=3001) | 3001 | 3001 (same-port) |
| ホスト dev (旧設定) | 3001 | 8081 |

Docker / standalone 起動では **same-port モード** (HTTP+WS 共に 3001)。

```bash
# ✅ 正しい (same-port)
SPHERE_URL=http://localhost:3001 SPHERE_WS=ws://localhost:3001

# ❌ 失敗する (8081 は listen していない)
SPHERE_URL=http://localhost:3001 SPHERE_WS=ws://localhost:8081
```

**確認方法**: `curl http://localhost:3001/health` が返るか。WS は単発テスト 1 セッションで確認。

---

## 5. LOADOUT=random の明示指定

**症状**: 全セッションが balanced 固定、種族分散が出ない

`LOADOUT` 未指定のデフォルトは `balanced`。re-random は `LOADOUT=random` が明示指定されたときのみ有効。

```bash
# ❌ 全セッション balanced 固定
EVALUATE=true node dist/index.js --daemon --cycles 3

# ✅ セッションごとに種族再抽選
LOADOUT=random EVALUATE=true node dist/index.js --daemon --cycles 3
```

---

## 6. --sessions は存在しない

**症状**: クエリが数字になる ("15" がクエリとして解釈される)

```bash
# ❌ "15" がクエリになる
node dist/index.js --daemon --sessions 15 --cycles 3

# ✅ daemon は無限ループ、Ctrl+C で停止
node dist/index.js --daemon --cycles 3
```

parseArgs() に `--sessions` は定義されていない。未知フラグの次の値引数がクエリとして誤解釈される。

---

## 7. 非デーモンモードではクエリが回転しない

**症状**: 全セッションが同一クエリ "knowledge exploration" 固定、d 測定が固定値

`--daemon` なしで複数回実行しても QUERY_POOL のローテーションは行われない。デフォルトクエリ "knowledge exploration" 固定。

```bash
# ❌ クエリ固定 — d の多様性が出ない
for i in {1..10}; do LOADOUT=scout node dist/index.js --cycles 3; done

# ✅ デーモンモードでクエリローテーション
LOADOUT=scout DAEMON=true node dist/index.js --daemon --cycles 3
```

---

## 8. Heat 蓄積のフィードバックループ

**症状**: 長時間テスト後、全種族が同一ノードを選択し続ける（種族差が見えない）

Arbiter が Hot フラグ (0x0008) を付与 → 高 heat ノードがさらに選択される → 更に heat 上昇。
55+ セッション後、特定ノード (例: Roko's Basilisk) が全種族の選択を支配する。

**対策**:
- 種族比較テストの前に Sphere を再起動（heat リセット）
- または短期間（10-15セッション）で比較を完了する

---

## 起動前クイックチェック

```
□ ビルド順序: renalCore → periphery → phi-agent
□ dist/mock/mock_data.json を手動コピーしたか (編集した場合)
□ Sphere を再起動したか (ビルド後)
□ curl http://localhost:3001/health が OK か
□ WS ポート: SPHERE_WS=ws://localhost:3001 (same-port)
□ LOADOUT=random を指定したか (種族分散テストの場合)
□ --daemon フラグを付けたか (クエリローテーション必要な場合)
□ Heat が蓄積していないか (長時間テスト後は Sphere 再起動推奨)
```

---

## 参照

- `DAEMON_TEST_BATCH_PROTOCOL.md` — テスト全体設計
- `DIGESTOR_ENHANCEMENT_20260213.md` — Digestor テスト注意点
