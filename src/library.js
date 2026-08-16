import * as MediaLibrary from 'expo-media-library';
import { parseID3Tags } from './id3';
import { hashStr } from './theme';

// Requests permission and pulls every audio asset the OS knows about —
// this is the real equivalent of the PRD's "Music Scanner" component,
// using Android/iOS media APIs instead of a manual per-file picker.
export async function requestPermissionAndScan(onProgress) {
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
  // Page through the whole audio library (MediaLibrary caps a single page at 100-ish reliably).
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
    const id = 'song_' + hashStr(asset.filename + '_' + asset.id);
    let title = asset.filename.replace(/\.[^/.]+$/, '');
    let artist = 'Unknown Artist';
    const m = title.match(/^(.+?)\s*-\s*(.+)$/);
    if (m) { artist = m[1].trim(); title = m[2].trim(); }

    songs.push({
      id,
      assetId: asset.id,
      uri: asset.uri,
      title,
      artist,
      album: await albumTitle(asset.albumId),
      genre: '',
      duration: asset.duration || 0,
      artworkUrl: null,
      addedAt: asset.creationTime || Date.now(),
      _tagsLoaded: false,
    });
  }
  return songs;
}

// Enriches a song in the background with real ID3 tags (title/artist/album/
// genre/embedded artwork) once its file is locally accessible. Call this
// lazily per-song (e.g. as rows scroll into view) rather than for the whole
// library at once — reading tag bytes for thousands of files up front is
// unnecessary I/O the PRD's performance section explicitly warns against.
export async function enrichSongWithTags(song) {
  if (song._tagsLoaded) return song;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(song.assetId);
    const localUri = info.localUri || song.uri;
    const tags = await parseID3Tags(localUri);
    if (tags) {
      if (tags.title) song.title = tags.title;
      if (tags.artist) song.artist = tags.artist;
      if (tags.album) song.album = tags.album;
      if (tags.genre) song.genre = tags.genre;
      if (tags.artwork) song.artworkUrl = `data:${tags.artwork.mime};base64,${tags.artwork.base64}`;
    }
  } catch (e) {
    // keep filename-derived metadata
  }
  song._tagsLoaded = true;
  return song;
}
