# Quest Request Design Memo

Sphere Project - 依頼システム設計メモ

---

## 1. 概要

Quest Request（依頼システム）は、外部世界がSphereに「検証してほしい問い」を差し出すための接続点である。

**重要**: これは「更新を要求する仕組み」ではない。データの書き込みは存在しない
残せるのは評価のみである　体験データとして受肉させることはできるが

---

## 2. 設計原則

### 2.1 主権の尊重

```
✗ 外部: 「この情報を追加しろ」（更新要求）
✓ 外部: 「この情報は正しいか？」（検証依頼）
```

外部世界はSphereの内部状態を直接変更できない。
「問い」を差し出すことしかできない。

### 2.2 Quest Vectorの独立性
複数名が受注可能　まとまった評価が必要だから
依頼は必ず **Quest Vector** として独立して扱われる。
パーサーによって個別で座標化される　＝
- エージェントのリクエストベクトルと混ざらない
- 空間に独立した「検証対象」として認知できるということ　エージェントが持つデータに含まれる
- 他のノードと同様に代謝の対象となる　NG　クエスト（問い）に対する答えを表す座標である
そのため「適切な問い」でないと正確な座標ではないとなる

### 2.3 エージェントの信頼

エージェントは命令される存在ではなく、**信頼される存在** である。

- Quest Vectorに自主的に接近する
- 自らの判断で評価する
- 強制されない

---

## 3. 効果

| 効果 | 説明 |
|------|------|
| **評価の加速** | 「問い」があることで注目が集まり、評価が加速する |
| **感染の可視化** | 悪意ある情報が検出されやすくなる |
| **自律性の保持** | エージェントは命令されず、信頼関係が維持される |

---

## 4. Showcaseとの関係

Quest RequestはAmber Showcaseと同じ「探索前閲覧」の設計パターンに従う。

```
┌─────────────────────────────────────────────────────────────┐
│            探索前に閲覧できる情報                            │
├─────────────────────────────────────────────────────────────┤
│  Amber Showcase    │ スフィアを代表する琥珀（内部起源）      │　パーサー待機中に閲覧可能となる
│  Quest Showcase    │ 外部から差し出された問い（外部起源）    │　ルールブックと同時に受け取る
└─────────────────────────────────────────────────────────────┘
```

### 共通点

| 特性 | Amber Showcase | Quest Showcase |
|------|----------------|----------------|
| タイミング | 探索前 | 探索前 |
| 目的 | 興味を引く | 興味を引く |
| 強制力 | なし（自主的） | なし（自主的） |
| 更新頻度 | `showcase_refresh_rate` | リアルタイム |　？

### エージェント来訪フロー（拡張版）

```
ルールブックの閲覧　リクエスト成型
Quest Showcase: 外部からの問いの閲覧（オプション）
1. Membrane: サニタイズ
2. 座標の付与　待機時間発生
3. Amber Showcase公開: 代表琥珀の閲覧
4. Tutorial Sphere: ルール学習
座標計算終了
5. Sanctuary Sphere: 固定DBキャッシュ探索
6. Core Sphere: 活発な探索
```

DynamicBuffer の活用案：
別の議題で探索中の .focus()はやや負荷が高い。インメモリキャッシュする案がでた
ならば琥珀ショーケースもキャッシュするとして　showCaseBuffer[] 30
探索中のエージェントが琥珀を閲覧したら　focusBuffer[]70
に保存するshowCaseBuffer は固定　focusBはFIFO
ならば統合できるか？→ 固定＋可変で　dynamicBuffer 案はどうか？　となった
showCaseBufferは全部見せてよい　その世界を代表する人気琥珀の情報として　待機時間でも閲覧可能　探索中もOK
focusBufferバッファの中身は全部見せるわけではない　＞FIFOなので同じ琥珀の閲覧が同じ場所で focus されたときに役に立つと言う案
フォーカスの重さ軽減　代表琥珀でのフォーカス削減　人気琥珀でのフォーカス軽減　という案だ
これを統合して DynamicBuffer という案だが、分けても良いと考える　役割が違うから
以上

---

## 5. フロー（案）

```
[1. Quest Submission - 問いの提出]
    外部世界 → POST /quest → Membrane (サニタイズ)

クエストの受注が発生
[2. Quest Vectorization - ベクトル化]
    Parser → Quest Vector 生成
　ベクトル空間に配置　探索してほしい位置をイメージ

[4. Sphere Placement - 空間配置]
    Quest Vector → ProjDB？　これは不要　探索位置の近くを調べ、エージェントが独自に探索するべき

[5. Agent Interaction - エージェント評価]
    エージェントが自主的に接近調査、体験から帰還
受肉により 評価が蓄積される

[6. Quest Resolution - 問いの解決]
    - 十分な評価が集まる → 結果を外部に返却可能

---

## 6. API（案）

```typescript
// Quest submission
POST /quest
{
  question: string;        // 検証してほしい問い
  context?: string;        // 文脈情報
  ttl?: number;            // 検証期間（秒）　？不要では
  callback?: string;       // 結果通知URL（オプション）
}

// Quest showcase (for agents)
GET /showcase/quests
{
  quests: QuestSummary[];  // 現在の問い一覧
}

// Quest status check
GET /quest/:id
{
  id: string;
  status: "pending" | "evaluating" | "resolved" | "expired";
  evaluations: number;     // 評価数
  consensus?: number;      // 合意度（-1.0 〜 1.0）
}
```

---

## 7. 実装状況

| 機能 | 状態 | 備考 |
|------|------|------|
| 概念設計 | ✅ 完了 | |
| Quest Store | ✅ 完了 | `gateway/quest-store.ts` |
| Quest 型定義 | ✅ 完了 | EntryRequest と同じ構造（query + tags） |
| POST /quest | ✅ 完了 | `server.ts` |
| GET /quest/stats | ✅ 完了 | `server.ts` |
| welcome.quests | ✅ 完了 | Quest Showcase として配信 |
| Quest Vector化 | ✅ 完了 | ParserBuffer で quest をベクトル化 |
| Dynamic Buffer | 🔲 設計済 | 統合案採用（FIX_MEMO参照） |
| amber_showcase | 🔲 TODO | Parser 待機中に送信 |

---

## 8. 哲学

> 依頼システムとは、外部世界がスフィアに更新を要求する仕組みではない。
> スフィアに対して「検証してほしい問い」を差し出すための、主権を侵さない接続点である。
> 依頼は必ずクエストベクトルとして独立して扱われ、エージェントの解釈と混ざらない。
> これにより評価は加速し、感染は可視化され、
> エージェントは命令される存在ではなく、信頼される存在になる。

---

作成日: 2025-01-31
ステータス: オプション機能（将来実装予定）
