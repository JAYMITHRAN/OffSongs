import { useState, useRef, useCallback, useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import TrackPlayer, {
  Capability, Event, State, useProgress, usePlaybackState,
  useTrackPlayerEvents,
} from 'react-native-track-player';
import { generateQueue, sequentialQueue } from './engine';
import { resolveStreamUrl } from './onlineStream';
import {
  statsFor, recordPlayStart, recordListeningEvent, recordSkip, getDB, setSetting,
} from './store';

const TRACK_EVENTS = [Event.PlaybackActiveTrackChanged, Event.PlaybackQueueEnded];

let playerSetupDone = false;
export async function setupTrackPlayerOnce() {
  if (Platform.OS === 'web') return;
  if (playerSetupDone) return;
  try {
    await TrackPlayer.setupPlayer({});
    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play, Capability.Pause, Capability.SkipToNext,
        Capability.SkipToPrevious, Capability.SeekTo, Capability.Stop,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
    });
    playerSetupDone = true;
  } catch (e) {
    console.warn('OffSongs: TrackPlayer setup failed', e);
  }
}

function toTrack(song, resolvedUrl) {
  let art = undefined;
  if (song && song.artworkUrl) {
    if (
      song.artworkUrl.startsWith('http://') ||
      song.artworkUrl.startsWith('https://') ||
      song.artworkUrl.startsWith('file://')
    ) {
      art = song.artworkUrl;
    }
  }

  return {
    id: String((song && song.id) || 'track_' + Date.now()),
    url: resolvedUrl || (song && song.uri),
    title: String((song && song.title) || 'Unknown Title'),
    artist: String((song && song.artist) || 'Unknown Artist'),
    album: String((song && song.album) || 'Unknown Album'),
    artwork: art,
    duration: typeof song?.duration === 'number' && song.duration > 0 ? song.duration : undefined,
  };
}

