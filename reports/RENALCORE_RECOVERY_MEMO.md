# RenalCore ソースファイル復旧メモ

**日付**: 2026-02-01
**状態**: 復旧完了

---

## 1. 問題の発見

renalCore のビルドが失敗していた。調査の結果、以下の問題を発見:

### 1.1 ソースファイルの欠落

```
src/
└── core/
    └── types.ts    ← これしか残っていなかった

dist/               ← コンパイル済みファイルは存在
├── renalcore.js
├── index.js
└── ...
```

**欠落していたファイル**:
- `src/renalcore.ts`
- `src/index.ts`
- `src/types/*.ts` (5ファイル)
- `src/lib/*.ts` (2ファイル)
- `src/agent/*.ts` (5ファイル)

### 1.2 package.json の不備

```json
// Before: 依存関係がなかった
{
  "scripts": { "build": "tsc" },
  // devDependencies なし
}
```

### 1.3 tsconfig.json の欠落

ファイル自体が存在しなかった。

---

## 2. 原因

Git 履歴の調査により判明:

```bash
git log --oneline --diff-filter=D -- "services/renalCore/src/**/*.ts"
```

- `4126903`: ファイルが復元された（"fix: restore accidentally deleted src files"）
- `a98af51`: 再び削除された（"受肉パイプライン調整"）

ソースファイルが誤って削除され、その後のコミットで復元されずに残っていた。

---

## 3. 復旧手順

### 3.1 ソースファイルの復元

```bash
cd docker_compose_sphere_v1
git checkout 4126903 -- services/renalCore/src/
```

### 3.2 package.json の修正

```json
{
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "tsx": "^4.0.0"
  }
}
```

### 3.3 tsconfig.json の作成

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3.4 ビルドエラーの修正

`src/agent/sphere-context.ts` で `ExperienceCapsule` の import が欠落していた:

```typescript
// Before
import type {
  SphereAgent, FocusData, RadarData, SubmissionCapsule, GhostPulse, AgentConfig,
} from "../types/agent.js";

// After
import type {
  SphereAgent, FocusData, RadarData, SubmissionCapsule, GhostPulse, AgentConfig,
  ExperienceCapsule,  // ← 追加
} from "../types/agent.js";
```

### 3.5 ビルド実行

```bash
cd services/renalCore
npm install
npm run build  # 成功
```

---

## 4. 復旧後のファイル構成

```
services/renalCore/
├── package.json         ✅ devDependencies 追加
├── tsconfig.json        ✅ 新規作成
├── src/
│   ├── index.ts         ✅ 復元
│   ├── renalcore.ts     ✅ 復元
│   ├── agent/
│   │   ├── agent-manager.ts
│   │   ├── agent.ts
│   │   ├── index.ts
│   │   ├── perception.ts
│   │   └── sphere-context.ts  ✅ import 修正
│   ├── core/
│   │   └── types.ts
│   ├── lib/
│   │   ├── bit_math.ts  ✅ 復元
│   │   └── physics.ts   ✅ 復元
│   └── types/
│       ├── agent.ts     ✅ 復元
│       ├── amber.ts     ✅ 復元
│       ├── index.ts     ✅ 復元
│       ├── pulse.ts     ✅ 復元
│       ├── sphere_node.ts ✅ 復元
│       └── stable_config.ts ✅ 復元
└── dist/                ✅ ビルド成功
```

---

## 5. 教訓

1. **ソースファイルの削除に注意**: コミット時に意図しないファイル削除がないか確認
2. **ビルド確認**: 大きな変更後は必ず `npm run build` を実行
3. **Git 履歴の活用**: `git checkout <commit> -- <path>` でファイル復元可能

---

## 6. 次のステップ

- [ ] `processGhostification()` の削除（RENALCORE_REFACTOR_MEMO.md 参照）
- [ ] periphery サーバーの動作確認
- [ ] テストバッチの再実行
