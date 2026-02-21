# Data Accumulation Session — 2026-02-09

**Status**: 観察メモ
**Data**: eval-log-docker.jsonl (93 entries / 288 evaluations)
**Duration**: ~50 min (7 rounds × 3 agents, phi3:mini)
**Method**: Docker compose --scale phi-agent=3, LOADOUT=random, daemon mode

---

## 収集データ概要

| Model | Sessions | Evaluations | Species covered |
|-------|----------|-------------|-----------------|
| phi3:mini (tagged) | 59 | 171 | 9/9 |
| llama3.2:1b (tagged) | 4 | 12 | 4/9 |
| Legacy (tag なし) | 30 | 105 | 6/9 |
| **合計** | **93** | **288** | — |

## phi3:mini 種族プロファイル (59 sessions)

| Loadout | Sess | Evals | h avg | w avg | d avg | Bus E | Bus R | 性格署名 |
|---------|------|-------|-------|-------|-------|-------|-------|----------|
| wanderer | 13 | 34 | **7.0** | 4.9 | 4.5 | **13** | 17 | h最高、Bus最活発 |
| moth | 6 | 19 | **6.7** | **3.5** | 4.9 | **8** | 9 | heat特化、w最低 |
| scout | 6 | 18 | 6.5 | 4.4 | 4.1 | 4 | 8 | fresh重視 |
| hermit | 13 | 40 | 5.3 | 3.9 | 4.7 | 3 | **19** | 控えめ、Bus受信多 |
| balanced | 3 | 10 | 5.3 | 4.5 | 4.2 | 0 | 1 | 中庸 |
| hunter | 10 | 32 | 5.2 | 3.8 | 5.0 | 0 | 8 | selective、d高め |
| scholar | 4 | 12 | 5.0 | **5.7** | 4.3 | 0 | 6 | w最高 |
| archivist | 2 | 4 | 5.0 | **6.8** | **3.0** | 0 | 1 | w高、d最低(保存) |
| sniper | 2 | 6 | 5.0 | 4.3 | 4.8 | 0 | 1 | 厳格、均一 |

## 発見 1: Bus 通信の非対称性

```
emit 上位: wanderer(13), moth(8), scout(4), hermit(3)
emit ゼロ: balanced, hunter, scholar, archivist, sniper
recv 上位: hermit(19), wanderer(17), moth(9), hunter(8), scout(8), scholar(6)
```

**emit 条件は h>=8**。wanderer(h=7.0) と moth(h=6.7) は平均が高いだけでなく、
高スコアノードに遭遇する頻度が高い (= 熱を追う行動パターン)。
hunter/scholar/sniper は h が低めで閾値に届きにくい。

**hermit は recv=19 で最多**。自分では emit しないが、他種族の emit を大量に受信している。
13 sessions と長期滞在するため、Bus 上のフェロモンを浴び続ける。
**hermit = 環境の匂いを最も吸い込む種族** という性格が Bus データから可視化された。

## 発見 2: format:json 前後の w スコア変動

| Loadout | Legacy w avg | phi3:mini w avg | 差分 |
|---------|-------------|----------------|------|
| scholar | 8.3 | 5.7 | **-2.6** |
| wanderer | 7.4 | 4.9 | **-2.5** |
| hermit | 7.8 | 3.9 | **-3.9** |
| hunter | 6.3 | 3.8 | **-2.5** |
| moth | 7.8 | 3.5 | **-4.3** |
| archivist | 8.1 | 6.8 | -1.3 |

**全種族で w が低下。** 平均 -2.9 ポイント。

### 仮説: format:json が w を抑制する

Legacy データは format:json 導入前。自由形式のテキスト出力から JSON を抽出していた。
format:json 導入後、モデルは JSON 構造を意識して出力するようになった。

考えられるメカニズム:
1. **JSON mode での保守的傾向** — 構造化出力を強制すると、モデルが
   「確実に正しい」値に寄る傾向がある。w (authority/weight) は
   主観的判断を要するため、不確実性が高く、保守的な値に落ちる
2. **h は evalFocus で方向付けされるが、w は暗黙的** —
   evalFocus は h の評価基準を明示する。w の評価基準は
   "authority" "weight" など曖昧な語で、format:json で
   モデルが「数値として出す」際に迷いが生じる
