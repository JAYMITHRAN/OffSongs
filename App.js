import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, StatusBar, SafeAreaView, TouchableOpacity, Text } from 'react-native';

import LibraryScreen from './src/screens/LibraryScreen';
import NowPlayingScreen from './src/screens/NowPlayingScreen';
import MiniPlayer from './src/components/MiniPlayer';
import { colors } from './src/theme';
import { loadDB } from './src/store';
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
      await setupTrackPlayerOnce();
      setDbReady(true);
    })();
  }, []);

  const player = usePlayer(songs);

  const scanLibrary = useCallback(async () => {
    setLoading(true);
    setScanProgress(0);
    try {
      const found = await requestPermissionAndScan((count) => setScanProgress(count));
      setSongs(found);
      // Enrich ID3 tags lazily in the background, batched, so scrolling the
      // library isn't blocked on file I/O (per PRD performance section).
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
          <TouchableOpacity style={styles.navBtn} onPress={() => setActiveTab('songs')}>
            <Text style={[styles.navIcon, activeTab !== 'favorites' && activeTab !== 'playlists' && { color: colors.copper }]}>♫</Text>
            <Text style={[styles.navTxt, activeTab !== 'favorites' && activeTab !== 'playlists' && { color: colors.copper }]}>Library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => setActiveTab('favorites')}>
            <Text style={[styles.navIcon, activeTab === 'favorites' && { color: colors.copper }]}>♥</Text>
            <Text style={[styles.navTxt, activeTab === 'favorites' && { color: colors.copper }]}>Favorites</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => setActiveTab('playlists')}>
            <Text style={[styles.navIcon, activeTab === 'playlists' && { color: colors.copper }]}>☰</Text>
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
    setSongs((prev) => prev.map((s) => {
      const updated = batch.find((b) => b.id === s.id);
      return updated ? { ...updated } : s;
    }));
    // yield to the JS thread between batches
    await new Promise((r) => setTimeout(r, 0));
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  bottomNav: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 64,
    borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: 'rgba(16,12,14,0.92)',
    flexDirection: 'row',
  },
  navBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navTxt: { color: colors.textFaint, fontSize: 10, fontWeight: '600' },
  navIcon: { color: colors.textFaint, fontSize: 18, marginBottom: 2 },
});
