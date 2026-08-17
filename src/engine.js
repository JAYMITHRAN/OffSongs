import { statsFor } from './store';

// Pre-computes artist listening affinity in a single O(N) pass
function computeArtistAffinityMap(songs, maxPlays) {
  const stats = {};
  for (const s of songs) {
    const a = s.artist || 'Unknown';
    if (!stats[a]) stats[a] = { plays: 0, favs: 0, count: 0 };
    const st = statsFor(s.id);
    stats[a].plays += st.playCount || 0;
    if (st.favorite) stats[a].favs += 1;
    stats[a].count += 1;
  }
  const affinity = {};
  for (const [artist, data] of Object.entries(stats)) {
    const avgPlays = data.plays / (data.count || 1);
    affinity[artist] = Math.min(15, (avgPlays / maxPlays) * 15 + (data.favs > 0 ? 3 : 0));
  }
  return affinity;
}

function scoreSong(candidate, current, lastInQueue, recentPlayedIds, maxPlays, artistAffinityMap) {
  const st = statsFor(candidate.id);
  let score = 0;
  const factors = {};

  // Genre similarity (0-20)
  if (current && candidate.genre && current.genre && candidate.genre.toLowerCase() === current.genre.toLowerCase()) {
    score += 20;
    factors.genre = 20;
  }

  // Fast O(1) Artist affinity (0-15)
  const aff = (candidate.artist && artistAffinityMap[candidate.artist]) || 0;
  score += aff;
  if (aff > 3) factors.artist = aff;

  // Album relationship (0-10)
  if (current && candidate.album && current.album && candidate.album !== 'Unknown Album' && candidate.album === current.album) {
    score += 10;
    factors.album = 10;
  }

  // User play preference (0-20)
  const prefScore = ((st.playCount || 0) / maxPlays) * 20;
  score += prefScore;
  if (prefScore > 6) factors.preference = prefScore;

  // Completion rate (0-10)
  const totalAttempts = st.playCount || 1;
  const completionRate = (st.completionCount || 0) / totalAttempts;
  score += completionRate * 10;

  // Favorite signal (0-15)
  if (st.favorite) {
    score += 15;
    factors.favorite = 15;
  }

  // Exploration bonus (0-12) — compatible but underplayed
  const playNorm = (st.playCount || 0) / maxPlays;
  const compatibility = (factors.genre ? 1 : 0) * 0.6 + (aff > 3 ? 1 : 0) * 0.4;
  const explorationBonus = compatibility > 0
    ? (1 - playNorm) * 12 * Math.max(compatibility, 0.35)
    : (1 - playNorm) * 4;
  score += explorationBonus;
  if (explorationBonus > 5 && playNorm < 0.25) factors.explore = explorationBonus;

  // Recent-play penalty (0 to -30)
  const recentIdx = recentPlayedIds.lastIndexOf(candidate.id);
  if (recentIdx !== -1) {
    const distFromEnd = recentPlayedIds.length - recentIdx;
    score -= Math.max(0, 30 - (distFromEnd - 1) * 4);
  }

  // Skip-rate penalty (0 to -25)
  const skipRate = (st.skipCount || 0) / (((st.playCount || 0) + (st.skipCount || 0)) || 1);
  score -= skipRate * 25;

  // Immediate artist repetition penalty
  if (lastInQueue && lastInQueue.artist && lastInQueue.artist === candidate.artist) {
    score -= 20;
  }

  score = Math.max(0.5, score);
  return { score, factors };
}

function reasonLabel(factors, candidateId) {
  const st = statsFor(candidateId);
  const entries = Object.entries(factors).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return 'Discover pick';
  const top = entries[0][0];
  if (top === 'favorite') return 'Your favorite';
  if (top === 'genre') return 'Same vibe';
  if (top === 'album') return 'From this album';
  if (top === 'artist') return 'You like this artist';
  if (top === 'preference') return 'Fan favorite';
  if (top === 'explore') return st.playCount === 0 ? 'Never played' : 'Underplayed pick';
  return 'Recommended';
}

function weightedPick(candidates) {
  const total = candidates.reduce((a, c) => a + c.score, 0);
  let r = Math.random() * total;
  for (const c of candidates) {
    r -= c.score;
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

// Builds a dynamic queue using O(N) optimized weighted-random selection with call stack protection
export function generateQueue(songs, seedSong, recentPlayedIds, length = 12) {
  if (!songs || songs.length === 0) return [];

  // Safe against maximum call stack size exceeded on large libraries
  const maxPlays = songs.reduce((max, s) => Math.max(max, statsFor(s.id).playCount || 0), 1);
  const artistAffinityMap = computeArtistAffinityMap(songs, maxPlays);

  const result = [];
  let last = seedSong;
  const usedIds = new Set([seedSong ? seedSong.id : null]);
  const pool = songs.filter((s) => s.id !== (seedSong && seedSong.id));

  for (let i = 0; i < length && result.length < pool.length; i++) {
    const available = pool.filter((s) => !usedIds.has(s.id));
    if (available.length === 0) break;

    const scored = available.map((s) => {
      const { score, factors } = scoreSong(s, seedSong, last, recentPlayedIds, maxPlays, artistAffinityMap);
      return { song: s, score, factors };
    });

    const picked = weightedPick(scored);
    if (!picked) break;

    usedIds.add(picked.song.id);
    result.push({ song: picked.song, reason: reasonLabel(picked.factors, picked.song.id) });
    last = picked.song;
  }
  return result;
}

export function sequentialQueue(songs, seedSong, length = 12) {
  if (!songs || songs.length === 0) return [];
  const sorted = [...songs].sort((a, b) =>
    (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
  );
  const idx = sorted.findIndex((s) => seedSong && s.id === seedSong.id);
  const startIdx = idx !== -1 ? idx : 0;
  const result = [];

  for (let i = 1; i <= length && i < sorted.length; i++) {
    const s = sorted[(startIdx + i) % sorted.length];
    if (seedSong && s.id === seedSong.id) break;
    result.push({ song: s, reason: 'In sequence' });
  }
  return result;
}
