import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { loadLibraryCache, saveLibraryCache, registerTrack } from './store';
import { resolveStreamUrl } from './onlineStream';

function getMusicDir() {
  const doc = FileSystem.documentDirectory || '';
  return doc.endsWith('/') ? `${doc}music/` : `${doc}/music/`;
}

function getArtworkDir() {
  const doc = FileSystem.documentDirectory || '';
  return doc.endsWith('/') ? `${doc}artwork/` : `${doc}/artwork/`;
}

async function ensureDirs() {
  try {
    const musicDir = getMusicDir();
    const artDir = getArtworkDir();

    const mInfo = await FileSystem.getInfoAsync(musicDir);
    if (!mInfo.exists) await FileSystem.makeDirectoryAsync(musicDir, { intermediates: true });

    const aInfo = await FileSystem.getInfoAsync(artDir);
    if (!aInfo.exists) await FileSystem.makeDirectoryAsync(artDir, { intermediates: true });

    // .nomedia prevents external photo galleries and scanners from polluting artwork
    const nomedia = await FileSystem.getInfoAsync(artDir + '.nomedia');
    if (!nomedia.exists) await FileSystem.writeAsStringAsync(artDir + '.nomedia', '');
  } catch (e) {
    console.warn('OffSongs: ensureDirs warning', e);
  }
}

const activeDownloads = new Set(); // set of song ids

// Downloads an online song, saves audio (m4a/mp3) + HD artwork, and indexes to local library
export async function downloadSongForOffline(song) {
  if (!song) throw new Error('Invalid song object for download');
  await ensureDirs();

  if (activeDownloads.has(song.id)) {
    return { success: false, message: 'Download already in progress' };
  }

  let downloadUrl = song.streamUrl || song.downloadUrl || song.uri;
  if (!downloadUrl && song.isOnline) {
    downloadUrl = await resolveStreamUrl(song);
  }

  if (!downloadUrl) {
    throw new Error('Unable to resolve audio stream for download');
  }

  // Determine correct audio container extension for Android 13/14 MediaStore compatibility
  let ext = 'm4a';
  if (downloadUrl.includes('.mp3')) ext = 'mp3';
  else if (downloadUrl.includes('.aac')) ext = 'aac';
  else if (downloadUrl.includes('.flac')) ext = 'flac';

  const safeId = (song.id || 'track_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
  const localAudioPath = `${getMusicDir()}${safeId}.${ext}`;
  const localArtPath = `${getArtworkDir()}art_${safeId}.jpg`;

  activeDownloads.add(song.id);

  try {
    // 0. Clean any existing partial download file to prevent EEXIST locks
    try {
      const existing = await FileSystem.getInfoAsync(localAudioPath);
      if (existing.exists) {
        await FileSystem.deleteAsync(localAudioPath, { idempotent: true });
      }
    } catch (delErr) {}

    // 1. Prepare candidates (320k, 160k, original)
    const urlsToTry = [];
    if (downloadUrl.includes('_96.mp4') || downloadUrl.includes('_160.mp4') || downloadUrl.includes('_320.mp4')) {
      urlsToTry.push(downloadUrl.replace(/_96\.mp4|_160\.mp4/, '_320.mp4'));
      urlsToTry.push(downloadUrl.replace(/_96\.mp4|_320\.mp4/, '_160.mp4'));
      urlsToTry.push(downloadUrl);
    } else {
      urlsToTry.push(downloadUrl);
    }

    let dlResult = null;
    let lastError = null;

    for (const url of urlsToTry) {
      try {
        // Clean before attempt
        const check = await FileSystem.getInfoAsync(localAudioPath);
        if (check.exists) await FileSystem.deleteAsync(localAudioPath, { idempotent: true });

        dlResult = await FileSystem.downloadAsync(url, localAudioPath, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile)' },
        });
        if (dlResult && dlResult.uri && (!dlResult.status || dlResult.status < 400)) {
          break;
        }
      } catch (tryErr) {
        lastError = tryErr;
      }
    }

    if (!dlResult || !dlResult.uri || (dlResult.status && dlResult.status >= 400)) {
      throw new Error(`Download failed: ${lastError?.message || 'Server returned status ' + dlResult?.status}`);
    }

    // 2. Download HD Artwork
    let savedArtUrl = null;
    if (song.artworkUrl && song.artworkUrl.startsWith('http')) {
      try {
        const artResult = await FileSystem.downloadAsync(song.artworkUrl, localArtPath, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile)' },
        });
        if (artResult && artResult.uri) savedArtUrl = artResult.uri;
      } catch (artErr) {
        // Fallback to online/dynamic gradient thumbnail
      }
    }

    // 3. Register with Android Media Library if permitted (safe, non-blocking)
    let assetId = null;
    try {
      if (Platform.OS === 'android') {
        const asset = await MediaLibrary.createAssetAsync(dlResult.uri);
        if (asset && asset.id) {
          assetId = asset.id;
        }
      }
    } catch (mlErr) {
      // Non-blocking fallback
    }

    // 4. Create permanent local song record using reliable file:// URI
    const localSong = {
      id: song.id,
      assetId,
      title: song.title || 'Downloaded Track',
      artist: song.artist || 'Unknown Artist',
      album: song.album || 'Downloaded',
      folder: 'Downloads',
      genre: song.genre || '',
      duration: song.duration || 0,
      uri: dlResult.uri,
      artworkUrl: savedArtUrl || song.artworkUrl,
      addedAt: Date.now(),
      isOnline: false,
      isDownloaded: true,
      _tagsLoaded: true,
    };

    // 5. Save into library cache and register in persistent track map
    const currentLibrary = (await loadLibraryCache()) || [];
    const filtered = currentLibrary.filter((s) => s.id !== localSong.id);
    const updated = [localSong, ...filtered];
    await saveLibraryCache(updated);
    registerTrack(localSong);

    return { success: true, song: localSong };
  } finally {
    activeDownloads.delete(song.id);
  }
}

// Checks if a song has already been downloaded locally
export async function isSongDownloaded(songId) {
  try {
    const safeId = (songId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const pathM4a = `${getMusicDir()}${safeId}.m4a`;
    const pathMp3 = `${getMusicDir()}${safeId}.mp3`;
    const [infoM4a, infoMp3] = await Promise.all([
      FileSystem.getInfoAsync(pathM4a),
      FileSystem.getInfoAsync(pathMp3),
    ]);
    return infoM4a.exists || infoMp3.exists;
  } catch (e) {
    return false;
  }
}
