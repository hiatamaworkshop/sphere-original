// Quick test script for new flag system
// Run: node test-flags.js

const Flag = {
  // Temporal (bits 0-3)
  TemporalShort:  0x0001,
  TemporalLong:   0x0002,
  TemporalCyclic: 0x0004,
  Hot:            0x0008,

  // Density (bits 4-7)
  Dense:      0x0010,
  Sparse:     0x0020,
  Composite:  0x0040,
  Authority:  0x0080,

  // Cognitive (bits 8-11)
  Insightful: 0x0100,
  Confusing:  0x0200,
  Provoking:  0x0400,
  Soothing:   0x0800,

  // Special (bits 12-15)
  UserMarked:  0x1000,
  SystemCore:  0x2000,
  Compressed:  0x4000,
  Candidate:   0x8000,
};

const TAG_FLAG_PATTERNS = [
  // Temporal
  { pattern: /\b(new|latest|breaking|recent|fresh|trending|viral|hot|2024|2025|2026)\b/i, flags: Flag.TemporalShort },
  { pattern: /\b(timeless|classic|fundamental|proven|stable|reliable|legacy|permanent)\b/i, flags: Flag.TemporalLong },

  // Density
  { pattern: /\b(theory|formula|rigorous|technical|dense|detailed|comprehensive)\b/i, flags: Flag.Dense },
  { pattern: /\b(casual|light|brief|anecdotal|simple|short|note)\b/i, flags: Flag.Sparse },
  { pattern: /\b(synthesis|integration|combination|hybrid|composite|fusion)\b/i, flags: Flag.Composite },
  { pattern: /\b(official|authoritative|peer-reviewed|research|paper|verified)\b/i, flags: Flag.Authority },

  // Cognitive
  { pattern: /\b(insight|revelation|breakthrough|discovery)\b/i, flags: Flag.Insightful },
  { pattern: /\b(confusing|unclear|ambiguous|paradox)\b/i, flags: Flag.Confusing },
  { pattern: /\b(controversial|debate|provocative|radical)\b/i, flags: Flag.Provoking },
  { pattern: /\b(calming|reassuring|stable|peaceful)\b/i, flags: Flag.Soothing },
];

function computeFlags(tags) {
  const tagText = tags.join(" ").toLowerCase();
  let flags = 0;

  for (const { pattern, flags: flagValue } of TAG_FLAG_PATTERNS) {
    if (pattern.test(tagText)) {
      flags |= flagValue;
    }
  }

  return flags;
}

function flagsToString(flags) {
  const names = [];
  if (flags & Flag.TemporalShort) names.push("TemporalShort");
  if (flags & Flag.TemporalLong) names.push("TemporalLong");
  if (flags & Flag.Hot) names.push("Hot");
  if (flags & Flag.Dense) names.push("Dense");
  if (flags & Flag.Sparse) names.push("Sparse");
  if (flags & Flag.Composite) names.push("Composite");
  if (flags & Flag.Authority) names.push("Authority");
  if (flags & Flag.Insightful) names.push("Insightful");
  if (flags & Flag.Confusing) names.push("Confusing");
  if (flags & Flag.Provoking) names.push("Provoking");
  if (flags & Flag.Soothing) names.push("Soothing");
  return names.length > 0 ? names.join(", ") : "(none)";
}

// Test cases
const testCases = [
  { name: "Scholar node", tags: ["research", "fundamental", "theory"] },
  { name: "Scout node", tags: ["trending", "viral", "new"] },
  { name: "Hermit node", tags: ["stable", "peaceful", "timeless"] },
  { name: "Moth node", tags: ["insight", "breakthrough"] },
  { name: "Generic node", tags: ["food", "daily-life"] },
  { name: "Dense authority", tags: ["peer-reviewed", "technical", "comprehensive"] },
  { name: "Sparse casual", tags: ["casual", "brief", "note"] },
  { name: "Provocative debate", tags: ["controversial", "debate", "radical"] },
];

console.log("=== Flag System Test ===\n");

for (const test of testCases) {
  const flags = computeFlags(test.tags);
  console.log(`${test.name}:`);
  console.log(`  Tags: ${test.tags.join(", ")}`);
  console.log(`  Flags: 0x${flags.toString(16).padStart(4, "0")} => ${flagsToString(flags)}`);
  console.log();
}

console.log("\n=== Bit Allocation Check ===");
console.log("Temporal layer (0x000F):");
console.log(`  TemporalShort: 0x${Flag.TemporalShort.toString(16).padStart(4, "0")}`);
console.log(`  TemporalLong:  0x${Flag.TemporalLong.toString(16).padStart(4, "0")}`);
console.log(`  Hot:           0x${Flag.Hot.toString(16).padStart(4, "0")}`);
console.log("\nDensity layer (0x00F0):");
console.log(`  Dense:      0x${Flag.Dense.toString(16).padStart(4, "0")}`);
console.log(`  Sparse:     0x${Flag.Sparse.toString(16).padStart(4, "0")}`);
console.log(`  Composite:  0x${Flag.Composite.toString(16).padStart(4, "0")}`);
console.log(`  Authority:  0x${Flag.Authority.toString(16).padStart(4, "0")}`);
console.log("\nCognitive layer (0x0F00):");
console.log(`  Insightful: 0x${Flag.Insightful.toString(16).padStart(4, "0")}`);
console.log(`  Confusing:  0x${Flag.Confusing.toString(16).padStart(4, "0")}`);
console.log(`  Provoking:  0x${Flag.Provoking.toString(16).padStart(4, "0")}`);
console.log(`  Soothing:   0x${Flag.Soothing.toString(16).padStart(4, "0")}`);
console.log("\nSpecial layer (0xF000):");
console.log(`  UserMarked:  0x${Flag.UserMarked.toString(16).padStart(4, "0")}`);
console.log(`  SystemCore:  0x${Flag.SystemCore.toString(16).padStart(4, "0")}`);
console.log(`  Compressed:  0x${Flag.Compressed.toString(16).padStart(4, "0")}`);
console.log(`  Candidate:   0x${Flag.Candidate.toString(16).padStart(4, "0")}`);
