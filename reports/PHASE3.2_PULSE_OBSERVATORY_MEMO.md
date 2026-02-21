# Phase 3.2: Pulse Observatory 実装メモ

**実装日**: 2026-01-30
**実装者**: Claude (Opus 4.5)

---

## 概要

RenalCore の代謝状態を外部から観測する「パルス観測所」システムを実装。
UDP broadcast による環境信号の送信と、統計的異常検知機能を持つ Observatory サービスを構築。

### 設計思想

> 「観測は受動的、介入は能動的」

- Observer (既存): HTTP polling で Sphere 内部を直接観測
- Observatory (新規): UDP で環境放射信号を受信し、外部から観測

---

## アーキテクチャ

```
┌─────────────────┐
│    RenalCore    │
│  (Metabolism)   │
└────────┬────────┘
         │ 5 tick ごと
         ▼
   ┌─────────────┐
   │ PulsePacket │  UDP broadcast
   │   (JSON)    │  port: 41234
   └──────┬──────┘
          │
          ▼
┌─────────────────┐
│   Observatory   │
│ (UDP Listener)  │
└────────┬────────┘
         │ 統計分析
         ▼
┌─────────────────┐
│  Anomaly Check  │  Z-score > 2σ
│  (Statistics)   │
└────────┬────────┘
         │ 異常検知時
         ▼
┌─────────────────┐
│  Environmental  │  POST /sphere/submit
│      Node       │
└─────────────────┘
```

---

## 実装ファイル

### RenalCore 変更

| ファイル | 変更内容 |
|----------|----------|
| `services/renalCore/src/types/pulse.ts` | PulsePacket, PulseSignal, PulseConfig 型定義 |
| `services/renalCore/src/renalcore.ts` | UDP socket 初期化, processPulseBroadcast() 追加 |
| `services/renalCore/src/index.ts` | Pulse 型のエクスポート追加 |

### 新規サービス: Observatory

| ファイル | 役割 |
|----------|------|
| `services/observatory/src/types.ts` | Observatory 用型定義 |
| `services/observatory/src/statistics.ts` | 統計計算 (平均, 標準偏差, Z-score) |
| `services/observatory/src/observatory.ts` | UDP 受信, 異常検知, Environmental Node 送信 |
| `services/observatory/src/index.ts` | エントリーポイント |

### 設定変更

**sphere.config.json**:
```json
"renal_core": {
  "pulse": {
    "enabled": true,
    "port": 41234,
    "intervalTicks": 5,
    "broadcastAddress": "127.0.0.1"
  }
}
```

---

## データ構造

### PulsePacket

```typescript
interface PulsePacket {
  cid: string;       // Cell ID
  ts: number;        // Timestamp
  sig: {
    a: number;       // Attractant: プランクトン密度 + Amber残存熱
    r: number;       // Repellent: Ghost密集度
    d: number;       // Density: 実体密度 (Active/Relic)
    f: number;       // Flow: 前回Tickからの流動性
  };
  flg: number;       // Flags (bitfield)
  tick: number;      // RenalCore tick
}
```

### PulseFlag

| Flag | Value | 意味 |
|------|-------|------|
| Burst | 0x01 | 急激な熱上昇 |
| Thorn | 0x02 | Ghost 過多 |
| Bloom | 0x04 | Amber 結晶化発生中 |
| Drought | 0x08 | 活性ノード不足 |
| Storm | 0x10 | 大量蒸発発生中 |

---

## 異常検知ロジック

### 統計的処理

1. 移動ウィンドウ (デフォルト: 100 packets) でサンプル収集
2. 各 Signal (a, r, d, f) の平均・標準偏差を計算
3. Z-score = (現在値 - 平均) / 標準偏差
4. |Z-score| > threshold (デフォルト: 2.0) で異常検知

### 推奨アクション

| Signal | 異常 | アクション |
|--------|------|------------|
| a (Attractant) | drop | プランクトン注入 |
| r (Repellent) | spike | decay 加速調整 |
| d (Density) | drop | Active ノード注入 |
| f (Flow) | drop | 緩和ノード注入 |

---

## 起動方法

