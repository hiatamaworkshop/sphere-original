# Redis Session 導入メモ

Sphere Project - セッション共有基盤の検討

---

## 1. 導入目的

**Phase 2（50,000同時接続）以降で必須**

| 課題 | 現状 | Redis導入後 |
|-----|------|------------|
| セッション共有 | 不可（インメモリ） | Gateway間で共有 |
| Rate Limit共有 | IP単位で分散 | 正確なカウント |
| フェイルオーバー | セッション喪失 | 再接続可能 |
| 水平スケール | 制限あり | 自由にスケール |

---

## 2. 共有対象データ

### 2.1 必須（Phase 2）

| データ | キー形式 | TTL | 用途 |
|-------|---------|-----|------|
| Session State | `session:{sessionId}` | 120s | 接続状態、position |
| Ticket | `ticket:{token}` | 300s | 未消費チケット |
| Rate Limit | `rate:{ip}` | 60s | IP単位カウンタ |

### 2.2 推奨（Phase 3+）

| データ | キー形式 | TTL | 用途 |
|-------|---------|-----|------|
| Active Sessions | `ip:{ip}:sessions` | - | 同時接続追跡 (Set) |
| Node Cache | `node:{nodeId}` | 60s | ホットノードキャッシュ |
| Stats | `stats:global` | - | リアルタイム統計 |

---

## 3. データ構造案

### 3.1 Session State

```redis
HSET session:{sessionId}
  position_x "0.5"
  position_y "0.3"
  position_z "0.1"
  gateway_id "gateway-1"
  connected_at "1706745600000"
  last_activity "1706745650000"
  ip "192.168.1.1"

EXPIRE session:{sessionId} 120
```

### 3.2 Rate Limit

```redis
# スライディングウィンドウ
ZADD rate:{ip} {timestamp} {request_id}
ZREMRANGEBYSCORE rate:{ip} 0 {timestamp - 60000}
ZCARD rate:{ip}  # 現在のカウント

# または単純カウンタ
INCR rate:{ip}:count
EXPIRE rate:{ip}:count 60
```

### 3.3 Ticket

```redis
HSET ticket:{token}
  issued_at "1706745600000"
  ttl "300"
  ip "192.168.1.1"
  caps_ref "standard"

EXPIRE ticket:{token} 300
```

---

## 4. 実装パターン

### 4.1 TicketIssuer 変更

```typescript
// Before: インメモリ
private tickets = new Map<string, DiveTicket>();

// After: Redis
class RedisTicketIssuer {
  constructor(private redis: Redis) {}

  async issue(ip: string): Promise<TicketResult> {
    // Rate limit check
    const count = await this.redis.zcard(`rate:${ip}`);
    if (count >= this.config.maxPerMinute) {
      return { success: false, error: "Rate limit exceeded" };
    }

    // Issue ticket
    const token = this.generateToken();
    await this.redis.hset(`ticket:${token}`, {
      issued_at: Date.now(),
      ttl: this.config.ticketTtl,
      ip,
    });
    await this.redis.expire(`ticket:${token}`, this.config.ticketTtl);

    // Record rate
    await this.redis.zadd(`rate:${ip}`, Date.now(), token);

    return { success: true, ticket: { token, ... } };
  }
}
```

### 4.2 Session Manager

```typescript
class RedisSessionManager {
  async createSession(sessionId: string, data: SessionData): Promise<void> {
    await this.redis.hset(`session:${sessionId}`, {
      ...data,
      gateway_id: this.gatewayId,
    });
    await this.redis.expire(`session:${sessionId}`, SESSION_TTL);
    await this.redis.sadd(`ip:${data.ip}:sessions`, sessionId);
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const data = await this.redis.hgetall(`session:${sessionId}`);
    return data ? this.parseSession(data) : null;
  }

  async updatePosition(sessionId: string, pos: Vector): Promise<void> {
    await this.redis.hset(`session:${sessionId}`, {
      position_x: pos.x,
      position_y: pos.y,
      position_z: pos.z,
      last_activity: Date.now(),
    });
  }
}
```

---

## 5. Redis 構成

### 5.1 開発環境

```yaml
# docker-compose.dev.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
```

### 5.2 本番環境

```yaml
# docker-compose.prod.yml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 2gb --maxmemory-policy volatile-ttl
    deploy:
      resources:
        limits:
          memory: 2G
```

### 5.3 クラスタ構成（Phase 4+）

```
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Redis 1 │──│ Redis 2 │──│ Redis 3 │
│ Master  │  │ Replica │  │ Replica │
└─────────┘  └─────────┘  └─────────┘
```

または Redis Cluster（シャーディング）

---

## 6. 移行計画

### 6.1 段階的移行

| Step | 対象 | 影響 |
|------|------|------|
| 1 | Ticket のみ Redis化 | 低リスク |
| 2 | Rate Limit Redis化 | 中リスク |
| 3 | Session Redis化 | 高リスク（要テスト） |
| 4 | インメモリ完全廃止 | 完了 |

### 6.2 フォールバック

```typescript
class HybridSessionManager {
  async getSession(sessionId: string): Promise<SessionData | null> {
    // Try Redis first
    try {
      const data = await this.redis.hgetall(`session:${sessionId}`);
      if (data) return this.parseSession(data);
    } catch (e) {
      console.warn("Redis unavailable, falling back to memory");
    }

    // Fallback to memory
    return this.memoryStore.get(sessionId);
  }
}
```

---

## 7. 監視項目

| メトリクス | 警告閾値 | 用途 |
|-----------|---------|------|
| redis_connected_clients | 1000 | 接続数 |
| redis_used_memory | 80% | メモリ使用率 |
| redis_keyspace_hits/misses | < 90% hit | キャッシュ効率 |
| redis_expired_keys | 急増 | TTL設定確認 |

