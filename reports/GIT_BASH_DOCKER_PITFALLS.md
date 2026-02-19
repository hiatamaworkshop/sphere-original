# Git Bash + Docker CLI の罠 (Windows)

**Date**: 2026-02-19
**環境**: Windows 11, Git Bash (MSYS2), Docker Desktop

Git Bash (MSYS2) 環境で Docker CLI を使う際に繰り返し発生する問題を集約。

---

## 1. MSYS パス変換

**問題**: `docker exec container /bin/sh -c "..."` で `/bin/sh` が `C:/Program Files/Git/usr/bin/sh` に自動変換される。

```
OCI runtime exec failed: exec failed: unable to start container process:
exec: "C:/Program Files/Git/usr/bin/sh": stat C:/Program Files/Git/usr/bin/sh:
no such file or directory
```

**原因**: Git Bash の MSYS2 レイヤーが `/` 始まりのパスを Windows パスに変換する。docker exec, docker cp など、コンテナ内パスを引数に取るコマンドで発生。

**対策**: **全ての** docker exec / docker cp に `MSYS_NO_PATHCONV=1` を付ける。

```bash
# ❌ 失敗
docker exec sphere-digestor /bin/sh -c "ls /app/data"
docker cp sphere-digestor:/app/data/file.json ./local/

# ✅ 成功
MSYS_NO_PATHCONV=1 docker exec sphere-digestor /bin/sh -c "ls /app/data"
MSYS_NO_PATHCONV=1 docker cp sphere-digestor:/app/data/file.json ./local/
```

**影響範囲**: `/` を含む全てのコンテナパス引数。`docker logs`, `docker ps`, `docker stop` には影響なし。

---

## 2. docker logs が stderr 扱いになる

**問題**: `docker logs` がデータを返しているのに、ツール (Claude Code の Bash ツール等) が exit code 1 + error と判定する。

**原因**: Docker はコンテナの stdout/stderr をそのまま中継する。Node.js アプリの多くは console.log が stderr に出力される。ツール側は stderr 出力 = エラーと判定。

**重要**: **exit code 1 でもデータは取得できている。** error 表示の中身を読めばログが入っている。

**対策**:

```bash
# パターン A: exit code を無視
docker logs sphere-digestor --tail 20 2>&1 || true

# パターン B: ファイル経由
docker logs sphere-digestor --tail 20 > /tmp/logs.txt 2>&1; cat /tmp/logs.txt
```

---

## 3. docker compose の version warning

**問題**: `docker compose` コマンドの全出力に warning が付加される。

```
level=warning msg="...docker-compose.yml: the attribute `version` is obsolete..."
```

**原因**: `docker-compose.yml` に `version: "3.x"` が残っている。Docker Compose V2 では不要。

**対策**: docker-compose.yml から `version:` 行を削除する。 → **2026-02-19 対策済み。**

---

## 4. PowerShell 構文の破壊

**問題**: Git Bash から PowerShell を呼ぶ際、`$_` や `${}` が bash の変数展開に巻き込まれる。

```bash
# ❌ bash が $_.Name を展開 → extglob.Name に化ける
powershell -Command "ls dir | where {$_.Name -match 'gen'}"

# ✅ シングルクォートで保護
powershell -Command 'ls dir | where {$_.Name -match "gen"}'
```

---

## 安全なパターン集

```bash
# docker exec (パスあり) — 必ず MSYS_NO_PATHCONV
MSYS_NO_PATHCONV=1 docker exec sphere-digestor /bin/sh -c "wc -l /app/data/eval-log.jsonl"

# docker logs — exit code 無視
docker logs sphere-digestor --tail 20 2>&1 || true

# docker compose — cd してから + warning 除外
cd docker_compose_sphere_v1 && docker compose ps 2>&1 | grep -v "warning"

# docker cp — MSYS_NO_PATHCONV 必須
MSYS_NO_PATHCONV=1 docker cp sphere-digestor:/app/data/generations/gen-016.json ./local/

# コンテナ内コマンド実行 (パスなし) — 問題なし
docker stop sphere-digestor
docker ps --filter "name=sphere"
```

---

## 参照

- `TEST_STARTUP_CHECKLIST.md` — テスト起動前の落とし穴集
- `TEST_PROCEDURES.md` — docker compose ベーステスト手順
