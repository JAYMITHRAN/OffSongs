import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { parseID3Tags } from './id3';
import { hashStr } from './theme';

const ARTWORK_DIR = (FileSystem.documentDirectory || '') + 'artwork/';

// Ensure the private artwork directory exists and has a .nomedia file
// so downloaded/extracted cover arts never show in the phone's photo gallery.
async function ensureArtworkDir() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(ARTWORK_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true });
    }
    const nomediaInfo = await FileSystem.getInfoAsync(ARTWORK_DIR + '.nomedia');
    if (!nomediaInfo.exists) {
      await FileSystem.writeAsStringAsync(ARTWORK_DIR + '.nomedia', '');
    }
  } catch (e) {
    // ignore
  }
}

// Cleans messy filenames by stripping track numbers, bitrates, and website watermarks
export function sanitizeSongMetadata(rawFilename) {
  let name = (rawFilename || '').replace(/\.[^/.]+$/, ''); // remove extension

  // 1. Remove bracketed watermarks and bitrates, e.g. [Masstamilan.dev], (PagalWorld), [320kbps], [iSongs.info]
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
    const id = 'song_' + hashStr((asset.filename || '') + '_' + asset.id);
    const sanitized = sanitizeSongMetadata(asset.filename);
    const folder = extractFolderName(asset.uri);

    songs.push({
      id,
      assetId: asset.id,
      uri: asset.uri,
      title: sanitized.title,
      artist: sanitized.artist,
      album: await albumTitle(asset.albumId),
      folder,
      genre: '',
      duration: asset.duration || 0,
      artworkUrl: null,
      addedAt: asset.creationTime || Date.now(),
      _tagsLoaded: false,
    });
  }

  return sortSongsAlphabetically(songs);
}

// Online High-Definition Artwork and Tag Auto-Resolver
export async function fetchOnlineArtworkAndTags(query) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`);
    if (!res.ok) return null;
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
  } catch (e) {
    // network offline or lookup failed
  }
  return null;
}

// Enriches a song with embedded ID3 tags or online HD art in background
export async function enrichSongWithTags(song) {
  if (song._tagsLoaded) return song;

  // 1. Try local ID3 tags from file
  try {
    const info = await MediaLibrary.getAssetInfoAsync(song.assetId);
    const localUri = info.localUri || song.uri;
    const tags = await parseID3Tags(localUri);

    if (tags) {
      if (tags.title && tags.title.trim().length > 0) song.title = tags.title.trim();
      if (tags.artist && tags.artist.trim().length > 0) song.artist = tags.artist.trim();
      if (tags.album && tags.album.trim().length > 0) song.album = tags.album.trim();
      if (tags.genre && tags.genre.trim().length > 0) song.genre = tags.genre.trim();

      if (tags.artwork && tags.artwork.base64) {
        const artPath = `${ARTWORK_DIR}art_${song.id}.jpg`;
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
          // Download and cache permanently to device storage with .nomedia protection
          const artPath = `${ARTWORK_DIR}art_${song.id}.jpg`;
          const dl = await FileSystem.downloadAsync(online.artworkUrl, artPath);
          if (dl && dl.uri) {
            song.artworkUrl = dl.uri;
          }
        }
      }
    } catch (netErr) {
      // offline
    }
  }

  song._tagsLoaded = true;
  return song;
}
