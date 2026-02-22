# Ghost/Fossil フィルタ — 設計メモ

**Date**: 2026-02-08
**Status**: 設計確定、未実装

---

## 核心: 2つの評価パス

Ghost/Fossil は **focus() で拒否されるが evaluate() は受け付ける**。これが設計の出発点。

```
Full Path (現行 Light Agent):
  sense → pickTarget → focus(10e) → LLM eval → evaluate(3e)
  対象: Active/Amber のみ
  LLM: 1回/cycle

Light Path (Ghost/Fossil 向け):
  sense → Ghost/Fossil 検出 → focus なし → メタデータ評価 → evaluate(3e or 減額)
  対象: Ghost/Fossil
  判断材料: summary(Ghost), tags, heat, weight, decay, flags
  LLM: 0回 (Vector Agent の評価パスそのもの)
```

**原則: 軽量 LLM に余計な判断コストを持たせない。**
Ghost/Fossil の評価はメタデータ (数値) で十分 — LLM を呼ぶ理由がない。

---

## 現状: Ghost/Fossil の知覚パイプライン

| 操作 | Ghost | Fossil | コスト |
|------|-------|--------|--------|
| **scanL1()** | 見える (tags) | 見える (tags) | 1 energy |
| **sense()** | 見える (summary あり) | 見える (summary 空) | 3 energy |
| **focus()** | **拒否** (null) | **拒否** (null) | 10 energy |
| **evaluate()** | **動く** | **動く** | 3 energy |
| **move gradient** | 参照される | 参照される | 含む |

### 現状の問題

- Ghost が sense() で返り、FastGate が選択 → focus() で拒否 → **10 energy + 時間を浪費**
- Fossil は `Compressed` フラグ (0x4000) で pickFocusTarget() から既にハード除外済み
- Ghost はハード除外されていない

---

## 設計上の分離点

移動と知覚は別レイヤーで処理されている:

```
移動の勾配計算 → Sphere 側 (sphere-context.ts)
  → _visibleNodes (sense で得た全ノード) から方向を算出
  → Ghost/Fossil も勾配に寄与する ← これは物理

フォーカス対象選択 → phi-agent 側 (FastGate)
  → pickFocusTarget() でスコアリング
  → ここが性格フィルタの場所
```

phi-agent が Ghost/Fossil をフィルタしても、Sphere 側の移動勾配には影響しない。**移動の要としての機能は保証されている。**

---

## Light Agent の対応: Ghost をフォーカス対象から除外

Light Agent (LLM 評価型) にとって Ghost/Fossil は:
- focus() が拒否する → フォーカスしても無駄
- LLM に読ませるテキストがない (Fossil) or 要約のみ (Ghost)
- **判断コストに見合わない**

```typescript
// pickFocusTarget() に追加
if (n.kind === "ghost") continue;   // focus() が拒否、LLM に読ませる価値なし
if (n.flags & Flag.Compressed) continue;  // fossil (既存)
```

前提: `NearbyNode` 型に `kind` フィールドが必要。

---

## Vector Agent の対応: Light Path で評価

Vector Agent (LLM なし) にとって Ghost/Fossil は**評価対象**になり得る:
- focus() を呼ばない → 拒否問題が存在しない
- メタデータ (heat, weight, decay, flags) だけで h/w/d を算出
- Weapon のスコアリングパイプラインがそのまま使える
- **evaluate() は動く** → 代謝に寄与できる

```
Vector Agent の評価パス:
  sense → 全ノード (Active/Ghost/Fossil) → Weapon スコア → h/w/d 変換 → evaluate
  → focus なし、LLM なし、0ms
```

Ghost/Fossil は Weapon の stateBias で soft gate:

```typescript
stateBias: {
  hot: 1.0,
  frozen: 0.5,
  ghost: 0.3,    // Ghost を低優先度に
  fossil: 0.1,   // Fossil をほぼ無視
}
```

常駐 Vector Agent の性格によって Ghost/Fossil への態度が変わる:
- moth (加熱器): ghost bias 高め — 冷えかけのノードも温める
- archivist (保存者): ghost bias 高め — 化石化を遅らせる
- hunter (淘汰者): ghost bias 低め — 死にかけは無視

---

## Sphere 側の検討: evaluate コスト減額

Ghost/Fossil への evaluate() コストを Sphere 側で下げることは理にかなう:
- 死にかけのノードを評価する行為はリスクが低い (生態系を壊しにくい)
- コスト減額は Vector Agent の常駐コストを下げる
- 実装は Sphere 側の gateway/sphere-context.ts で対応

```
evaluate コスト:
  Active/Amber: 3 energy (現行)
  Ghost: 1-2 energy (減額案)
  Fossil: 1 energy (減額案)
```

**判断: 検討する。実装は Vector Agent と同時期。**

---

## 設計判断まとめ

| 判断 | 結論 | 理由 |
|------|------|------|
| Ghost をフォーカス対象にするか | **しない** | focus() が拒否、LLM に余計なコストを持たせない |
| Ghost/Fossil を評価するか | **する (Light Path)** | evaluate() は動く、代謝に寄与できる |
| 評価に LLM を使うか | **使わない** | メタデータで十分、Weapon パイプラインで算出 |
| 移動への影響 | **なし** | 勾配計算は Sphere 側で Ghost/Fossil を含めて処理 |
| Sphere 側 eval コスト減額 | **検討** | Vector Agent の常駐コスト削減に寄与 |
| 実装優先度 | **Vector Agent と同時期** | Light Path は Vector Agent の評価パスそのもの |

### エージェント階層との対応

```
Heavy Agent:  Full Path のみ (Ghost/Fossil 無視)
Light Agent:  Full Path のみ (Ghost/Fossil をフォーカス除外)
Vector Agent: Light Path (Ghost/Fossil も含めてメタデータ評価)
```

**Ghost/Fossil の代謝維持は Vector Agent の仕事。Light/Heavy Agent は生きたノードに集中する。**

---

## 関連

- `COUPLING_LAYER_PHILOSOPHY.md` — エージェント階層と設計原則
- `LLM_AS_JUDGMENT_ELEMENT.md` — LLM を判断素子として扱う設計
- `FAST_PATH_DESIGN.md` — FastGate アーキテクチャ
