# Claude Code Project Notes

## Environment

**Platform**: Windows

### Important: Path Handling

When using `cd` or `git` commands, always quote paths with spaces:

```bash
# Correct
cd "C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original"
git add "path with spaces\file.ts"

# Incorrect - will fail
cd C:\Users\kazuh\Desktop\Various\programming\DockerFiles\sphere-original
```

Always use double quotes `" "` for paths containing spaces.