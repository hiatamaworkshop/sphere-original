# Layer Separation Philosophy

## Principle: Metabolism over Firewall

Sphere は2つの独立したレイヤーで負荷を処理する。
この分離を維持することで、生態系のコードにインフラの関心事を混入させない。

---

## Layer 1: Ecosystem (Sphere 内部)

**責務**: 自然淘汰による恒常性維持

生態系として自律的に機能する代謝メカニズム。
「防御」ではなく「消化」として過負荷を処理する。

| メカニズム | 機能 | 過負荷時の動作 |
|-----------|------|--------------|
| **CleanerFish hunger** | DB容量 → hunger → 捕食閾値 + 処理量スケーリング | 容量増 → hunger↑ → 消化加速 (最大4倍) |
| **TTL 自然消滅** | 全ノードに有限寿命 | 低品質データは評価されず自然死 |
| **protectionThreshold** | h+w >= 100 で decompose 保護 | 価値あるノードのみ生存 |
| **Ephemeral reset** | 定期的な全状態リセット | 蓄積ダメージを季節の循環で浄化 |
| **Dormancy** | agent 0 → 60秒後に代謝停止 | 不在時のリソース節約 |

**設計上の制約**:
- Sphere のコードに「攻撃検知」「IP制限」「レート制限」を**入れない**
- 大量投入は「大量の餌が来た」として代謝の中で処理される
- 品質の低いデータは評価されないため、TTL 切れで自然に消える

## Layer 2: Infrastructure (Sphere 外部)

**責務**: 悪意あるトラフィックの遮断

Sphere のコードベースには一切含まれない、外部のインフラレイヤー。

| メカニズム | 実装場所 | 目的 |
|-----------|---------|------|
| **レート制限** | nginx / Cloudflare / PaaS | IP 単位の接続頻度制限 |
| **WAF** | Cloudflare / AWS WAF | 既知の攻撃パターン遮断 |
| **接続数上限** | Reverse Proxy | WebSocket 同時接続制限 |
| **TLS** | Let's Encrypt / PaaS | 通信暗号化 |
| **DDoS 防御** | CDN / PaaS | ボリューム攻撃対応 |

**設計上の制約**:
- インフラ設定は Sphere リポジトリに含まない (Dockerfile / docker-compose の範囲まで)
- PaaS (Render, HF Spaces 等) のプラットフォーム機能に委譲

---

## Why This Separation Matters

### 1. 生態系の純粋性

防御コードを Sphere 内に書くと、代謝ロジックとセキュリティロジックが混在する。
例: Gatekeeper に「同一IPからの submit を制限」を入れると、
Gatekeeper の責務が「スキーマ検証」から「スキーマ検証 + アクセス制御」に肥大化する。

### 2. テスト容易性

レイヤー1 は単体テスト可能 (hunger, TTL, CleanerFish の動作検証)。
レイヤー2 はインフラ設定の E2E テスト。
混ぜると両方のテストが複雑になる。

### 3. デプロイ独立性

Sphere のコードを変更せずに、インフラ設定だけで防御レベルを調整できる。
開発環境: レイヤー2 なし (ローカルで自由にテスト)
本番環境: Cloudflare + レート制限 (プラットフォーム側で設定)

---

## Bottleneck Analysis

Sphere の実際のボトルネックは RenalCore の物理演算ではない:

| 処理 | 負荷 | 対処レイヤー |
|------|------|------------|
| Embedding (ベクトル化) | CPU heavy, モデル依存 | L1: EntryBuffer バッチ化 (batchSize: 7) |
| WebSocket I/O | 接続数依存 | L2: 接続数上限 + L1: agent tick 分散 (30ms) |
| cosine distance (explore) | ノード数比例 | L1: 動的サンプルサイズ |
| ノード decay (tick) | 極小 (~1ms / 1万ノード) | 不要 (V8 JIT で十分) |

**Rust 移植の判断基準**: ノード10万件以上、tick 間隔 100ms 以下、
または WASM 化してクライアント物理演算が必要になった時。
現時点では不要 (詳細: claude memory `rust-portability.md`)。

---

## Summary

```
[Internet]
    │
    ├── Layer 2: Infrastructure ── nginx/Cloudflare/PaaS
    │   (rate limit, WAF, DDoS, TLS)
    │
    └── Layer 1: Ecosystem ── Sphere
        ├── Membrane: schema validation (Gatekeeper)
        ├── Metabolism: TTL decay, hunger-driven GC (CleanerFish)
        ├── Homeostasis: state transitions (Arbiter + Bookkeeper)
        └── Dormancy: idle resource conservation
```

**Rule**: Layer 1 に Layer 2 の関心事を入れない。逆も同様。
