# Test Runner - Automated Testing Container

## 役割

- 統合テストの実行
- E2Eテストの実行
- Mock Bot の実行環境
- パフォーマンステスト

## テストスイート

### 1. 統合テスト (Integration Tests)

#### Periphery Layer Tests
- Membrane フィルタリングテスト
- Gatekeeper バリデーションテスト
- Parser バッチ処理テスト
- Packer/Tagger 協調テスト

#### RenalCore Tests
- Decay プロセステスト
- Ghostification テスト
- Erosion/Ascension テスト
- Evaporation テスト

### 2. E2Eテスト

#### Full Pipeline Test
```
Mock Bot → Periphery → RenalCore → DB → Evaporation
```

#### Scenarios
- 正常系: カプセル投入 → 受肉 → 代謝 → 蒸発
- 異常系: Gatekeeper 拒否、Parser エラー
- 負荷テスト: 大量カプセル同時投入

### 3. Mock Bot

現在 `services/periphery/src/mock/bot.ts` にあるMock Botを独立実行。

#### 動作
- 2秒ごとにランダムなカプセルを投入
- 各カプセル: 3 top + 5 normal + 2 ghost = 10 nodes
- lorem ipsum によるランダムな summary

### 4. パフォーマンステスト

#### Benchmarks
- Periphery のスループット測定
- RenalCore の tick 処理時間
- DB 読み書き速度
- ベクトル計算速度

## 使い方

### Mock Bot の実行
```bash
docker-compose run test-runner npm run mock-bot
```

### 統合テストの実行
```bash
docker-compose run test-runner npm test
```

### E2Eテストの実行
```bash
docker-compose run test-runner npm run test:e2e
```

## 依存関係

- periphery: API endpoint (port 3001)
- postgres: Reference DB
- minio: Projection DB
- redis: Cache layer

## 実装予定

Phase 3.1 では Mock Bot のみ実装済み。
統合テストとE2Eテストは Phase 3.2 以降で実装します。