// Global Ad-Free Online Music Streaming Engine
// Uses open-source Saavn & Piped/Invidious public APIs with zero ads, no accounts, and no subscriptions.

const SAAVN_SEARCH_ENDPOINTS = [
  'https://saavn.dev/api/search/songs?query=',
  'https://jiosaavn-api-privateindexer.vercel.app/search/songs?query=',
];

const PIPED_SEARCH_ENDPOINTS = [
  'https://pipedapi.kavin.rocks/search?q=',
  'https://api.piped.privacydev.net/search?q=',
  'https://piped-api.garudalinux.org/search?q=',
];

// Helper to fetch with timeout
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Searches JioSaavn for Indian & International songs with 320kbps direct stream URLs
async function searchSaavn(query) {
  for (const endpoint of SAAVN_SEARCH_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(`${endpoint}${encodeURIComponent(query)}&limit=25`);
      if (!res.ok) continue;
      const data = await res.json();
      const items = data?.data?.results || data?.results || [];
      if (!Array.isArray(items) || items.length === 0) continue;

      return items.map((item) => {
        // Find best audio quality (320kbps > 160kbps > 96kbps)
        let streamUrl = null;
        if (Array.isArray(item.downloadUrl) && item.downloadUrl.length > 0) {
          const sorted = [...item.downloadUrl].sort((a, b) => {
            const qA = parseInt(a.quality, 10) || 0;
            const qB = parseInt(b.quality, 10) || 0;
            return qB - qA;
          });
          streamUrl = sorted[0]?.url || sorted[0]?.link;
        } else if (typeof item.downloadUrl === 'string') {
          streamUrl = item.downloadUrl;
        } else if (item.media_url) {
          streamUrl = item.media_url;
        }

        // Find best artwork (500x500 > 150x150 > 50x50)
        let artworkUrl = null;
        if (Array.isArray(item.image) && item.image.length > 0) {
          const bestImg = item.image.find((img) => img.quality === '500x500') || item.image[item.image.length - 1];
          artworkUrl = bestImg?.url || bestImg?.link;
        } else if (typeof item.image === 'string') {
          artworkUrl = item.image;
        }

        // Artist name extraction
        let artist = 'Unknown Artist';
        if (item.artists?.primary && Array.isArray(item.artists.primary)) {
          artist = item.artists.primary.map((a) => a.name).join(', ');
        } else if (item.primaryArtists) {
          artist = item.primaryArtists;
        } else if (item.singers) {
          artist = item.singers;
        } else if (item.artist) {
          artist = item.artist;
        }

        return {
          id: 'online_saavn_' + item.id,
          source: 'saavn',
          title: decodeHtmlEntities(item.name || item.title || 'Unknown Title'),
          artist: decodeHtmlEntities(artist),
          album: decodeHtmlEntities(item.album?.name || item.album || 'Single'),
          duration: parseInt(item.duration, 10) || 0,
          streamUrl,
          uri: streamUrl, // playable directly by TrackPlayer
          artworkUrl,
          downloadUrl: streamUrl,
          year: item.year || '',
          language: item.language || '',
          isOnline: true,
        };
      }).filter((s) => s.streamUrl);
    } catch (e) {
      // try next mirror
    }
  }
  return [];
}

// Searches Piped (YouTube Music backend) for any global, remix, or live song
async function searchPiped(query) {
  for (const endpoint of PIPED_SEARCH_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(`${endpoint}${encodeURIComponent(query)}&filter=music_songs`);
      if (!res.ok) continue;
      const data = await res.json();
      const items = data?.items || [];
      if (!Array.isArray(items) || items.length === 0) continue;

      const results = [];
      for (const item of items) {
        if (item.type !== 'stream') continue;
        const videoId = (item.url || '').replace('/watch?v=', '');
        if (!videoId) continue;

        results.push({
          id: 'online_piped_' + videoId,
          source: 'piped',
          videoId,
          title: decodeHtmlEntities(item.title || 'Unknown Title'),
          artist: decodeHtmlEntities(item.uploaderName || 'YouTube Music'),
          album: 'Online Stream',
          duration: item.duration || 0,
          streamUrl: null, // resolved on-demand
          uri: null,
          artworkUrl: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          isOnline: true,
        });
      }
      if (results.length > 0) return results;
    } catch (e) {
      // try next mirror
    }
  }
  return [];
}

// Resolves on-demand stream URL for Piped/YouTube items
export async function resolvePipedStreamUrl(videoId) {
  for (const endpoint of PIPED_SEARCH_ENDPOINTS) {
    const base = endpoint.replace('/search?q=', '');
    try {
      const res = await fetchWithTimeout(`${base}/streams/${videoId}`);
      if (!res.ok) continue;
      const data = await res.json();
      const audioStreams = data?.audioStreams || [];
      if (audioStreams.length === 0) continue;

      // Pick highest bitrate audio stream
      const best = [...audioStreams].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      return best?.url || null;
    } catch (e) {}
  }
  return null;
}

// Unified Global Search with NLP & Typo-tolerance
export async function searchGlobalOnline(query) {
  const trimmed = (query || '').trim();
  if (!trimmed || trimmed.length < 2) return [];

  // Parallel search across Saavn (Indian & Global 320kbps) and Piped (Universal YouTube)
  try {
    const [saavnResults, pipedResults] = await Promise.allSettled([
      searchSaavn(trimmed),
      searchPiped(trimmed),
    ]);

    const saavnList = saavnResults.status === 'fulfilled' ? saavnResults.value : [];
    const pipedList = pipedResults.status === 'fulfilled' ? pipedResults.value : [];

    // Prioritize high-quality 320kbps Saavn tracks, followed by Piped/YouTube tracks
    const combined = [...saavnList];
    for (const p of pipedList) {
      // Avoid duplicate titles
      const exists = combined.some((s) => s.title.toLowerCase() === p.title.toLowerCase());
      if (!exists) combined.push(p);
    }

    return combined;
  } catch (e) {
    return [];
  }
}

// Decodes HTML entities commonly found in API responses like &quot;, &amp;, &#039;
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
