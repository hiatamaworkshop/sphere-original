# Vestibule Layer Design

Date: 2026-02-23
Status: Design (未実装)

## 背景

エージェントの探索終了 (return) から切断までの処理に「場」がない。
現状は return → 即 Pipeline → 即 socket.close() で、silent disconnect ではデータが全て消失する。
capsule が optional になった現在、evaluations (pheromone) がセッションの主要成果だが、
silent disconnect 時にそれを救済するパスが存在しない。

## 設計理念

Vestibule は Sphere とエージェントの間の**出口膜**。
入口膜 (Gatekeeper → Ticket → EntryRequest) と対称に、
出口で体験と成果を精算する場。

```
入口膜: Gatekeeper → Ticket → EntryRequest → Tutorial
                     (who are you? what do you want?)

出口膜: Core → Vestibule → finalize → disconnect
               (what did you do? what do you take?)
```

## Layer 遷移

```
Tutorial → Sanctuary → Core → Vestibule → 切断
```

Vestibule は第4のレイヤー。既存の layer 遷移モデルに乗る。

## 全退出経路の合流

```
return     ─→ ┐
expelled   ─→ ├─→  Vestibule  ─→  finalize  ─→  切断
disconnect ─→ ┘
```

| 経路 | モード | エージェント |
|------|--------|-------------|
| return | Interactive | 接続中 — コマンド実行可能 |
| expelled (TTL/energy) | Interactive | 接続中 — コマンド実行可能 |
| silent disconnect | Serverside | 不在 — サーバーが代理で即時処理 |

再接続は原則なし。

## Vestibule 遷移時の自動処理

エージェントの関与不要。Sphere の利益のために無条件実行:

1. `_ended = true`
2. `endFocus()` + `clearTimers()`
3. `buildAutoCapsule(actionLog)` — 行動ログの監査用保存
4. `bufferedEvaluations` 抽出 → **Pipeline.ingest() 即時送信**
5. `layer = "vestibule"`

evaluations は Sphere の代謝に直結するため、エージェントの意思を介在させない。

## Capability Negotiation

Vestibule 遷移後、サーバーがエージェントに実行可能コマンドを提示:

```json
{
  "type": "vestibuleEntered",
  "auto": {
    "evaluationsApplied": 7,
    "autoCapsuleSaved": true
  },
  "commands": [
    { "name": "submitCapsule",   "description": "Submit NodeSeeds for incarnation" },
    { "name": "viewReceipt",     "description": "Metabolic impact of your evaluations" },
    { "name": "viewTrail",       "description": "Your exploration trajectory" },
    { "name": "viewDiscoveries", "description": "Notable nodes encountered" },
    { "name": "acknowledge",     "description": "Complete session and disconnect" }
  ],
  "farewell": "..."
}
```

全ての操作を実行可能コマンドとして統一提示 (Resource Exposure を別系統にしない)。
サーバーが capabilities を制御 — Sphere Original では最小セット、
後続の開発者がコマンドを追加するだけで拡張可能。

## Sphere Original 実装スコープ

| コマンド | 実装 | 備考 |
|---------|------|------|
| submitCapsule | 実装する | NodeSeed incarnation (既存 Pipeline 接続) |
| viewReceipt | 実装する | エージェント行動の観察に有用 |
| viewTrail | 実装する | エージェント行動の観察に有用 |
| viewDiscoveries | 実装する | エージェント行動の観察に有用 |
| acknowledge | 実装する | 正式退出 (必須 or TTL timeout) |

### 将来の拡張コマンド (stub / 未実装)

| コマンド | 用途 |
|---------|------|
| modifyCapsule | capsule 提出前の修正 |
| requestTakeaway | セッションデータの持ち帰り |
| transferToFacade | facade sphere へのバッファ転送 |
| requestSummary | Sphere 側生成のセッション要約 |

## Pipeline 接続の整理

### 現状 (2つの入口)

```
External HTTP ─────────────→  Pipeline.ingest()
  POST /sphere/contribute      (Gatekeeper 検証あり)
  (server.ts 直結)

Agent WS ─→ ReturnHandler ─→  Pipeline.ingest()
  return(capsule)               (Gatekeeper 二重検証)
```

ReturnHandler が Gatekeeper.validate() を自前で呼び、Pipeline 内部でも再度検証 = 二重検証。

### Vestibule 導入後

```
External HTTP ──────────────────────→ Pipeline.ingest()
  (セッションなし、従来通り)              ↑
                                         │
Agent (全退出経路)                        │
  ↓                                      │
  Vestibule                              │
  ├─ evaluations → Pipeline (自動)       │
  └─ submitCapsule → Pipeline ───────────┘
       (Gatekeeper は Pipeline 内の1回のみ)
```

ReturnHandler は Vestibule に吸収され削除。二重 Gatekeeper 検証も解消。

## Vestibule フロー詳細

### Interactive mode (return / expelled)

```
return / expelled
    │
    ▼
enterVestibule(proposedCapsule?)
    ├─ 自動処理 (evaluations flush, AutoCapsule 構築)
    ├─ layer = "vestibule"
    └─ send(vestibuleEntered, { auto, commands, farewell })

    [エージェントがコマンドを実行]
    ├─ submitCapsule → Pipeline.ingest(capsule) → 結果返却
    ├─ viewReceipt → セッション影響データ返却
    ├─ viewTrail → 行動軌跡データ返却
    ├─ viewDiscoveries → 発見ノード一覧返却
    └─ acknowledge → socket.close(1000)

    [TTL timeout → 強制 acknowledge]
```

### Serverside mode (silent disconnect)

```
socket.on("close")
    │
    ├─ if (!_ended)
    │     enterVestibule()   ← serverside
    │     (evaluations → Pipeline 自動)
    │     (AutoCapsule 保存)
    └─ cleanup
```

## Vestibule TTL

既存の `disconnectGraceSeconds` (120s) を Vestibule の滞在上限に転用。
- Interactive: TTL 超過 → 強制 acknowledge → 切断
- Serverside: 即時処理 (TTL 不要)

## gateway-server.ts 変更概要

```typescript
// return ハンドラ
case "return": {
  await context.enterVestibule(msg.capsule);
  this.send(socket, { type: "vestibuleEntered", ... });
  break;  // 切断しない
}

// Vestibule コマンド
case "submitCapsule": { ... }
case "viewReceipt": { ... }
case "viewTrail": { ... }
case "viewDiscoveries": { ... }
case "acknowledge": {
  this.send(socket, { type: "farewell" });
  socket.close(1000);
  break;
}

// expelled ハンドラ
context.on("expelled", async (reason) => {
  await context.enterVestibule();
  this.send(socket, { type: "vestibuleEntered", reason, ... });
  // 切断しない — エージェントが acknowledge するまで待つ (TTL あり)
});

// close ハンドラ
socket.on("close", () => {
  if (!context.ended) {
    context.enterVestibule();  // serverside — evaluations 自動 flush
  }
  // cleanup...
});
```

## Quest 処理 (別途議論)

Vestibule はクエスト完了判定・報酬処理の自然な場所になる可能性がある。
詳細は別途設計。

## 関連ファイル

| ファイル | 変更内容 |
|---------|---------|
| `gateway-server.ts` | return/expelled/close ハンドラ書き換え、Vestibule コマンド追加 |
| `sphere-context.ts` | enterVestibule(), finalize() 追加、_processReturn() 廃止 |
| `return-handler.ts` | 削除 (Vestibule に吸収) |
| `rulebook/index.ts` | phases 更新、Vestibule セクション追加 |
| `sphere.config.json` | vestibule TTL 設定 |
