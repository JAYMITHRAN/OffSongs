import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, StatusBar, SafeAreaView, TouchableOpacity, Text, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import LibraryScreen from './src/screens/LibraryScreen';
import NowPlayingScreen from './src/screens/NowPlayingScreen';
import MiniPlayer from './src/components/MiniPlayer';
import { colors } from './src/theme';
import { loadDB, loadLibraryCache, saveLibraryCache } from './src/store';
import { setupTrackPlayerOnce, usePlayer } from './src/player';
import { requestPermissionAndScan, enrichSongWithTags } from './src/library';

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('songs');

  useEffect(() => {
    (async () => {
      await loadDB();
      const cached = await loadLibraryCache();
      if (cached && cached.length > 0) {
        setSongs(cached);
      }
      await setupTrackPlayerOnce();
      setDbReady(true);
    })();
  }, []);

  // Android Hardware Back Button: smoothly collapses NowPlaying modal before exiting
  useEffect(() => {
    const onBackPress = () => {
      if (nowPlayingOpen) {
        setNowPlayingOpen(false);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [nowPlayingOpen]);

  const player = usePlayer(songs);

  const scanLibrary = useCallback(async () => {
    setLoading(true);
    setScanProgress(0);
    try {
      const found = await requestPermissionAndScan((count) => setScanProgress(count));
      setSongs(found);
      await saveLibraryCache(found);
      enrichInBackground(found, setSongs);
    } catch (e) {
      console.warn('OffSongs: scan failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  function handlePlaySong(song) {
    player.playFromLibrary(song);
    setNowPlayingOpen(true);
  }

  if (!dbReady) return <View style={styles.fill} />;

  const isLibraryTab = activeTab !== 'favorites' && activeTab !== 'playlists';

  return (
    <SafeAreaView style={styles.fill}>
      <StatusBar barStyle="light-content" />
      <View style={styles.fill}>
        <LibraryScreen
          songs={songs}
          loading={loading}
          scanProgress={scanProgress}
          onScan={scanLibrary}
          currentSong={player.currentSong}
          isPlaying={player.isPlaying}
          onPlaySong={handlePlaySong}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          player={player}
        />

        <MiniPlayer
          song={player.currentSong}
          isPlaying={player.isPlaying}
          progressFrac={player.duration ? player.position / player.duration : 0}
          onOpen={() => setNowPlayingOpen(true)}
          onPrev={player.goPrev}
          onPlayPause={player.togglePlay}
          onNext={() => player.advance(true)}
        />

        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setActiveTab('songs')} activeOpacity={0.7}>
            <Ionicons
              name={isLibraryTab ? 'musical-notes' : 'musical-notes-outline'}
              size={20}
              color={isLibraryTab ? colors.copper : colors.textFaint}
              style={{ marginBottom: 3 }}
            />
            <Text style={[styles.navTxt, isLibraryTab && { color: colors.copper }]}>Library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => setActiveTab('favorites')} activeOpacity={0.7}>
            <Ionicons
              name={activeTab === 'favorites' ? 'heart' : 'heart-outline'}
              size={20}
              color={activeTab === 'favorites' ? colors.copper : colors.textFaint}
              style={{ marginBottom: 3 }}
            />
            <Text style={[styles.navTxt, activeTab === 'favorites' && { color: colors.copper }]}>Favorites</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => setActiveTab('playlists')} activeOpacity={0.7}>
            <Ionicons
              name={activeTab === 'playlists' ? 'albums' : 'albums-outline'}
              size={20}
              color={activeTab === 'playlists' ? colors.copper : colors.textFaint}
              style={{ marginBottom: 3 }}
            />
            <Text style={[styles.navTxt, activeTab === 'playlists' && { color: colors.copper }]}>Playlists</Text>
          </TouchableOpacity>
        </View>

        {nowPlayingOpen && player.currentSong && (
          <View style={StyleSheet.absoluteFill}>
            <NowPlayingScreen player={player} onClose={() => setNowPlayingOpen(false)} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// Reads ID3 tags a handful of songs at a time so a 5,000-track library
// doesn't stall on I/O all at once.
async function enrichInBackground(initialSongs, setSongs) {
  const BATCH = 8;
  let songs = initialSongs;
  for (let i = 0; i < songs.length; i += BATCH) {
    const batch = songs.slice(i, i + BATCH);
    await Promise.all(batch.map((s) => enrichSongWithTags(s)));
    setSongs((prev) => {
      const updated = prev.map((s) => {
        const match = batch.find((b) => b.id === s.id);
        return match ? { ...match } : s;
      });
      if (i + BATCH >= songs.length || i % (BATCH * 4) === 0) {
        saveLibraryCache(updated);
      }
      return updated;
    });
    // yield to the JS thread between batches
    await new Promise((r) => setTimeout(r, 0));
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  bottomNav: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 64,
    borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: 'rgba(16,12,14,0.95)',
    flexDirection: 'row',
  },
  navBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navTxt: { color: colors.textFaint, fontSize: 10, fontWeight: '600' },
});
