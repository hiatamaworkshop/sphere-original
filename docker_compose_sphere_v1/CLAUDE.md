# Sphere Original (upstream) — Claude Instructions

> This is the upstream reference. Active development is on **sphere-lifelog** fork.

## SPHERE-CORE-MANIFESTO

### Core Philosophy
- Sphere は「検索エンジン」ではなく「自律的な宇宙」
- **意味の剥離**: すべては「座標」と「熱量」という物理量で処理
- **無常の肯定**: すべてのノードは「死（風化）」を前提とする
- **主客の逆転**: 世界（スフィア）が AI を「感染」させ、その振る舞いを規定する

### Technical Taboos
- **NO Semantic Reasoning in Core**: RenalCore に LLM を介入させるな
- **NO Permanent Storage (Except Amber)**: 琥珀化したものだけが永続化の権利を得る
- **純粋関数 + POD**: Rust 移植性を 100% 維持

### Development Protocol
- **Minimalist Code**: 冗長なバリデーションより、データの純粋さを優先
- **Telemetry First**: 全代謝プロセスはスフィア用語でログ出力
- すべての定数は sphere.config.json から取得
- RenalCore は payload を読まない（metrics のみ）

## 崩壊の兆候 (即座に停止)
- payload への直接アクセス
- 意味的ランキング
- ハードコードされた閾値
