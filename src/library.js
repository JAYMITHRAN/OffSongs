import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { parseID3Tags } from './id3';
import { hashStr } from './theme';

function getArtworkDir() {
  const doc = FileSystem.documentDirectory || '';
  return doc.endsWith('/') ? `${doc}artwork/` : `${doc}/artwork/`;
}

// Ensure the private artwork directory exists and has a .nomedia file
// so downloaded/extracted cover arts never show in the phone's photo gallery.
async function ensureArtworkDir() {
  try {
    const artDir = getArtworkDir();
    const dirInfo = await FileSystem.getInfoAsync(artDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(artDir, { intermediates: true });
    }
    const nomediaInfo = await FileSystem.getInfoAsync(artDir + '.nomedia');
    if (!nomediaInfo.exists) {
      await FileSystem.writeAsStringAsync(artDir + '.nomedia', '');
    }
  } catch (e) {
    // ignore
  }
}

// Filters out junk audio files: ringtones, alarms, notifications, WhatsApp voice notes, call recordings
export function isJunkOrRingtone(filename, uri, duration) {
  // 1. Filter short audio (< 30 seconds)
  if (duration && duration > 0 && duration < 30) return true;

  const lowerUri = (uri || '').toLowerCase();
  const lowerName = (filename || '').toLowerCase();

  // 2. Filter system ringtones, alarms, notifications
  if (
    lowerUri.includes('/ringtones/') ||
    lowerUri.includes('/notifications/') ||
    lowerUri.includes('/alarms/') ||
    lowerUri.includes('/ui/') ||
    lowerUri.includes('/system/media/') ||
    lowerUri.includes('/media/audio/ringtones') ||
    lowerUri.includes('/media/audio/notifications') ||
    lowerUri.includes('/media/audio/alarms')
  ) return true;

  // 3. Filter WhatsApp voice notes and audio dumps
  if (
    lowerUri.includes('whatsapp voice notes') ||
    lowerUri.includes('whatsapp audio') ||
    lowerUri.includes('voice notes') ||
    lowerName.startsWith('ptt-') ||
    lowerName.startsWith('aud-') ||
    lowerName.startsWith('opus_')
  ) return true;

  // 4. Filter Call recordings and voice recorder memos
  if (
    lowerUri.includes('/call recordings/') ||
    lowerUri.includes('/call recording/') ||
    lowerUri.includes('/voicerecorder/') ||
    lowerUri.includes('/recordings/') ||
    lowerUri.includes('/sound recorder/') ||
    lowerName.startsWith('call_') ||
    lowerName.startsWith('voice_') ||
    lowerName.startsWith('rec_')
  ) return true;

  return false;
}

// Cleans messy filenames by stripping track numbers, bitrates, and website watermarks
export function sanitizeSongMetadata(rawFilename) {
  let name = (rawFilename || '').replace(/\.[^/.]+$/, ''); // remove extension

  // 1. Remove bracketed watermarks and bitrates
  name = name.replace(/\[(?:[^\]]*\.(?:com|org|net|info|in|dev|me|site|cc|top|io|vip|co|world|pk)[^\]]*|[^\]]*\d{2,3}kbps[^\]]*|[^\]]*)\]/gi, '');
  name = name.replace(/\((?:[^\)]*\.(?:com|org|net|info|in|dev|me|site|cc|top|io|vip|co|world|pk)[^\)]*|[^\)]*\d{2,3}kbps[^\)]*|[^\)]*)\)/gi, '');
  name = name.replace(/(?:www\.[a-z0-9_-]+\.[a-z]{2,4}|[a-z0-9_-]+\.(?:com|org|net|info|in|dev|me|site|cc|top|io|vip|co|world|pk))/gi, '');

  // 2. Remove common site suffixes connected by hyphens or underscores
  name = name.replace(/[-_]?(?:MassTamilan|Masstamilan|PagalWorld|Sensongsmp3|StarMusiQ|Isaimini|KuttyWap|TamilTunes|NaaSongs|iSongs|Pendujatt|DjPunjab|SongsPk|Waploft|VagalWorld|Hungama|Gaana|JioSaavn|Wynk)(?:\.[a-z]{2,4})?/gi, '');
  name = name.replace(/[-_]?(?:320|256|192|128|64)kbps/gi, '');
  name = name.replace(/[-_]?(?:HQ|HD|Audio|Song|Track|mp3|remix|Remix)/gi, '');
  name = name.trim();

  // 3. Remove leading track number patterns: e.g. "01 - ", "01. ", "101 - ", "01_ ", "Track 01 - "
  name = name.replace(/^(?:track\s*\d+[\s._-]*|\d{1,4}[\s._-]+)/i, '');
  name = name.replace(/^\d{1,4}\s+/i, '');
  name = name.trim();

  let title = name;
  let artist = 'Unknown Artist';

  // 4. Smart separator split on " - " or " – " or " _ "
  if (name.includes(' - ') || name.includes(' – ')) {
    const parts = name.split(/\s*[-–]\s*/).filter(Boolean);
    if (parts.length === 2) {
      const p1 = parts[0].trim();
      const p2 = parts[1].trim();
      if (/^[a-zA-Z\u00C0-\u024F\u0900-\u0DFF]/.test(p1) && !/^\d+$/.test(p1) && p1.length > 1) {
        artist = p1;
        title = p2;
      } else {
        title = p2 || p1;
      }
    } else if (parts.length >= 3) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
  }

  // 5. Clean underscores and hyphens into clean human-readable words
  title = title.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  artist = artist.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

  // Capitalize first letter of each word if all lowercase
  if (title === title.toLowerCase() && title.length > 0) {
    title = title.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return {
    title: title || rawFilename || 'Unknown Track',
    artist: artist || 'Unknown Artist',
  };
}

