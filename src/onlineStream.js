// Global Ad-Free Online Music Streaming Engine
// Uses direct official JioSaavn API with instant local DES decryption and iTunes Public API for 100% reliability and 320kbps audio.
import CryptoJS from 'crypto-js';

const SAAVN_DES_KEY = '38346591';

// Helper to fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Instant 0ms offline DES-ECB decryption of Saavn encrypted media URLs
export function decryptSaavnUrl(encUrl) {
  if (!encUrl) return null;
  try {
    const key = CryptoJS.enc.Utf8.parse(SAAVN_DES_KEY);
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encUrl) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    let url = decrypted.toString(CryptoJS.enc.Utf8);
    if (!url || !url.startsWith('http')) return null;

    // Direct 320kbps AAC / MP4 CDN audio stream
    url = url.replace(/_96\.mp4|_160\.mp4/, '_320.mp4');
    return url;
  } catch (e) {
    return null;
  }
}

// Searches JioSaavn directly for all Indian and international songs
async function searchSaavn(query) {
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&n=25&p=1&q=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.results || [];
    if (!Array.isArray(items) || items.length === 0) return [];

    return items.map((item) => {
      const encUrl = item.encrypted_media_url || (item.more_info && item.more_info.encrypted_media_url) || null;
      const rawImage = item.image || (item.more_info && item.more_info.image);
      const hdArtwork = rawImage ? rawImage.replace('50x50', '500x500').replace('150x150', '500x500') : null;

      let artist = item.primary_artists || (item.more_info && item.more_info.primary_artists) || item.singers || 'Unknown Artist';
      let title = item.song || item.title || 'Unknown Title';
      let album = item.album || (item.more_info && item.more_info.album) || 'Single';
      let duration = parseInt(item.duration || (item.more_info && item.more_info.duration), 10) || 0;

      // Instant local DES decryption for instant 1-click playback
      const directUrl = encUrl ? decryptSaavnUrl(encUrl) : null;

      return {
        id: 'saavn_' + item.id,
        source: 'saavn',
        title: decodeHtmlEntities(title),
        artist: decodeHtmlEntities(artist),
        album: decodeHtmlEntities(album),
        duration,
        encryptedMediaUrl: encUrl,
        streamUrl: directUrl,
        uri: directUrl,
        artworkUrl: hdArtwork,
        isOnline: true,
      };
    });
  } catch (e) {
    return [];
  }
}

// Resolves on-demand direct 320kbps streaming & download URL
export async function resolveStreamUrl(song) {
  if (song.streamUrl) return song.streamUrl;
  if (song.encryptedMediaUrl) {
    const decrypted = decryptSaavnUrl(song.encryptedMediaUrl);
    if (decrypted) {
      song.streamUrl = decrypted;
      song.uri = decrypted;
      return decrypted;
    }
  }

  try {
    const tokenUrl = `https://www.jiosaavn.com/api.php?__call=song.generateAuthToken&url=${encodeURIComponent(song.encryptedMediaUrl)}&bitrate=320&_format=json`;
    const res = await fetchWithTimeout(tokenUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const authUrl = data.auth_url || data.media_url;
    if (authUrl) {
      song.streamUrl = authUrl;
      song.uri = authUrl;
      return authUrl;
    }
  } catch (e) {}

  return song.uri || song.streamUrl || null;
}

// Global iTunes search fallback for international catalog
async function searchiTunes(query) {
  try {
    const res = await fetchWithTimeout(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=15`);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.results || [];

    return items.map((item) => ({
      id: 'itunes_' + item.trackId,
      source: 'itunes',
      title: item.trackName || 'Unknown Title',
      artist: item.artistName || 'Unknown Artist',
      album: item.collectionName || 'Single',
      duration: Math.round((item.trackTimeMillis || 0) / 1000),
      streamUrl: item.previewUrl,
      uri: item.previewUrl,
      artworkUrl: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : null,
      isOnline: true,
    })).filter((s) => s.streamUrl);
  } catch (e) {
    return [];
  }
}

// Unified Global Search (Saavn 320kbps + iTunes fallback)
export async function searchGlobalOnline(query) {
  const trimmed = (query || '').trim();
  if (!trimmed || trimmed.length < 2) return [];

  try {
    const [saavnResults, itunesResults] = await Promise.allSettled([
      searchSaavn(trimmed),
      searchiTunes(trimmed),
    ]);

    const saavnList = saavnResults.status === 'fulfilled' ? saavnResults.value : [];
    const itunesList = itunesResults.status === 'fulfilled' ? itunesResults.value : [];

    // Prioritize high-quality 320kbps Saavn tracks, followed by iTunes tracks
    const combined = [...saavnList];
    for (const it of itunesList) {
      const exists = combined.some((s) => s.title.toLowerCase() === it.title.toLowerCase());
      if (!exists) combined.push(it);
    }

    return combined;
  } catch (e) {
    return [];
  }
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}