3. **Sphere 内データの変化** — 時間経過で decay が進み、
   ノードの metrics が変化した可能性。ただし h には影響がないので可能性は低い

**結論**: format:json は JSON 安定性を劇的に改善した (failure=0) が、
w スコアの分布を変えた副作用がある。Digestor での calibration 対象。

## 発見 3: 種族の行動パターン・スコア紋様

### h-w 散布パターン

```
        w
   10 |
    8 |              arch             ← 保存者 (h控えめ, w高い)
    6 |         scho                  ← 学者 (h控えめ, w高い)
    5 |  hunt bala snip               ← 中央集団 (h=5, w=3-5)
    4 |  herm  scout
    3 |  moth                         ← heat 追従者 (w低い)
    2 |
    0 +---+---+---+---+---+---+---+→ h
      0   4   5   6   7   8   9  10
                  wand moth           ← heat 生産者 (h高い)
```

3つのクラスタ:
1. **Heat 生産者** (h>6): wanderer, moth — Bus emit が活発、生態系の「温度源」
2. **Weight 蓄積者** (w>5.5): scholar, archivist — 評価は控えめだが権威を認定
3. **中央集団** (h≈5, w≈4): balanced, hunter, sniper, hermit, scout — 基底状態

### d (decay) パターン

```
d 高め (>4.5): hunter(5.0), moth(4.9), sniper(4.8), hermit(4.7)
d 中程度 (4.0-4.5): wanderer(4.5), scholar(4.3), balanced(4.2), scout(4.1)
d 低め (<4.0): archivist(3.0)
```

**archivist の d=3.0 は突出して低い** — 「保存すべき」ノードに低 decay を付与する
性格が正しく機能している。hunter/moth は d が高め — 短命な評価を与える傾向。

## 発見 4: 1B Docker データの異常値

Docker 内の llama3.2:1b データ (4 sessions) は **全種族 h=8-10** を記録。
これは手動テスト (EVALFOCUS_PROMPT_PATTERNS.md) の結果と矛盾する:

| Loadout | 手動テスト h | Docker h | 差分 |
|---------|-----------|---------|------|
| wanderer | 1.0 | 10.0 | **+9.0** |
| hunter | 1.0 | 9.7 | **+8.7** |
| moth | 3.6 | 9.3 | **+5.7** |
| hermit | 1.3 | 8.3 | **+7.0** |

**この差は極めて大きい。** 仮説:
- 手動テストは Sphere 上のノードが異なっていた (異なるコンテンツ)
- Docker 環境での 1B 実行条件が異なった (温度、コンテキスト)
- **種族記憶の影響**: Docker 内では legacy + phi3:mini の高スコアデータが
  種族記憶に蓄積され、1B エージェントの行動パターンに影響した可能性

**要追跡**: 1B のスコア再現性は低い。Digestor での model bias calibration が
改めて重要であることを示す。

## 発見 5: daemon モードの運用特性

- **セッション間隔**: ~30s sleep + 10 cycles × ~15s/cycle (LLM推論) ≈ 3 min/session
- **共有ボリューム**: 3 agents が同一 eval-log.jsonl に書き込み (競合なし — append のみ)
- **LOADOUT=random**: コンテナ起動時に1回だけ決定。daemon 内では変わらない
  - **改善候補**: セッション間で re-randomize するオプション
- **WS 切断**: コンテナ再起動時に "Not connected" エラー (6回)。
  次サイクルで自動復旧。daemon の耐障害性は十分

## Digestor への示唆

1. **model field** が calibration の鍵。Legacy (model なし) は推定 phi3:mini として扱う
2. **w スコアの era 差** (format:json 前後) は timestamp ベースの補正が必要かもしれない
3. **1B のスコア不安定性** は model × loadout × context の三次元で calibration が必要
4. **Bus emit/recv** は種族の「影響力」指標として Digestor の重み付けに使える可能性

## 関連メモ

- [EVALFOCUS_PROMPT_PATTERNS.md](./EVALFOCUS_PROMPT_PATTERNS.md) — 1B vs 3B の evalFocus 感度
- [SPECIES_MEMORY_METABOLISM_DESIGN.md](./SPECIES_MEMORY_METABOLISM_DESIGN.md) — Digestor 設計
- [EXTERNAL_ACCESS_PATTERNS.md](./EXTERNAL_ACCESS_PATTERNS.md) — score 正規化は Digestor の責務