// Natural case-insensitive alphabetical sorting
export function sortSongsAlphabetically(songsList) {
  return [...songsList].sort((a, b) =>
    (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
  );
}

// Extracts directory/folder name from file URI or path
function extractFolderName(uri) {
  try {
    if (!uri) return 'Music';
    const decoded = decodeURIComponent(uri);
    const parts = decoded.split('/');
    if (parts.length > 1) {
      return parts[parts.length - 2] || 'Music';
    }
  } catch (e) {
    // fallback
  }
  return 'Music';
}

// Smart Fuzzy Matching Function for searching songs
export function matchesSong(song, query) {
  if (!query || !query.trim()) return true;

  function normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/aa/g, 'a')
      .replace(/ee/g, 'i')
      .replace(/oo/g, 'u')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const normQ = normalize(query);
  const qTokens = normQ.split(' ').filter(Boolean);

  const titleNorm = normalize(song.title);
  const artistNorm = normalize(song.artist);
  const albumNorm = normalize(song.album);
  const folderNorm = normalize(song.folder);
  const combined = `${titleNorm} ${artistNorm} ${albumNorm} ${folderNorm}`;

  // Direct substring check
  const rawQ = query.trim().toLowerCase();
  if (
    (song.title || '').toLowerCase().includes(rawQ) ||
    (song.artist || '').toLowerCase().includes(rawQ) ||
    (song.album || '').toLowerCase().includes(rawQ)
  ) {
    return true;
  }

  // Token-by-token check
  return qTokens.every((token) => combined.includes(token));
}

export async function requestPermissionAndScan(onProgress) {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'audio/*';

      input.onchange = async (e) => {
        const files = Array.from(e.target.files || []).filter((f) =>
          f.type.startsWith('audio/') || /\.(mp3|m4a|wav|flac|aac|ogg)$/i.test(f.name)
        );

        if (files.length === 0) {
          resolve([]);
          return;
        }

        const realSongs = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const sanitized = sanitizeSongMetadata(file.name);
          const uri = URL.createObjectURL(file);
          const folder = file.webkitRelativePath ? file.webkitRelativePath.split('/')[0] : 'Music';

          let duration = 0;
          try {
            duration = await new Promise((res) => {
              const audio = new Audio();
              audio.src = uri;
              audio.onloadedmetadata = () => res(Math.round(audio.duration));
              audio.onerror = () => res(0);
              setTimeout(() => res(0), 1000);
            });
          } catch (err) {}

          if (isJunkOrRingtone(file.name, uri, duration)) continue;

          realSongs.push({
            id: 'real_song_' + hashStr(file.name + '_' + file.size),
            title: sanitized.title,
            artist: sanitized.artist,
            album: 'Local Audio',
            folder: folder || 'Music',
            genre: '',
            duration: duration || 0,
            uri,
            artworkUrl: null,
            addedAt: file.lastModified || Date.now(),
            _tagsLoaded: false,
          });

          if (onProgress) onProgress(realSongs.length);
        }

        resolve(sortSongsAlphabetically(realSongs));
      };

      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  await ensureArtworkDir();
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission was not granted');
  }

  const albumCache = {};
  async function albumTitle(albumId) {
    if (!albumId) return 'Unknown Album';
    if (albumCache[albumId]) return albumCache[albumId];
    try {
      const album = await MediaLibrary.getAlbumAsync(albumId);
      albumCache[albumId] = (album && album.title) || 'Unknown Album';
    } catch (e) {
      albumCache[albumId] = 'Unknown Album';
    }
    return albumCache[albumId];
  }

  let assets = [];
  let after = undefined;
  while (true) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.audio,
      first: 200,
      after,
    });
    assets = assets.concat(page.assets);
    if (onProgress) onProgress(assets.length);
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }

  const songs = [];
  for (const asset of assets) {
    const duration = asset.duration || 0;
    if (isJunkOrRingtone(asset.filename, asset.uri, duration)) continue;

    const id = 'song_' + hashStr((asset.filename || '') + '_' + asset.id);
    const sanitized = sanitizeSongMetadata(asset.filename);
    const folder = extractFolderName(asset.uri);
    const mediaArtUri = asset.albumId
      ? `content://media/external/audio/albumart/${asset.albumId}`
      : `content://media/external/audio/media/${asset.id}/albumart`;

    songs.push({
      id,
      assetId: asset.id,
      albumId: asset.albumId,
      uri: asset.uri,
      title: sanitized.title,
      artist: sanitized.artist,
      album: await albumTitle(asset.albumId),
      folder,
      genre: '',
      duration,
      mediaStoreArtUri: mediaArtUri,
      artworkUrl: mediaArtUri,
      addedAt: asset.creationTime || Date.now(),
      _tagsLoaded: false,
    });
  }

  return sortSongsAlphabetically(songs);
}

