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

  // 1. Remove bracketed website watermarks and bitrates, e.g. [Masstamilan.dev], (PagalWorld), [320kbps], [iSongs.info]
  name = name.replace(/\[(?:[^\]]*\.(?:com|org|net|info|in|dev|me|site|cc|top|io|vip|co|world|pk)[^\]]*|[^\]]*\d{2,3}kbps[^\]]*|[^\]]*)\]/gi, '');
  name = name.replace(/\((?:[^\)]*\.(?:com|org|net|info|in|dev|me|site|cc|top|io|vip|co|world|pk)[^\)]*|[^\)]*\d{2,3}kbps[^\)]*|[^\)]*)\)/gi, '');
  name = name.replace(/(?:www\.[a-z0-9_-]+\.[a-z]{2,4}|[a-z0-9_-]+\.(?:com|org|net|info|in|dev|me|site|cc|top|io|vip|co|world|pk))/gi, '');
  name = name.replace(/[-_]?(?:320|256|192|128|64)kbps/gi, '');
  name = name.trim();

  // 2. Remove leading track number patterns: e.g. "01 - ", "01. ", "101 - ", "01_ ", "Track 01 - "
  name = name.replace(/^(?:track\s*\d+[\s._-]*|\d{1,4}[\s._-]+)/i, '');
  name = name.replace(/^\d{1,4}\s+/i, '');
  name = name.trim();

  let title = name;
  let artist = 'Unknown Artist';

  // 3. Smart separator split on " - " or " – "
  if (name.includes(' - ') || name.includes(' – ')) {
    const parts = name.split(/\s*[-–]\s*/).filter(Boolean);
    if (parts.length === 2) {
      const p1 = parts[0].trim();
      const p2 = parts[1].trim();
      // If p1 has letters and isn't just numbers or symbols, treat p1 as artist
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

  // Clean underscores into spaces
  title = title.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  artist = artist.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

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
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission was not granted');
  }

  await ensureArtworkDir();

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

    // Tier 1 Artwork: Resolve Android MediaStore album artwork URI directly
    let artworkUrl = null;
    if (asset.albumId && asset.albumId !== '0') {
      artworkUrl = `content://media/external/audio/albumart/${asset.albumId}`;
    }

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
      artworkUrl,
      addedAt: asset.creationTime || Date.now(),
      _tagsLoaded: false,
    });
  }

  // Return naturally sorted A-Z list
  return sortSongsAlphabetically(songs);
}

// Enriches a song with embedded ID3 tags in background and saves artwork to disk cache
export async function enrichSongWithTags(song) {
  if (song._tagsLoaded) return song;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(song.assetId);
    const localUri = info.localUri || song.uri;
    const tags = await parseID3Tags(localUri);

    if (tags) {
      if (tags.title && tags.title.trim().length > 0) song.title = tags.title.trim();
      if (tags.artist && tags.artist.trim().length > 0) song.artist = tags.artist.trim();
      if (tags.album && tags.album.trim().length > 0) song.album = tags.album.trim();
      if (tags.genre && tags.genre.trim().length > 0) song.genre = tags.genre.trim();

      // Tier 2 Artwork: If embedded APIC art exists, cache to disk file with .nomedia protection
      if (tags.artwork && tags.artwork.base64) {
        const artPath = `${ARTWORK_DIR}art_${song.id}.jpg`;
        await FileSystem.writeAsStringAsync(artPath, tags.artwork.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        song.artworkUrl = artPath;
      }
    }
  } catch (e) {
    // keep existing filename-derived metadata
  }
  song._tagsLoaded = true;
  return song;
}