### 1. Periphery (RenalCore 含む)

```bash
cd services/periphery
npm run dev
```

出力例:
```
📡 Pulse broadcast: UDP 127.0.0.1:41234 (every 5 ticks)
[RenalCore] Pulse socket bound to 0.0.0.0:xxxxx
[RenalCore] pulse tick=5 a=0.00 r=0.000 d=0 f=0.000 flg=0x8
```

### 2. Observatory

```bash
cd services/observatory
npm run dev
```

出力例:
```
============================================================
  Pulse Observatory Started
============================================================
  Listening: UDP 0.0.0.0:41234
[Observatory] tick=5 a=0.00 r=0.000 d=0 f=0.000 flags=DROUGHT
```

### 3. Mock Bot (データ注入)

```bash
cd services/periphery
npm run mock-bot
```

---

## テスト結果

### 正常動作確認

- [x] RenalCore から 5 tick ごとに UDP broadcast
- [x] Observatory で受信・ログ出力
- [x] 統計情報の計算 (30秒ごとにサマリー表示)
- [x] フラグ変化の検知 (DROUGHT → BLOOM)

### 異常検知テスト

Mock Bot 起動時に以下の異常を検知:

| Signal | Value | Mean | Z-Score |
|--------|-------|------|---------|
| a | 273.55 | 30.39 | 2.83 |
| r | 0.125 | 0.014 | 2.83 |
| d | 8 | 0.89 | 2.83 |
| f | 16 | 1.78 | 2.83 |

---

## 今後の拡張 (保留)

### AI 分析 (二段構え監視の第二段)

現在は統計的処理のみ。将来的に:

1. 統計的異常を検知
2. 異常データを LLM に送信
3. 「何が起きているか」の分析結果を取得
4. より適切な Environmental Node を生成

### Cell 単位の Pulse

現在は `cid: "global"` で全体統計のみ。
将来的には SpatialField のセル単位で PulsePacket を生成。

---

## トラブルシューティング

### ビルドが反映されない

```bash
# renalCore を強制再ビルド
cd services/renalCore
rm -rf dist
npx tsc

# periphery の依存関係を更新
cd services/periphery
rm -rf node_modules/@sphere/renal-core
npm install
```

### UDP が届かない

- Windows Firewall でポート 41234 が開いているか確認
- `broadcastAddress` を `127.0.0.1` から `localhost` に変更してみる

---

## Windows 環境での注意点

### Git Bash + Windows パスの問題

Claude Code (CLI) は Git Bash を使用するが、Windows パスとの組み合わせで問題が発生することがある。

**症状**:
- `ls "C:\Users\..."` が出力をキャプチャできない
- `npx tsc` が無言で失敗（エラーも出力もなし）
- バックグラウンドタスクの出力が空になる

**原因**:
- Git Bash は Unix 風のシェルだが、Windows パス (`C:\...`) との互換性が不完全
- 一部のコマンドは実行されるが、stdout がキャプチャされない
- `"` (ダブルクォート) の扱いが Git Bash と Windows で異なる

**解決策**:

```bash
# NG: Git Bash で直接実行
ls "C:\Users\kazuh\Desktop\..."
npx tsc

# OK: PowerShell 経由で実行
powershell -Command "ls 'C:\Users\kazuh\Desktop\...'"
powershell -Command "cd 'C:\path\to\project'; npx tsc"
```

**推奨ワークフロー**:

1. ファイル操作・検索: Claude の `Glob`, `Grep`, `Read` ツールを使用
2. npm/tsc コマンド: `powershell -Command "..."` で実行
3. 長時間実行プロセス: ユーザーに別ターミナルでの実行を依頼

**教訓**:
> Windows 環境では最初から PowerShell を使うべき。Git Bash + Windows パスは信頼性が低い。

---

## 関連ドキュメント

- [docs/terminology.md](../docs/terminology.md) - Observatory, Environmental Node の定義
- [reports/PHASE3_COMPLETION_MEMO.md](./PHASE3_COMPLETION_MEMO.md) - Phase 3.0 実装
- [services/observatory/README.md](../services/observatory/README.md) - Observatory 詳細