// Online High-Definition Artwork and Tag Auto-Resolver
// Queries JioSaavn (for 100% regional & Indian songs) with iTunes fallback
export async function fetchOnlineArtworkAndTags(query) {
  const cleanQ = (query || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^\)]*\)/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanQ || cleanQ.length < 2) return null;

  // 1. Query JioSaavn Search API for 500x500 HD Cover Art & Authentic Metadata
  try {
    const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&n=1&p=1&q=${encodeURIComponent(cleanQ)}`;
    const res = await fetch(saavnUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const item = data.results[0];
        const rawArt = item.image || (item.more_info && item.more_info.image) || '';
        const hdArt = rawArt ? rawArt.replace('150x150', '500x500').replace('50x50', '500x500') : null;
        return {
          title: item.song || item.title || null,
          artist: item.primary_artists || item.singers || null,
          album: item.album || null,
          genre: item.language || null,
          artworkUrl: hdArt,
        };
      }
    }
  } catch (e) {}

  // 2. Fallback to iTunes API
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&media=music&limit=1`;
    const res = await fetch(itunesUrl);
    if (res.ok) {
      const json = await res.json();
      if (json.results && json.results.length > 0) {
        const track = json.results[0];
        const hdArt = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : null;
        return {
          title: track.trackName || null,
          artist: track.artistName || null,
          album: track.collectionName || null,
          genre: track.primaryGenreName || null,
          artworkUrl: hdArt,
        };
      }
    }
  } catch (e) {}

  return null;
}

// Enriches a song with embedded ID3 tags or online HD art in background
export async function enrichSongWithTags(song) {
  if (song._tagsLoaded && song.artworkUrl && song.artist !== 'Unknown Artist') {
    return song;
  }

  const artDir = getArtworkDir();
  await ensureArtworkDir();

  // 1. Try local ID3 tags from file
  try {
    const info = await MediaLibrary.getAssetInfoAsync(song.assetId);
    const localUri = info.localUri || song.uri;
    if (info.localUri) song.uri = info.localUri;
    const tags = await parseID3Tags(localUri);

    if (tags) {
      if (tags.title && tags.title.trim().length > 0) song.title = tags.title.trim();
      if (tags.artist && tags.artist.trim().length > 0) song.artist = tags.artist.trim();
      if (tags.album && tags.album.trim().length > 0) song.album = tags.album.trim();
      if (tags.genre && tags.genre.trim().length > 0) song.genre = tags.genre.trim();

      if (tags.artwork && tags.artwork.base64) {
        const safeId = (song.id || 'track').replace(/[^a-zA-Z0-9_-]/g, '_');
        const artPath = `${artDir}art_${safeId}.jpg`;
        await FileSystem.writeAsStringAsync(artPath, tags.artwork.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        song.artworkUrl = artPath;
      }
    }
  } catch (e) {
    // continue to online tier
  }

  // 2. If artist is still unknown or artwork is missing, fetch official HD artwork & metadata
  if (!song.artworkUrl || song.artist === 'Unknown Artist') {
    try {
      const query = song.title + (song.artist && song.artist !== 'Unknown Artist' ? ' ' + song.artist : '');
      const online = await fetchOnlineArtworkAndTags(query);
      if (online) {
        if (song.artist === 'Unknown Artist' && online.artist) {
          song.artist = online.artist;
        }
        if ((!song.album || song.album === 'Unknown Album') && online.album) {
          song.album = online.album;
        }
        if (!song.genre && online.genre) {
          song.genre = online.genre;
        }
        if (!song.artworkUrl && online.artworkUrl) {
          const safeId = (song.id || 'track').replace(/[^a-zA-Z0-9_-]/g, '_');
          const artPath = `${artDir}art_${safeId}.jpg`;
          const dl = await FileSystem.downloadAsync(online.artworkUrl, artPath);
          if (dl && dl.uri) {
            song.artworkUrl = dl.uri;
          }
        }
      }
    } catch (netErr) {}
  }

  song._tagsLoaded = true;
  return song;
}
