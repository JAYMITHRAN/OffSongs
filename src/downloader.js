import * as FileSystem from 'expo-file-system';
import { loadLibraryCache, saveLibraryCache } from './store';
import { resolveStreamUrl } from './onlineStream';

const MUSIC_DIR = (FileSystem.documentDirectory || '') + 'music/';
const ARTWORK_DIR = (FileSystem.documentDirectory || '') + 'artwork/';

async function ensureDirs() {
  try {
    const mInfo = await FileSystem.getInfoAsync(MUSIC_DIR);
    if (!mInfo.exists) await FileSystem.makeDirectoryAsync(MUSIC_DIR, { intermediates: true });

    const aInfo = await FileSystem.getInfoAsync(ARTWORK_DIR);
    if (!aInfo.exists) await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true });

    // .nomedia prevents phone photo gallery and media scanner from polluting
    const nomedia = await FileSystem.getInfoAsync(ARTWORK_DIR + '.nomedia');
    if (!nomedia.exists) await FileSystem.writeAsStringAsync(ARTWORK_DIR + '.nomedia', '');
  } catch (e) {}
}

const activeDownloads = new Map(); // id -> DownloadResumable

// Downloads an online song with 1 tap, saves audio + HD art, and adds to local library
export async function downloadSongForOffline(song, onProgress) {
  await ensureDirs();

  if (activeDownloads.has(song.id)) {
    return { success: false, message: 'Download already in progress' };
  }

  let downloadUrl = song.downloadUrl || song.streamUrl;
  if (!downloadUrl && song.isOnline) {
    downloadUrl = await resolveStreamUrl(song);
  }

  if (!downloadUrl) {
    throw new Error('Unable to resolve audio stream for download');
  }

  const localAudioPath = `${MUSIC_DIR}${song.id}.mp3`;
  const localArtPath = `${ARTWORK_DIR}art_${song.id}.jpg`;

  try {
    // 1. Download audio file
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      localAudioPath,
      {},
      (downloadProgress) => {
        const total = downloadProgress.totalBytesExpectedToWrite;
        const current = downloadProgress.totalBytesWritten;
        const frac = total > 0 ? current / total : 0;
        if (onProgress) onProgress(frac);
      }
    );

    activeDownloads.set(song.id, downloadResumable);
    const result = await downloadResumable.downloadAsync();
    activeDownloads.delete(song.id);

    if (!result || !result.uri) {
      throw new Error('Audio download failed');
    }

    // 2. Download HD Artwork
    let savedArtUrl = null;
    if (song.artworkUrl && song.artworkUrl.startsWith('http')) {
      try {
        const artResult = await FileSystem.downloadAsync(song.artworkUrl, localArtPath);
        if (artResult && artResult.uri) savedArtUrl = artResult.uri;
      } catch (artErr) {
        // use fallback gradient
      }
    }

    // 3. Create permanent local song record
    const localSong = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album || 'Downloaded',
      folder: 'Downloads',
      genre: song.genre || '',
      duration: song.duration || 0,
      uri: result.uri,
      artworkUrl: savedArtUrl,
      addedAt: Date.now(),
      isOnline: false,
      isDownloaded: true,
      _tagsLoaded: true,
    };

    // 4. Save directly into AsyncStorage library cache
    const currentLibrary = (await loadLibraryCache()) || [];
    const exists = currentLibrary.some((s) => s.id === localSong.id);
    if (!exists) {
      const updated = [localSong, ...currentLibrary];
      await saveLibraryCache(updated);
    }

    return { success: true, song: localSong };
  } catch (err) {
    activeDownloads.delete(song.id);
    throw err;
  }
}

// Checks if a song has already been downloaded locally
export async function isSongDownloaded(songId) {
  try {
    const path = `${MUSIC_DIR}${songId}.mp3`;
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  } catch (e) {
    return false;
  }
}
