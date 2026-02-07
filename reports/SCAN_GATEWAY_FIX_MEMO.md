# Gateway Scan ハンドラ修正メモ (2026-02-07)

## 変更の背景

Gateway の `case "scan"` が**移動システムの `context.scan()`** を呼んでいた。
これは知覚層の `scanL1()` (L1 tags、Fossil 検出可) ではなく、
移動用の `ScanResult` (heat, signature) を返す別物だった。

結果: UI の Scan ボタンが常に 0 nodes を返していた。

## 変更内容

### 1. gateway-server.ts

```diff
- case "scan": {
-   const nodes = await context.scan();
+ case "scan": {
+   const nodes = await context.scanL1(msg.radius);
```

- `AgentMessage` の scan 型に `radius?: number` 追加
- `GatewayMessage` の scanResult 型を `ScanResult[]` → `L1ScanResult[]` に変更

### 2. sphere-context.ts

新メソッド `scanL1(radius?)` を追加:

```typescript
async scanL1(radius?: number): Promise<L1ScanResult[]> {
  this.checkSession();
  this.updateActivity();
  const r = radius ?? 2.0;
  if (this.coreAdapter) {
    return this.coreAdapter.scanL1(this._embeddingVector, r);
  }
  return [];
}
```

- `L1ScanResult` を import に追加
- **既存の `scan()` メソッドは移動システム用にそのまま残している**

## 注意: 既存 scan() は削除していない

`context.scan()` (移動システム用) はそのまま残っている。
これは `movementState.scan(nodes)` に渡すための内部メソッド。
Gateway ハンドラからの呼び出しのみ `scanL1()` に変更した。

もし移動システムも scan を使っている場所があれば、そちらは影響なし。

## Radius スケールの違い (重要)

| API | radius の意味 | 実効距離の計算 |
|-----|--------------|---------------|
| `/sphere/explore` (REST) | cosine distance 直値 | `radius` そのまま |
| `sense()` (WS) | 乗数 | `basePerceptionRadius(0.5) × radius` |
| `scanL1()` (WS) | 乗数 | `basePerceptionRadius(0.5) × radius` |

つまり:
- explore radius=1.2 → 実効 1.2
- sense/scan radius=3 → 実効 0.5 × 3 = 1.5

UI のデフォルト:
- Inject tab (explore): radius=1.2
- Dive tab (sense/scan): radius=3 (乗数)

## ロールバック手順

もし問題が出た場合:

```typescript
// gateway-server.ts を元に戻す
case "scan": {
  const nodes = await context.scan();  // 移動システム版に戻す
  this.send(socket, { type: "scanResult", requestId, nodes });
  break;
}
```

- GatewayMessage の scanResult 型を `ScanResult[]` に戻す
- AgentMessage の scan 型から `radius?` を削除
- sphere-context.ts の `scanL1()` メソッドは残しても無害
