import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, StatusBar, SafeAreaView, TouchableOpacity, Text, BackHandler, ToastAndroid, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import LibraryScreen from './src/screens/LibraryScreen';
import NowPlayingScreen from './src/screens/NowPlayingScreen';
import MiniPlayer from './src/components/MiniPlayer';
import { colors } from './src/theme';
import { loadDB, loadLibraryCache, saveLibraryCache, subscribe } from './src/store';
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
        // Enrich any songs that haven't had HD art or metadata resolved
        const needsEnrich = cached.some((s) => !s._tagsLoaded || !s.artworkUrl || s.artist === 'Unknown Artist');
        if (needsEnrich) {
          enrichInBackground(cached, setSongs);
        }
      } else {
        // First run / no cache: auto-scan music library seamlessly
        try {
          const found = await requestPermissionAndScan((count) => setScanProgress(count));
          if (found && found.length > 0) {
            setSongs(found);
            await saveLibraryCache(found);
            enrichInBackground(found, setSongs);
          }
        } catch (e) {
          // If permissions not granted yet, user can click "Connect music library"
        }
      }
      await setupTrackPlayerOnce();
      setDbReady(true);
    })();

    const unsub = subscribe(async () => {
      const cached = await loadLibraryCache();
      if (cached && cached.length > 0) {
        setSongs((prev) => {
          if (prev.length !== cached.length) return cached;
          return prev;
        });
      }
    });
    return () => unsub();
  }, []);

  // Android Hardware Back Button: smoothly collapses NowPlaying, navigates to Songs tab, or double-press to exit
  const lastBackRef = useRef(0);
  useEffect(() => {
    const onBackPress = () => {
      if (nowPlayingOpen) {
        setNowPlayingOpen(false);
        return true;
      }
      if (activeTab !== 'songs') {
        setActiveTab('songs');
        return true;
      }
      const now = Date.now();
      if (now - lastBackRef.current < 2000) {
        BackHandler.exitApp();
        return true;
      }
      lastBackRef.current = now;
      if (Platform.OS === 'android') {
        ToastAndroid.show('Press back again to exit OffSongs', ToastAndroid.SHORT);
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [nowPlayingOpen, activeTab]);

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

  const handlePlaySong = useCallback((song) => {
    player.playFromLibrary(song);
  }, [player]);

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

// Reads ID3 tags and online HD metadata in the background smoothly
// with yield intervals so the UI stays 100% 60fps lag-free.
async function enrichInBackground(initialSongs, setSongs) {
  const BATCH = 3;
  let songs = [...initialSongs];

  for (let i = 0; i < songs.length; i += BATCH) {
    const batch = songs.slice(i, i + BATCH);
    await Promise.all(batch.map((s) => enrichSongWithTags(s)));

    // Update state & disk cache every 9 songs or on last batch
    if (i + BATCH >= songs.length || (i > 0 && i % 9 === 0)) {
      setSongs((prev) => {
        const updated = prev.map((s) => {
          const match = songs.find((b) => b.id === s.id && b._tagsLoaded);
          return match ? { ...match } : s;
        });
        saveLibraryCache(updated);
        return updated;
      });
    }

    // Yield to the React Native JS event loop for 50ms so UI is 100% smooth
    await new Promise((r) => setTimeout(r, 50));
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