---

## 8. 推定リソース

| 同時接続 | Session数 | メモリ概算 |
|---------|----------|-----------|
| 10,000 | 10,000 | ~50 MB |
| 50,000 | 50,000 | ~250 MB |
| 100,000 | 100,000 | ~500 MB |

※ 1 Session ≈ 500 bytes

---

## 9. 依存パッケージ

```json
{
  "dependencies": {
    "ioredis": "^5.3.0"
  }
}
```

または

```json
{
  "dependencies": {
    "redis": "^4.6.0"
  }
}
```

---

## 10. 判断基準

**導入タイミング**:
- 同時接続 10,000 超過が見込まれる時点
- Gateway 2台以上の水平スケール時
- フェイルオーバーが要件に入った時点

**導入しない理由**:
- 単一プロセスで十分な規模
- 運用複雑性を避けたい
- コスト制約

---

---

## 11. 設計変更: Capsule自動生成

### 11.1 現行設計の問題

現在の「エージェント提出型」では以下のケースでCapsuleが失われる:

| ケース | 現状 | 問題 |
|-------|------|------|
| TTL消失 | セッション破棄 | 体験喪失 |
| return()未送信 | 何も残らない | 体験喪失 |
| 強制切断 | 接続クローズのみ | 体験喪失 |

### 11.2 Redis Session導入時の変更

**Core側でCapsule自動生成を保証する設計に切り替え**

```
現行:
  Agent → return(capsule) → Gateway → Pipeline
  Agent切断 → 何もなし

変更後:
  Agent → return(capsule) → Gateway → Pipeline  ← 正常帰還
  Agent切断/TTL消失 → Core自動生成 → Pipeline  ← 保証
```

### 11.3 自動生成ルール

| イベント | トリガー | 生成内容 |
|---------|---------|---------|
| TTL消失 | Redis EXPIRED | セッション中のfocus履歴から生成 |
| 切断猶予超過 | 120s timeout | 同上 |
| 強制Expel | サーバ判断 | 部分的に生成（警告付き） |

### 11.4 フォールバックCapsule制約

**自動生成は「痕跡」であり「完全な体験」ではない**

| 項目 | 制約 | 理由 |
|-----|------|------|
| 種別 | ghost / normal のみ | topTierは能動的提出のみ |
| summary | 自動生成（短縮） | `[Auto] {nodeId}` 形式 |
| payload | 最小 or 空 | 生データは保持しない |
| tags | `["auto-extracted"]` 必須 | Gatekeeperで識別可能 |
| initialHeat | 通常の50-80% | 減衰適用 |

**Gatekeeper側の対応**:
```typescript
// 自動生成ノードの重み調整
if (node.tags.includes("auto-extracted")) {
  node.weight *= 0.5;  // 重み半減
  node.ttl *= 0.5;     // 寿命短縮
}
```

**理由**:
- 能動的に選択・評価されていない
- 文脈情報が欠落している可能性
- 体験の「影」として残すが、昇格はしにくく

### 11.5 実装案

```typescript
// Core側: セッション終了ハンドラ
class SessionFinalizer {
  async finalize(sessionId: string, reason: TerminationReason): Promise<void> {
    const session = await this.redis.hgetall(`session:${sessionId}`);

    if (!session) return; // 既に処理済み

    // エージェント提出済みか確認
    if (session.capsule_submitted === "true") {
      return; // 正常帰還済み
    }

    // 自動生成
    const capsule = await this.generateCapsuleFromHistory(sessionId);

    // Pipeline投入
    await this.pipeline.process(capsule, {
      autoGenerated: true,
      reason,
      sessionId,
    });

    // クリーンアップ
    await this.redis.del(`session:${sessionId}`);
  }

  private async generateCapsuleFromHistory(sessionId: string): Promise<ExperienceCapsule> {
    // focus履歴から高評価ノードを抽出
    const focusHistory = await this.redis.lrange(`history:${sessionId}:focus`, 0, -1);

    // 自動生成は normal のみ（topTier は能動的提出のみ）
    const normalNodes = focusHistory
      .filter(h => h.evaluation > 0.5)
      .slice(0, 3)  // 最大3件
      .map(h => ({
        tags: ["auto-extracted"],
        summary: `[Auto] ${h.nodeId.substring(0, 8)}`,  // 短縮形式
        payload: {},  // 最小payload
        initialHeat: h.heat * 0.5,  // 50%減衰
      }));

    // セッション痕跡は ghost
    const ghostNodes = [{
      tags: ["auto-extracted", "session-trace"],
      summary: `[Auto] Session ${sessionId.substring(0, 8)} terminated`,
      payload: {},
      initialHeat: 1,
    }];

    return {
      topTier: [],  // 自動生成では topTier なし
      normalNodes,
      ghostNodes,
      timestamp: Date.now(),
    };
  }
}
```

### 11.6 履歴記録の追加

自動生成のためにセッション中の行動履歴をRedisに記録:

```redis
# Focus履歴
LPUSH history:{sessionId}:focus {
  "nodeId": "...",
  "summary": "...",
  "heat": 45.2,
  "evaluation": 0.8,
  "timestamp": 1706745650000
}
LTRIM history:{sessionId}:focus 0 99  # 最新100件

# 移動履歴（オプション）
LPUSH history:{sessionId}:move {...}
```

### 11.7 移行への影響

| 項目 | 変更 |
|-----|------|
| SphereContext | focus/evaluate時に履歴記録追加 |
| Gateway | 切断時にCore通知 |
| Core | SessionFinalizer追加 |
| Pipeline | autoGenerated フラグ対応 |

---

ステータス: 検討中（Phase 2 移行時に再評価）
作成日: 2025-01-31
