import AsyncStorage from '@react-native-async-storage/async-storage';

const DB_KEY = 'offsongs-data-v1';
const LIBRARY_CACHE_KEY = 'offsongs-library-cache-v1';

let DB = { stats: {}, history: [], playlists: [], onlineSongs: {}, settings: { repeat: 'all', smart: true } };
let cachedSongs = null;
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
    if (raw) {
      const parsed = JSON.parse(raw);
      DB = Object.assign(DB, parsed);
      if (!DB.onlineSongs) DB.onlineSongs = {};
    }
  } catch (e) {
    // first run — keep defaults
  }
  notify();
  return DB;
}

export async function loadLibraryCache() {
  try {
    const raw = await AsyncStorage.getItem(LIBRARY_CACHE_KEY);
    if (raw) {
      cachedSongs = JSON.parse(raw);
      return cachedSongs;
    }
  } catch (e) {
    console.warn('OffSongs: failed to load library cache', e);
  }
  return null;
}

export async function saveLibraryCache(songs) {
  try {
    cachedSongs = songs;
    await AsyncStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(songs));
    notify();
  } catch (e) {
    console.warn('OffSongs: failed to save library cache', e);
  }
}

export function getDB() {
  return DB;
}

function saveSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await AsyncStorage.setItem(DB_KEY, JSON.stringify(DB));
    } catch (e) {
      console.warn('OffSongs: DB persist error', e);
    }
  }, 200);
}

export function registerTrack(song) {
  if (!song || !song.id) return;
  if (!DB.onlineSongs) DB.onlineSongs = {};
  DB.onlineSongs[song.id] = song;
  saveSoon();
  notify();
}

export function statsFor(songId) {
  if (!DB.stats[songId]) {
    DB.stats[songId] = {
      favorite: false,
      playCount: 0,
      completionCount: 0,
      skipCount: 0,
      totalListenSeconds: 0,
      lastPlayedAt: null,
      lastSkippedAt: null,
    };
  }
  return DB.stats[songId];
}

export function toggleFavorite(songOrId) {
  const songId = typeof songOrId === 'object' ? songOrId.id : songOrId;
  if (typeof songOrId === 'object') {
    registerTrack(songOrId);
  }
  const st = statsFor(songId);
  st.favorite = !st.favorite;
  saveSoon();
  notify();
  return st.favorite;
}

export function recordPlayStart(songId) {
  statsFor(songId).playCount += 1;
  saveSoon();
  notify();
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
  notify();
  return completed;
}

export function recordSkip(songId) {
  statsFor(songId).skipCount += 1;
  saveSoon();
  notify();
}

export function createPlaylist(name) {
  const trimmed = (name || '').trim() || 'New Playlist';
  const pl = { id: 'pl_' + Date.now(), name: trimmed, createdAt: Date.now(), updatedAt: Date.now(), songIds: [] };
  DB.playlists.push(pl);
  saveSoon();
  notify();
  return pl;
}

export function renamePlaylist(playlistId, newName) {
  const pl = DB.playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  pl.name = (newName || '').trim() || pl.name;
  pl.updatedAt = Date.now();
  saveSoon();
  notify();
}

export function deletePlaylist(playlistId) {
  DB.playlists = DB.playlists.filter((p) => p.id !== playlistId);
  saveSoon();
  notify();
}

export function toggleSongInPlaylist(playlistId, songOrId) {
  const pl = DB.playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  const songId = typeof songOrId === 'object' ? songOrId.id : songOrId;
  if (typeof songOrId === 'object') {
    registerTrack(songOrId);
  }
  const idx = pl.songIds.indexOf(songId);
  if (idx === -1) pl.songIds.push(songId); else pl.songIds.splice(idx, 1);
  pl.updatedAt = Date.now();
  saveSoon();
  notify();
}

export function removeSongFromPlaylist(playlistId, songId) {
  const pl = DB.playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  pl.songIds = pl.songIds.filter((id) => id !== songId);
  pl.updatedAt = Date.now();
  saveSoon();
  notify();
}

export function setSetting(key, value) {
  DB.settings[key] = value;
  saveSoon();
  notify();
}
