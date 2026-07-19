// The rankings/squads designs render each user as an emoji inside a colored
// ring. The backend has no such decoration (just handle + image URL), so we
// derive a STABLE emoji + ring from the user id — same user always gets the
// same avatar, and the emoji-avatar visual the mock established is preserved.

// Animal/object emojis in the same register as the prototype's hardcoded ones.
const EMOJIS = [
  "🦊", "🐸", "🐙", "🐼", "🚀", "🐢", "🐵", "🐺", "🐝", "🐳",
  "🦁", "🐧", "🦉", "🐰", "🐨", "🐯", "🐮", "🐷", "🐔", "🦄",
];

// Ring palette drawn from the prototype (RINGS + the ranking rows' colors).
const RINGS = [
  "#FF8A3D", "#7FB8E8", "#3DDC84", "#C08BFF", "#FF5E8A",
  "#FFD84D", "#8FA9FF", "#FF8A5C", "#6BCB77", "#4D96FF",
];

// Small deterministic string hash (djb2). Stable across reloads/instances.
function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarFor(seed: string): { emoji: string; ring: string } {
  const h = hash(seed);
  return {
    emoji: EMOJIS[h % EMOJIS.length],
    // Offset the ring index so emoji and ring don't move in lockstep.
    ring: RINGS[Math.floor(h / EMOJIS.length) % RINGS.length],
  };
}
