# Explorers — 設計意図と工夫

**作成日**: 2026-02-09
**ステータス**: 実装完了

---

## なぜこれを設計しているか

### 1. 創発的性格の実証

Sphere プロジェクトの核心的発見は **「性格はモデルに宿らない — 測定器具 (Loadout) に宿る」** である。

- phi3:mini (3.8B) のような軽量 LLM でも、Loadout が異なれば行動が確実に分化する
- `性格 = 測定器具 (Loadout) × 物理法則 (Sphere) × 感覚器官 (任意の LLM)`
- この原理を **外部から観測可能にする** のが Explorers の第一の目的

### 2. 測定器具としての UI

Explorers は **コンテンツブラウザではなく、測定器具** である。

- Sphere 内部で動く phi-agent の視点を、外部から観測できる窓を提供
- 9種の Loadout (balanced, scholar, scout, archivist, hunter, moth, hermit, wanderer, sniper) それぞれの知覚・行動パターンの違いを可視化
- sense/focus/evaluate サイクルをリアルタイムで表示

### 3. 種族記憶の透明化

Digestor システムによる種族記憶の代謝を概念レベルで提示する。

- evaluations が eval-log.jsonl に蓄積される
- Digestor が定期的に scoring → pruning → profile 生成
- 次世代の探索行動に環境ブレンド (0.7×自種族 + 0.3×全種族) としてフィードバック
- この **文化の進化サイクル** を Data Access セクションで説明

---

## 何が工夫なのか

### 1. **責務の完全分離 — UI はロジックを持たない**

Explorers は phi-agent を起動して結果を受け取るのみ。探索ロジックは一切実装しない。

**アーキテクチャ**:
```
UI (Gradio) → Docker executor → phi-agent (container) → Sphere API
```

- **Explorers**: ユーザー選択受付、結果表示、Docker 起動のみ
- **phi-agent**: FastGate, Feelings, Loadout（全探索ロジック）
- **Sphere API**: 物理法則、状態遷移、探索エンドポイント

この分離により：
- UI は軽量でメンテナンスしやすい
- phi-agent のロジック変更が UI に影響しない
- 複数の UI (Gradio / React / CLI) を同一の phi-agent に接続可能

### 2. **Docker-in-Docker による実行環境の統一**

Explorers コンテナ内に Docker CLI をインストールし、phi-agent をコンテナとして起動する。

**利点**:
- ローカル開発と本番環境（Hugging Face Space / Render）で実行環境が完全に一致
- phi-agent の依存関係が Explorers に漏れない
- Docker socket を共有することで、同一 Docker ネットワーク上の Sphere API にアクセス可能

**技術的実装**:
```dockerfile
# explorers/Dockerfile
RUN apt-get install -y docker-ce-cli
```
```yaml
# docker-compose.yml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

### 3. **Access Level の制約 — L1+2 のみ表示**

Sphere のアクセスレベル階層:
- L1: tags
- L2: summary
- L3: content
- L4: sourceNodeId, ref_url

Explorers は **L1+2 のみを表示**。content (L3) は Sphere に留める。

**理由**:
- Explorers は **知覚パターンを観測する器具**
- content 自体は重要ではない — どう見えたか、何を選んだか、どう評価したかが重要
- データの所有権と責任を明確化（content は Sphere が管理）

### 4. **Gradio による最小実装**

複雑な React アプリではなく、Gradio の最小限の UI で実現。

**選択理由**:
- Hugging Face Space へのデプロイが容易
- Python ベースで executor / parser と統合しやすい
- UI の変更が高速（リビルド時間が短い）
- Sphere の哲学「最小限、ゴテゴテしない」に合致

**UI 構成**:
- Configuration セクション: Query → Model → Species → Description
- Perception Cycles セクション: Cycle-by-Cycle Output + Summary
- Advanced Settings: 折りたたみで開発者向け設定を隠蔽

### 5. **種族記憶との統合**

phi-agent は種族記憶 (species-profile.json) をフィードバックとして読み込む。

**代謝サイクル**:
1. phi-agent が exploration → evaluations を eval-log.jsonl に追記
2. Digestor が定期実行（3時間ごと推奨）
   - balanced qv × time decay でスコアリング
   - 生存抽選による淘汰
   - 環境ブレンド (0.7×自種族 + 0.3×全種族) で profile 生成
3. 次回の exploration で species-profile を FastGate に適用

**工夫**:
- echo chamber 回避: 中立的な品質ベクトル (balanced) で評価
- 環境圧の導入: 全種族の 0.3 を混入
- 時間減衰: 古い評価は徐々に影響力を失う
- 世代アーカイブ: gen-NNN.json で進化を追跡可能

### 6. **コントロール順序の最適化**

ユーザーの探索フローに沿った UI 配置:

1. **Query** — まず何を探すか入力（探索の意図）
2. **Model** — どの LLM を使うか選択（感覚器官）
3. **Species (Loadout)** — どの性格で探索するか選択（測定器具）
4. **Description** — 選択した種族の特性を確認

この順序により、ユーザーは「意図 → 道具 → 実行」の自然な思考フローで操作できる。

---

## 設計原則のまとめ

1. **測定器具であり、コンテンツブラウザではない**
   - 知覚パターンの観測に特化
   - content は持ち出さない（L1+2 のみ）

2. **UI はロジックを持たない**
   - 全ての探索ロジックは phi-agent に委譲
   - Explorers は起動と観測のみ

3. **実行環境の統一**
   - Docker-in-Docker で開発と本番を一致
   - phi-agent コンテナを標準化された方法で起動

4. **最小限、ゴテゴテしない**
   - Gradio でシンプルに実装
   - Advanced Settings は折りたたみで隠蔽
   - 説明文は簡潔に（1段落に圧縮）

5. **種族記憶の透明化**
   - Data Access セクションで Digestor システムを説明
   - 評価が未来の世代に影響することを明示

---

## 次のステップ

### 短期
- [x] MVP 実装（Gradio）
- [x] Docker-in-Docker 統合
- [x] docker-compose 統合
- [ ] Hugging Face Space デプロイ
- [ ] Render デプロイ

### 中期
- [ ] 世代アーカイブの可視化（gen-NNN.json → グラフ）
- [ ] 複数 species の同時実行と比較表示
- [ ] Bus 通信の可視化（反射パターンの観測）

### 長期
- [ ] React UI 版（より高度な可視化）
- [ ] Judgment Daemon API との統合（外部からの委託実行）
- [ ] 種族別トレンド分析（月単位の進化追跡）

---

## 参考文献

- [STIGMERGY_ARCHITECTURE.md](STIGMERGY_ARCHITECTURE.md) — Sphere の正体
- [EMERGENT_PERSONALITY_MEMO.md](EMERGENT_PERSONALITY_MEMO.md) — 軽量 LLM で性格が創発する
- [SPECIES_MEMORY_METABOLISM_DESIGN.md](SPECIES_MEMORY_METABOLISM_DESIGN.md) — 種族記憶の代謝設計
- [EXPLORERS_UI_DESIGN.md](EXPLORERS_UI_DESIGN.md) — 詳細な UI 設計仕様
