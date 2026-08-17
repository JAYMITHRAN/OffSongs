// Global Ad-Free Online Music Streaming Engine
// Uses direct official JioSaavn API and iTunes Public API for 100% reliability and 320kbps audio.

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

// Searches JioSaavn directly for all Indian and international songs
async function searchSaavn(query) {
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&n=20&p=1&q=${encodeURIComponent(query)}`;
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

      return {
        id: 'saavn_' + item.id,
        source: 'saavn',
        title: decodeHtmlEntities(title),
        artist: decodeHtmlEntities(artist),
        album: decodeHtmlEntities(album),
        duration,
        encryptedMediaUrl: encUrl,
        streamUrl: null, // resolved on-demand via generateAuthToken
        uri: null,
        artworkUrl: hdArtwork,
        isOnline: true,
      };
    });
  } catch (e) {
    return [];
  }
}

// Resolves on-demand direct 320kbps streaming & download URL from JioSaavn CDN
export async function resolveStreamUrl(song) {
  if (song.streamUrl) return song.streamUrl;
  if (!song.encryptedMediaUrl) return null;

  try {
    const tokenUrl = `https://www.jiosaavn.com/api.php?__call=song.generateAuthToken&url=${encodeURIComponent(song.encryptedMediaUrl)}&bitrate=320&_format=json`;
    const res = await fetchWithTimeout(tokenUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const authUrl = data.auth_url;
    if (!authUrl) return null;

    // Follow CDN redirect directly to aac.saavncdn.com
    const cdnRes = await fetch(authUrl, { method: 'HEAD', redirect: 'follow' });
    const finalUrl = cdnRes.url || authUrl;
    song.streamUrl = finalUrl;
    song.uri = finalUrl;
    return finalUrl;
  } catch (e) {
    return null;
  }
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
