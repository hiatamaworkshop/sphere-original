# Test Results Directory

This directory contains organized test results for different LLM models.

## Structure

```
test-results/
├── baseline-llama3.2-1b/       # Initial baseline (93 sessions, mixed models)
│   ├── eval-log-docker.jsonl
│   ├── gen-001.json
│   ├── species-profile.json
│   └── summary.md
├── test-qwen2.5-0.5b/          # qwen2.5:0.5b test results
└── test-phi3.5-mini/           # phi3.5:mini test results
```

## Test Protocol

Each test directory should contain:
- `eval-log.jsonl` — Raw evaluation data (JSONL format)
- `species-profile.json` — Species memory profile
- `gen-*.json` — Generation archives (if Digestor ran)
- `summary.md` — Test summary with statistics

## Comparison Metrics

When comparing models:
1. **Execution Time** — How long does one session take?
2. **Species Differentiation** — Do species maintain distinct avgH/avgW/avgD patterns?
3. **Score Quality** — Are scores within reasonable ranges (0-10)?
4. **Personality Preservation** — Does hunter chase heat? Does scholar prefer weight?

## Baseline (llama3.2:1b + phi3:mini)

- Total Sessions: 93
- avgH range: 5.2-6.6
- avgW range: 5.5-7.7
- avgD range: 3.5-4.0
- Execution Time: ~1 minute per session

---

**Date Created**: 2026-02-09
