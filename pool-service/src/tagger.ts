// ============================================================
// Tagger — tag keywords → 16-bit flags
// ============================================================
//
// Lightweight copy of Sphere's tagger logic.
// Runs in Pool Service so Scorer B/C/D have flags before submission.
// Sphere's own Tagger will merge flags again on submission (OR merge).
//
// Design: FLAG_SYSTEM_REDESIGN.md
//   - Temporal (bits 0-3): time properties
//   - Density (bits 4-7): structural complexity
//   - Cognitive (bits 8-11): perceptual impact
//   - Special (bits 12-15): system/user metadata

const Flag = {
  // Temporal (bits 0-3)
  TemporalShort:  0x0001,
  TemporalLong:   0x0002,
  TemporalCyclic: 0x0004,
  Hot:            0x0008,  // Dynamic: Arbiter-assigned

  // Density (bits 4-7)
  Dense:      0x0010,
  Sparse:     0x0020,
  Composite:  0x0040,
  Authority:  0x0080,

  // Cognitive (bits 8-11) — epistemic state
  Sharp:      0x0100,
  Fuzzy:      0x0200,
  Tensile:    0x0400,
  Settled:    0x0800,

  // Special (bits 12-15)
  UserMarked:  0x1000,
  SystemCore:  0x2000,
  Compressed:  0x4000,
  Candidate:   0x8000,

  // Aliases
  Frozen: 0x2000,  // Alias for SystemCore
} as const;

interface TagPattern {
  regex: RegExp;
  flag: number;
}

const TAG_PATTERNS: TagPattern[] = [
  // Temporal (bits 0-3)
  { regex: /\b(new|novel|breaking|emerging|latest|trending)\b/i,       flag: Flag.TemporalShort },
  { regex: /\b(timeless|classic|fundamental|permanent|archive)\b/i,    flag: Flag.TemporalLong },

  // Density (bits 4-7)
  { regex: /\b(theory|formula|technical|detailed|comprehensive)\b/i,   flag: Flag.Dense },
  { regex: /\b(casual|light|brief|simple|note)\b/i,                    flag: Flag.Sparse },
  { regex: /\b(synthesis|integration|hybrid|interdisciplinary)\b/i,    flag: Flag.Composite },
  { regex: /\b(research|academic|peer.?review|journal|thesis|official|authoritative)\b/i, flag: Flag.Authority },

  // Cognitive (bits 8-11) — epistemic state
  { regex: /\b(definition|theorem|proof|conclusion|exact|definitive)\b/i,       flag: Flag.Sharp },
  { regex: /\b(hypothesis|maybe|uncertain|speculative|ambiguous)\b/i,           flag: Flag.Fuzzy },
  { regex: /\b(debate|controversy|paradox|contradiction|unresolved)\b/i,        flag: Flag.Tensile },
  { regex: /\b(established|consensus|standard|accepted|canonical)\b/i,          flag: Flag.Settled },
];

export function assignFlags(tags: string[]): number {
  const text = tags.join(" ");
  let flags = 0;
  for (const p of TAG_PATTERNS) {
    if (p.regex.test(text)) flags |= p.flag;
  }
  return flags;
}
