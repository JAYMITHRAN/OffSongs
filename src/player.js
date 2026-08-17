import { useState, useRef, useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import TrackPlayer, {
  Capability, Event, State, useProgress, usePlaybackState,
  useTrackPlayerEvents,
} from 'react-native-track-player';
import { generateQueue, sequentialQueue } from './engine';
import {
  statsFor, recordPlayStart, recordListeningEvent, recordSkip, getDB, setSetting,
} from './store';

const TRACK_EVENTS = [Event.PlaybackActiveTrackChanged, Event.PlaybackQueueEnded];

let playerSetupDone = false;
export async function setupTrackPlayerOnce() {
  if (playerSetupDone) return;
  await TrackPlayer.setupPlayer({});
  await TrackPlayer.updateOptions({
    capabilities: [
      Capability.Play, Capability.Pause, Capability.SkipToNext,
      Capability.SkipToPrevious, Capability.SeekTo, Capability.Stop,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
  });
  playerSetupDone = true;
}

function toTrack(song) {
  return {
    id: song.id,
    url: song.uri,
    title: song.title,
    artist: song.artist,
    album: song.album,
    artwork: song.artworkUrl || undefined,
    duration: song.duration || undefined,
  };
}

// Central playback + dynamic-queue hook, mirroring the web app's player logic
// 1:1 but backed by the real native audio engine + OS transport controls.
export function usePlayer(songs) {
  const [currentSong, setCurrentSong] = useState(null);
  const [currentReason, setCurrentReason] = useState(null);
  const [queue, setQueue] = useState([]); // [{song, reason}]
  const [queuePos, setQueuePos] = useState(-1);
  const [smartMode, setSmartMode] = useState(getDB().settings.smart !== false);
  const [repeatMode, setRepeatMode] = useState(getDB().settings.repeat || 'all');
  const [appState, setAppState] = useState(AppState.currentState);

  const recentPlayedIds = useRef([]);
  const playStartedAt = useRef(0);
  const countedThisPlay = useRef(false);
  const currentSongRef = useRef(null);
  const queueRef = useRef([]);
  const queuePosRef = useRef(-1);
  const smartModeRef = useRef(smartMode);
  const loadTokenRef = useRef(0);

  currentSongRef.current = currentSong;
  queueRef.current = queue;
  queuePosRef.current = queuePos;
  smartModeRef.current = smartMode;

  // Battery Saver: Reduce JS bridge progress polling interval when in background
  // allowing phone CPU to sleep while native DSP plays audio.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setAppState(next));
    return () => sub.remove();
  }, []);

  const progress = useProgress(appState === 'active' ? 250 : 2000);
  const playbackState = usePlaybackState();
  const isPlaying = playbackState.state === State.Playing;

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
    const token = ++loadTokenRef.current;
    await finalizePrevious();
    if (token !== loadTokenRef.current) return;

    try {
      await TrackPlayer.reset();
      if (token !== loadTokenRef.current) return;
      await TrackPlayer.add(toTrack(song));
      if (token !== loadTokenRef.current) return;
      await TrackPlayer.play();

      setCurrentSong(song);
      setCurrentReason(reason || null);
      playStartedAt.current = Date.now();
      countedThisPlay.current = false;
      recentPlayedIds.current.push(song.id);
      if (recentPlayedIds.current.length > 20) recentPlayedIds.current.shift();
    } catch (e) {
      console.warn('OffSongs: playback error', e);
    }
  }, [finalizePrevious]);

  const playFromLibrary = useCallback(async (song) => {
    await load(song, null);
    rebuildQueueAfter(song);
  }, [load, rebuildQueueAfter]);

  const playList = useCallback(async (list, startIndex = 0) => {
    if (!list || list.length === 0) return;
    const startSong = list[startIndex] || list[0];
    await load(startSong, 'Playing selection');
    const remaining = list.slice(startIndex + 1).map((s) => ({ song: s, reason: 'Next in list' }));
    setQueue(remaining);
    setQueuePos(-1);
  }, [load]);

  const shuffleList = useCallback(async (list) => {
    if (!list || list.length === 0) return;
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    const first = shuffled[0];
    await load(first, 'Shuffle');
    const remaining = shuffled.slice(1).map((s) => ({ song: s, reason: 'Shuffle' }));
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
    if (isSkip && currentSongRef.current) {
      const pos = await TrackPlayer.getPosition().catch(() => 0);
      const dur = currentSongRef.current.duration || (await TrackPlayer.getDuration().catch(() => 0));
      if (dur && pos / dur < 0.5) recordSkip(currentSongRef.current.id);
    }
    extendQueueIfLow();
    let q = queueRef.current;
    let pos = queuePosRef.current + 1;
    if (pos >= q.length) {
      if (repeatMode === 'off') return;
      rebuildQueueAfter(q.length ? q[q.length - 1].song : currentSongRef.current);
      // rebuildQueueAfter is async-via-state; re-read after microtask tick isn't reliable,
      // so also compute a fresh queue synchronously for this immediate advance:
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
    const pos = await TrackPlayer.getPosition().catch(() => 0);
    if (pos > 3) { await TrackPlayer.seekTo(0); return; }
    const q = queueRef.current, qp = queuePosRef.current;
    if (qp > 0) {
      const prevItem = q[qp - 1];
      setQueuePos(qp - 1);
      await load(prevItem.song, prevItem.reason);
    } else {
      await TrackPlayer.seekTo(0);
    }
  }, [load]);

  const togglePlay = useCallback(async () => {
    if (!currentSongRef.current) return;
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

  // Wire OS lock-screen next/prev buttons to our dynamic queue logic.
  useEffect(() => {
    global.offsongsOnRemoteNext = () => advance(true);
    global.offsongsOnRemotePrev = () => goPrev();
    return () => { global.offsongsOnRemoteNext = null; global.offsongsOnRemotePrev = null; };
  }, [advance, goPrev]);

  useTrackPlayerEvents(TRACK_EVENTS, async (event) => {
    if (event.type === Event.PlaybackQueueEnded) {
      if (currentSongRef.current) {
        recordListeningEvent({
          songId: currentSongRef.current.id,
          startedAt: playStartedAt.current,
          secondsPlayed: currentSongRef.current.duration || 0,
          durationSeconds: currentSongRef.current.duration || 0,
        });
      }
      if (repeatMode === 'one') {
        await TrackPlayer.seekTo(0);
        await TrackPlayer.play();
      } else {
        advance(false);
      }
    }
  });

  // Count a "play" after 3s of real listening (matches web app's threshold).
  useEffect(() => {
    if (!countedThisPlay.current && progress.position > 3 && currentSong) {
      countedThisPlay.current = true;
      recordPlayStart(currentSong.id);
    }
  }, [progress.position, currentSong]);

  return {
    currentSong, currentReason, queue, queuePos, isPlaying,
    position: progress.position, duration: progress.duration || (currentSong && currentSong.duration) || 0,
    smartMode, repeatMode,
    playFromLibrary, playList, shuffleList, removeFromQueue, clearQueue,
    advance, goPrev, togglePlay, toggleSmart, cycleRepeat,
    seekTo: (sec) => TrackPlayer.seekTo(sec),
  };
}