export function usePlayer(songs) {
  const [currentSong, setCurrentSong] = useState(null);
  const [currentReason, setCurrentReason] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queuePos, setQueuePos] = useState(-1);
  const [smartMode, setSmartMode] = useState(getDB().settings.smart !== false);
  const [repeatMode, setRepeatMode] = useState(getDB().settings.repeat || 'all');
  const [volume, setVolumeState] = useState(1.0);
  const [appState, setAppState] = useState(AppState.currentState);

  // Web playback state simulation
  const [webPlaying, setWebPlaying] = useState(false);
  const [webPos, setWebPos] = useState(0);

  const recentPlayedIds = useRef([]);
  const playStartedAt = useRef(0);
  const countedThisPlay = useRef(false);
  const currentSongRef = useRef(null);
  const queueRef = useRef([]);
  const queuePosRef = useRef(-1);
  const smartModeRef = useRef(smartMode);
  const repeatModeRef = useRef(repeatMode);
  const loadTokenRef = useRef(0);

  currentSongRef.current = currentSong;
  queueRef.current = queue;
  queuePosRef.current = queuePos;
  smartModeRef.current = smartMode;
  repeatModeRef.current = repeatMode;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setAppState(next));
    return () => sub.remove();
  }, []);

  // Web progress ticker
  useEffect(() => {
    if (Platform.OS !== 'web' || !webPlaying || !currentSong) return;
    const interval = setInterval(() => {
      setWebPos((p) => {
        const next = p + 0.5;
        if (currentSong.duration && next >= currentSong.duration) {
          advance(false);
          return 0;
        }
        return next;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [webPlaying, currentSong]);

  let nativeProgress = { position: 0, duration: 0 };
  let nativePlaybackState = { state: State?.None };
  if (Platform.OS !== 'web') {
    try {
      nativeProgress = useProgress(appState === 'active' ? 250 : 2000);
      nativePlaybackState = usePlaybackState();
    } catch (e) {}
  }

  // Automatic Play Next listener via TrackPlayer native events
  if (Platform.OS !== 'web') {
    try {
      useTrackPlayerEvents(TRACK_EVENTS, async (event) => {
        if (event.type === Event.PlaybackQueueEnded) {
          if (repeatModeRef.current === 'one') {
            await TrackPlayer.seekTo(0);
            await TrackPlayer.play();
          } else {
            advance(false);
          }
        }
      });
    } catch (e) {}
  }

  const isPlaying =
    Platform.OS === 'web'
      ? webPlaying
      : nativePlaybackState?.state === State.Playing ||
        nativePlaybackState === State.Playing ||
        nativePlaybackState === 'playing' ||
        nativePlaybackState?.state === 'playing';

  const currentPosition = Platform.OS === 'web' ? webPos : nativeProgress.position;
  const currentDuration =
    (Platform.OS === 'web' ? currentSong?.duration || 0 : nativeProgress.duration) ||
    (currentSong && currentSong.duration) ||
    0;

  const finalizePrevious = useCallback(async () => {
    const prev = currentSongRef.current;
    if (!prev) return;
    const pos = await TrackPlayer.getPosition().catch(() => 0);
    if (pos < 1) return;
    recordListeningEvent({
      songId: prev.id,
      startedAt: playStartedAt.current,
      secondsPlayed: pos,
      durationSeconds: prev.duration,
    });
  }, []);

  const rebuildQueueAfter = useCallback((seed) => {
    const built = smartModeRef.current
      ? generateQueue(songs, seed, recentPlayedIds.current, 14)
      : sequentialQueue(songs, seed, 14);
    setQueue(built);
    setQueuePos(-1);
  }, [songs]);

  const extendQueueIfLow = useCallback(() => {
    const q = queueRef.current, pos = queuePosRef.current;
    if (q.length - (pos + 1) < 3) {
      const seed = q.length ? q[q.length - 1].song : currentSongRef.current;
      const more = smartModeRef.current
        ? generateQueue(songs, seed, recentPlayedIds.current, 8)
        : sequentialQueue(songs, seed, 8);
      setQueue(q.concat(more));
    }
  }, [songs]);

  // Protected track loader with concurrency token and missing file fallback
  const load = useCallback(async (song, reason) => {
    if (!song) return;
    const token = ++loadTokenRef.current;
    await finalizePrevious();
    if (token !== loadTokenRef.current) return;

    let playableUri = song.uri || song.streamUrl;
    if (!playableUri && song.isOnline) {
      try {
        playableUri = await resolveStreamUrl(song);
      } catch (streamErr) {
        console.warn('OffSongs: stream resolution warning', streamErr);
      }
    }

    if (!playableUri) {
      console.warn('OffSongs: cannot play track with empty URI', song);
      return;
    }

    if (Platform.OS === 'web') {
      setCurrentSong({ ...song, uri: playableUri });
      setCurrentReason(reason || (song.isOnline ? 'Online Stream' : null));
      setWebPlaying(true);
      setWebPos(0);
      playStartedAt.current = Date.now();
      countedThisPlay.current = false;
      recentPlayedIds.current.push(song.id);
      if (recentPlayedIds.current.length > 20) recentPlayedIds.current.shift();
      return;
    }

    try {
      await TrackPlayer.reset();
      if (token !== loadTokenRef.current) return;
      const trackObj = toTrack(song, playableUri);
      await TrackPlayer.add(trackObj);
      if (token !== loadTokenRef.current) return;
      await TrackPlayer.play();

      setCurrentSong({ ...song, uri: playableUri });
      setCurrentReason(reason || (song.isOnline ? 'Online Stream' : null));
      playStartedAt.current = Date.now();
      countedThisPlay.current = false;
      recentPlayedIds.current.push(song.id);
      if (recentPlayedIds.current.length > 20) recentPlayedIds.current.shift();
    } catch (e) {
      console.warn('OffSongs: standard track add failed, executing resilient fallback', e);
      try {
        await TrackPlayer.reset();
        await TrackPlayer.add({
          id: String((song && song.id) || Date.now()),
          url: playableUri,
          title: String((song && song.title) || 'Audio Track'),
          artist: String((song && song.artist) || 'Unknown Artist'),
        });
        await TrackPlayer.play();
        setCurrentSong({ ...song, uri: playableUri });
        setCurrentReason(reason || (song.isOnline ? 'Online Stream' : null));
      } catch (retryErr) {
        console.warn('OffSongs: resilient fallback error', retryErr);
      }
    }
  }, [finalizePrevious]);

  const playlistContextRef = useRef(null); // { list, tagLabel, index }

  const playFromLibrary = useCallback(async (song) => {
    playlistContextRef.current = null;
    await load(song, null);
    rebuildQueueAfter(song);
  }, [load, rebuildQueueAfter]);

  const playList = useCallback(async (list, startIndex = 0, tagLabel = 'Playlist') => {
    if (!list || list.length === 0) return;
    const startSong = list[startIndex] || list[0];
    playlistContextRef.current = { list: [...list], tagLabel, index: startIndex };
    await load(startSong, tagLabel);
    const after = list.slice(startIndex + 1).map((s) => ({ song: s, reason: tagLabel }));
    const before = list.slice(0, startIndex).map((s) => ({ song: s, reason: tagLabel }));
    setQueue([...after, ...before]);
    setQueuePos(-1);
  }, [load]);

  const shuffleList = useCallback(async (list, tagLabel = 'Shuffle') => {
    if (!list || list.length === 0) return;
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    const first = shuffled[0];
    playlistContextRef.current = { list: shuffled, tagLabel, index: 0 };
    await load(first, tagLabel);
    const remaining = shuffled.slice(1).map((s) => ({ song: s, reason: tagLabel }));
    setQueue(remaining);
    setQueuePos(-1);
  }, [load]);

  const removeFromQueue = useCallback((index) => {
    setQueue((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setQueuePos(-1);
  }, []);

  const advance = useCallback(async (isSkip) => {
    if (!isSkip && repeatModeRef.current === 'one' && currentSongRef.current) {
      if (Platform.OS === 'web') {
        setWebPos(0);
        setWebPlaying(true);
      } else {
        await TrackPlayer.seekTo(0);
        await TrackPlayer.play();
      }
      return;
    }
    if (isSkip && currentSongRef.current) {
      if (Platform.OS !== 'web') {
        const pos = await TrackPlayer.getPosition().catch(() => 0);
        const dur = currentSongRef.current.duration || (await TrackPlayer.getDuration().catch(() => 0));
        if (dur && pos / dur < 0.5) recordSkip(currentSongRef.current.id);
      }
    }

    // 1. Playlist / Tag Mode: Strictly loop and play within this playlist
    if (playlistContextRef.current) {
      const { list, tagLabel, index } = playlistContextRef.current;
      let nextIdx = index + 1;
      if (nextIdx >= list.length) {
        if (repeatModeRef.current === 'off' && !isSkip) return;
        nextIdx = 0;
      }
      playlistContextRef.current.index = nextIdx;
      const nextSong = list[nextIdx];
      if (nextSong) {
        await load(nextSong, tagLabel);
        const after = list.slice(nextIdx + 1).map((s) => ({ song: s, reason: tagLabel }));
        const before = list.slice(0, nextIdx).map((s) => ({ song: s, reason: tagLabel }));
        setQueue([...after, ...before]);
        setQueuePos(-1);
        return;
      }
    }

    // 2. Library Smart / Sequential Mode
    extendQueueIfLow();
    let q = queueRef.current;
    let pos = queuePosRef.current + 1;
    if (pos >= q.length) {
      if (repeatMode === 'off') return;
      rebuildQueueAfter(q.length ? q[q.length - 1].song : currentSongRef.current);
      const built = smartModeRef.current
        ? generateQueue(songs, currentSongRef.current, recentPlayedIds.current, 14)
        : sequentialQueue(songs, currentSongRef.current, 14);
      q = built; pos = 0;
      setQueue(built);
    }
    const next = q[pos];
    if (!next) return;
    setQueuePos(pos);
    await load(next.song, next.reason);
  }, [extendQueueIfLow, load, rebuildQueueAfter, repeatMode, songs]);

  const goPrev = useCallback(async () => {
    if (Platform.OS === 'web') {
      if (webPos > 3) { setWebPos(0); return; }
    } else {
      const pos = await TrackPlayer.getPosition().catch(() => 0);
      if (pos > 3) { await TrackPlayer.seekTo(0); return; }
    }

    // Playlist Mode: Go to previous song in playlist
    if (playlistContextRef.current) {
      const { list, tagLabel, index } = playlistContextRef.current;
      let prevIdx = index - 1;
      if (prevIdx < 0) prevIdx = list.length - 1;
      playlistContextRef.current.index = prevIdx;
      const prevSong = list[prevIdx];
      if (prevSong) {
        await load(prevSong, tagLabel);
        const after = list.slice(prevIdx + 1).map((s) => ({ song: s, reason: tagLabel }));
        const before = list.slice(0, prevIdx).map((s) => ({ song: s, reason: tagLabel }));
        setQueue([...after, ...before]);
        setQueuePos(-1);
        return;
      }
    }

    const q = queueRef.current, qp = queuePosRef.current;
    if (qp > 0) {
      const prevItem = q[qp - 1];
      setQueuePos(qp - 1);
      await load(prevItem.song, prevItem.reason);
    } else {
      if (Platform.OS === 'web') setWebPos(0); else await TrackPlayer.seekTo(0);
    }
  }, [load, webPos]);

  const togglePlay = useCallback(async () => {
    if (!currentSongRef.current) return;
    if (Platform.OS === 'web') {
      setWebPlaying((p) => !p);
      return;
    }
    const state = await TrackPlayer.getState();
    if (state === State.Playing) await TrackPlayer.pause(); else await TrackPlayer.play();
  }, []);

  const toggleSmart = useCallback(() => {
    setSmartMode((prev) => {
      const next = !prev;
      setSetting('smart', next);
      if (currentSongRef.current) {
        const built = next
          ? generateQueue(songs, currentSongRef.current, recentPlayedIds.current, 14)
          : sequentialQueue(songs, currentSongRef.current, 14);
        setQueue(built);
        setQueuePos(-1);
      }
      return next;
    });
  }, [songs]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      const next = prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off';
      setSetting('repeat', next);
      return next;
    });
  }, []);

  // Wire OS lock-screen next/prev and queue ended handlers to our dynamic queue logic.
  useEffect(() => {
    global.offsongsOnRemoteNext = () => advance(true);
    global.offsongsOnRemotePrev = () => goPrev();
    global.offsongsOnPlaybackQueueEnded = () => {
      if (repeatModeRef.current === 'one') {
        if (Platform.OS === 'web') {
          setWebPos(0);
        } else {
          TrackPlayer.seekTo(0).then(() => TrackPlayer.play()).catch(() => {});
        }
      } else {
        advance(false);
      }
    };
    return () => {
      global.offsongsOnRemoteNext = null;
      global.offsongsOnRemotePrev = null;
      global.offsongsOnPlaybackQueueEnded = null;
    };
  }, [advance, goPrev]);

  const setVolume = useCallback(async (val) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (Platform.OS !== 'web') {
      try {
        await TrackPlayer.setVolume(clamped);
      } catch (e) {}
    }
  }, []);

  return {
    currentSong, currentReason, queue, queuePos, isPlaying,
    position: currentPosition, duration: currentDuration,
    smartMode, repeatMode, volume, setVolume,
    playFromLibrary, playList, shuffleList, removeFromQueue, clearQueue,
    advance, goPrev, togglePlay, toggleSmart, cycleRepeat,
    seekTo: (sec) => {
      if (Platform.OS === 'web') {
        setWebPos(sec);
      } else {
        TrackPlayer.seekTo(sec);
      }
    },
  };
}
