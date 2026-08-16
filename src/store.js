import AsyncStorage from '@react-native-async-storage/async-storage';

const DB_KEY = 'offsongs-data-v1';

let DB = { stats: {}, history: [], playlists: [], settings: { repeat: 'all', smart: true } };
let saveTimer = null;
let listeners = [];

export function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((f) => f !== fn); };
}
function notify() { listeners.forEach((fn) => fn(DB)); }

export async function loadDB() {
  try {
    const raw = await AsyncStorage.getItem(DB_KEY);
    if (raw) DB = Object.assign(DB, JSON.parse(raw));
  } catch (e) {
    // first run — keep defaults
  }
  notify();
  return DB;
}

export function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await AsyncStorage.setItem(DB_KEY, JSON.stringify(DB)); }
    catch (e) { console.warn('OffSongs: storage save failed', e); }
  }, 500);
  notify();
}

export function getDB() { return DB; }

export function statsFor(songId) {
  if (!DB.stats[songId]) {
    DB.stats[songId] = {
      playCount: 0, skipCount: 0, completionCount: 0,
      totalListenSeconds: 0, lastPlayedAt: 0, favorite: false,
    };
  }
  return DB.stats[songId];
}

export function toggleFavorite(songId) {
  const st = statsFor(songId);
  st.favorite = !st.favorite;
  saveSoon();
  return st.favorite;
}

export function recordPlayStart(songId) {
  statsFor(songId).playCount += 1;
  saveSoon();
}

export function recordListeningEvent({ songId, startedAt, secondsPlayed, durationSeconds }) {
  const st = statsFor(songId);
  st.totalListenSeconds += secondsPlayed;
  st.lastPlayedAt = Date.now();
  const ratio = durationSeconds ? secondsPlayed / durationSeconds : 0;
  const completed = ratio >= 0.85;
  if (completed) st.completionCount += 1;
  DB.history.push({ songId, startedAt, endedAt: Date.now(), secondsPlayed, completed });
  if (DB.history.length > 300) DB.history.shift();
  saveSoon();
  return completed;
}

export function recordSkip(songId) {
  statsFor(songId).skipCount += 1;
  saveSoon();
}

export function createPlaylist(name) {
  const pl = { id: 'pl_' + Date.now(), name, createdAt: Date.now(), updatedAt: Date.now(), songIds: [] };
  DB.playlists.push(pl);
  saveSoon();
  return pl;
}

export function toggleSongInPlaylist(playlistId, songId) {
  const pl = DB.playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  const idx = pl.songIds.indexOf(songId);
  if (idx === -1) pl.songIds.push(songId); else pl.songIds.splice(idx, 1);
  pl.updatedAt = Date.now();
  saveSoon();
}

export function setSetting(key, value) {
  DB.settings[key] = value;
  saveSoon();
}
