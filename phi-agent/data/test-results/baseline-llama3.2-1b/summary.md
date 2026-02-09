# Baseline Test Results — llama3.2:1b

**Date**: 2026-02-09  
**Model**: llama3.2:1b (via Ollama)  
**Total Sessions**: 93  
**Generation**: 1  
**Hunger**: 0.2  

## Breakdown by Model (from MEMORY.md)
- phi3:mini — 59 sessions (all 9 species)
- llama3.2:1b — 4 sessions
- legacy — 30 sessions

## Species Statistics (Generation 1)

| Species | Sessions | avgH | avgW | avgD | Notes |
|---------|----------|------|------|------|-------|
| scholar | 22 | 5.62 | **7.71** | 3.96 | Weight蓄積者 |
| balanced | 8 | 6.56 | 6.30 | 3.46 | - |
| wanderer | 13 | - | - | - | 温度源 (13E) |
| moth | 8 | - | - | - | 温度源 (8E) |
| hunter | 10 | - | - | - | - |
| hermit | 19R | - | - | - | 匂い吸収者 |
| scout | - | - | - | - | - |
| archivist | - | - | - | - | Weight蓄積者 |
| sniper | - | - | - | - | - |

## Key Findings

1. **format:json 副作用**: w スコアが全種族で平均 -2.9 低下 (legacy比)。h は不変
2. **Bus 非対称性**: 
   - 温度源: wanderer(13E), moth(8E)
   - 匂い吸収者: hermit(19R)
3. **3クラスタ**: 
   - heat生産者 (kami, moth)
   - weight蓄積者 (scholar, archivist)
   - 中央集団 (残り)
4. **1B Docker 異常**: 手動テストと真逆 (h=8-10)。種族記憶の影響 or 環境差

## Files
- `eval-log-docker.jsonl` — 93 sessions (40KB)
- `gen-001.json` — Generation 1 archive (14KB)
- `species-profile.json` — Latest species profile (14KB)
- `eval-log-docker-backup-20260209.jsonl` — Backup

## Test Environment
- **Sphere**: Docker Compose (periphery + renalCore)
- **phi-agent**: Docker container
- **Ollama**: host.docker.internal:11434
- **Digestor**: Independent container (3h interval recommended)
