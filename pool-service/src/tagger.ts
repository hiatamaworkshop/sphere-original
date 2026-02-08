// ============================================================
// Tagger — tag keywords → 16-bit flags
// ============================================================
//
// Lightweight copy of Sphere's tagger logic.
// Runs in Pool Service so Scorer B/C/D have flags before submission.
// Sphere's own Tagger will merge flags again on submission (OR merge).

const Flag = {
  Authority:   0x0001,
  Catalyst:    0x0002,
  Freshness:   0x0004,
  Ephemeral:   0x0008,
  Sticky:      0x0010,
  Volatile:    0x0020,
  Hot:         0x0040,
  Frozen:      0x0080,
  Compressed:  0x4000,
  Candidate:   0x8000,
} as const;

interface TagPattern {
  regex: RegExp;
  flag: number;
}

const TAG_PATTERNS: TagPattern[] = [
  { regex: /\b(research|academic|peer.?review|journal|thesis)\b/i, flag: Flag.Authority },
  { regex: /\b(new|novel|breaking|emerging|latest)\b/i,           flag: Flag.Freshness },
  { regex: /\b(catalyst|spark|trigger|seed|bridge)\b/i,           flag: Flag.Catalyst },
  { regex: /\b(temporary|ephemeral|draft|wip|scratch)\b/i,        flag: Flag.Ephemeral },
  { regex: /\b(pin|pinned|sticky|permanent|archive)\b/i,          flag: Flag.Sticky },
  { regex: /\b(volatile|unstable|experimental)\b/i,               flag: Flag.Volatile },
];

export function assignFlags(tags: string[]): number {
  const text = tags.join(" ");
  let flags = 0;
  for (const p of TAG_PATTERNS) {
    if (p.regex.test(text)) flags |= p.flag;
  }
  return flags;
}
