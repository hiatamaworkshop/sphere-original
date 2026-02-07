# ActiveBus 設計メモ

## 現状

### 既存の定義

**sphere.config.json**
```json
"activeBus": {
  "enabled": false,
  "protocol": "AI_NATIVE",
  "maxPayloadBytes": 64,
  "samplingRate": 0.5
}
```

**型定義** (`renalCore/types/stable_config.ts`)
```typescript
export interface ActiveBus {
  enabled: boolean;
  protocol: "TEXT" | "AI_NATIVE";
  maxPayloadBytes: number;
  samplingRate: number;
}
```

**関連設定** (`sphere.config.json external_services.agent_gateway`)
```json
"websocket": {
  "path": "/ws/agent",
  "events": ["radar", "echo", "focus_result", "state_change"]
}
```

---

## 設計決定 (2026-02-06)

### 1. 送信先: ブロードキャスト
- **決定**: 全エージェントに送信、受け取るかどうかはエージェント次第
- 宛先指定なし、フィルタリングなし

### 2. トリガー: 明示的アクション
- **決定**: エージェントが `emit` アクションで明示的に発信
- 自動発火なし

### 3. プロトコル: AI_NATIVE
- **決定**: 64byte のベクトル/バイナリ形式
- 人間には理解不能だが、ログは出力する

### 4. 用途: オープン
- **決定**: 何でもあり、エージェントに委ねる
- 発見共有、警告、誘導、状態共有、その他自由

### 5. サンプルレート: 70%
- **決定**: 全メッセージの 70% をログに記録
- 負荷軽減のため全件ログは避ける

---

## 関連機能との比較

| 機能 | 情報量 | 範囲 | 匿名性 | 実装状態 |
|------|--------|------|--------|----------|
| **ActiveBus** | 高 (64byte) | 選択可能 | ID 見える | 未実装 |
| **Focus Echo** | 低 (雰囲気) | 近隣自動 | 匿名 | RenalCore のみ |
| **GlobalField** | なし (磁場) | 全体 | N/A | 実装済 |

---

## 実装設計

### アーキテクチャ
```
Agent A → emit() → RingBuffer[10] → WebSocket push → 全 Agent
                        ↓
                   FIFO で古いのは自動消去
```

**設計思想**: 「掲示板」ではなく「空気中の振動」
- 揮発性通信、永続化なし
- 聞き逃したら終わり

### バッファ設計
- **サイズ**: 10 件 (FIFO Ring Buffer)
- **配信**: Push 式 (WebSocket で即時配信)
- **TTL**: なし (FIFO overflow で自然消滅)
- **メモリ**: 最大 640 bytes (10 × 64)

### メッセージ形式
```typescript
interface BusMessage {
  id: string;           // UUID
  timestamp: number;
  senderId: string;     // Agent ID
  payload: Uint8Array;  // 64 bytes max
}
```

### API

**送信 (Gateway)**
```typescript
// Agent action
{ type: "emit", payload: Uint8Array }

// Gateway 処理
gateway.emit(agentId, payload) → RingBuffer に追加 → WebSocket broadcast
```

**受信 (WebSocket)**
```typescript
// イベント (Push)
{ event: "bus_message", data: BusMessage }
```

### ログ出力 (70% サンプリング)
```
[ActiveBus] emit agent=abc12345 size=64 sample=true
[ActiveBus] emit agent=def67890 size=32 sample=false (skipped)
```

---

## config 更新

```json
"activeBus": {
  "enabled": true,
  "protocol": "AI_NATIVE",
  "maxPayloadBytes": 64,
  "bufferSize": 10,
  "samplingRate": 0.7
}
```

---

## 実装状況 (2026-02-06 完了)

1. [x] `BusMessage` 型定義 → `periphery/src/types/active-bus.ts`
2. [x] `ActiveBusLayer` クラス作成 → `periphery/src/bus/active-bus-layer.ts`
3. [x] Gateway に `emit` アクション追加 → `emitBus()` (名前衝突回避)
4. [x] WebSocket で `bus_message` イベント配信 (Push)
5. [x] sphere.config.json 更新 (bufferSize: 10, samplingRate: 0.7)
6. [x] ログ出力実装 (70% サンプリング)

**Note**: `emit()` は内部 EventEmitter と衝突するため `emitBus()` にリネーム
