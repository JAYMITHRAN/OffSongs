import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import ArtThumb from '../components/ArtThumb';
import Waveform from '../components/Waveform';
import Sheet from '../components/Sheet';
import { colors, fmtTime, gradientFor } from '../theme';
import { statsFor, toggleFavorite as toggleFavoriteStore, getDB, createPlaylist, toggleSongInPlaylist } from '../store';

const { width: SCREEN_W } = Dimensions.get('window');
const ART_SIZE = Math.min(SCREEN_W * 0.74, 300);

export default function NowPlayingScreen({ player, onClose }) {
  const {
    currentSong, currentReason, queue, queuePos, isPlaying, position, duration,
    smartMode, repeatMode, advance, goPrev, togglePlay, toggleSmart, cycleRepeat, seekTo,
  } = player;
  const [queueOpen, setQueueOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [, forceRerender] = useState(0);

  if (!currentSong) return null;
  const st = statsFor(currentSong.id);
  const [c1, c2] = gradientFor(currentSong.id);
  const progressFrac = duration ? position / duration : 0;
  const upcoming = queue.slice(queuePos + 1, queuePos + 1 + 25);

  function onFavorite() { toggleFavoriteStore(currentSong.id); forceRerender((n) => n + 1); }

  return (
    <View style={styles.fill}>
      {/* Blurred background */}
      <View style={StyleSheet.absoluteFill}>
        {currentSong.artworkUrl ? (
          <Image source={{ uri: currentSong.artworkUrl }} style={StyleSheet.absoluteFill} blurRadius={40} />
        ) : (
          <LinearGradient colors={[c1, c2]} style={StyleSheet.absoluteFill} />
        )}
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(12,9,10,0.35)', 'rgba(12,9,10,0.78)', '#0c090a']}
          locations={[0, 0.45, 0.9]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}><Text style={styles.iconTxt}>⌄</Text></TouchableOpacity>
          <Text style={styles.topLabel}>NOW PLAYING</Text>
          <TouchableOpacity onPress={() => setQueueOpen(true)} style={styles.iconBtn}><Text style={styles.iconTxt}>≡</Text></TouchableOpacity>
        </View>

        <View style={styles.artWrap}>
          <View style={styles.artShadow}>
            <ArtThumb song={currentSong} size={ART_SIZE} radius={26} fontSize={64} />
          </View>
        </View>

        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.title}>{currentSong.title}</Text>
          <Text numberOfLines={1} style={styles.artist}>{currentSong.artist}</Text>
          {currentReason ? (
            <View style={styles.reasonPill}><Text style={styles.reasonTxt}>✦ {currentReason}</Text></View>
          ) : null}
        </View>

        <Waveform songId={currentSong.id} progressFrac={progressFrac} onSeek={(f) => seekTo(f * (duration || 0))} />
        <View style={styles.timesRow}>
          <Text style={styles.timeTxt}>{fmtTime(position)}</Text>
          <Text style={styles.timeTxt}>{fmtTime(duration)}</Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={toggleSmart} style={styles.sideBtn}>
            <Text style={[styles.sideIcon, smartMode && { color: colors.copper }]}>⇄</Text>
          </TouchableOpacity>
          <View style={styles.mainCtrls}>
            <TouchableOpacity onPress={goPrev} style={styles.mainBtn}><Text style={styles.mainIcon}>⏮</Text></TouchableOpacity>
            <TouchableOpacity onPress={togglePlay} style={styles.playBtn}>
              <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => advance(true)} style={styles.mainBtn}><Text style={styles.mainIcon}>⏭</Text></TouchableOpacity>
          </View>
          <TouchableOpacity onPress={cycleRepeat} style={styles.sideBtn}>
            <Text style={[styles.sideIcon, repeatMode !== 'off' && { color: colors.copper }]}>
              {repeatMode === 'one' ? '¹⟲' : '⟲'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomRow}>
          <TouchableOpacity onPress={onFavorite} style={[styles.pill, st.favorite && { borderColor: colors.rose }]}>
            <Text style={{ color: st.favorite ? colors.rose : colors.text, fontSize: 13 }}>{st.favorite ? '♥' : '♡'} Favorite</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPlaylistOpen(true)} style={styles.pill}>
            <Text style={{ color: colors.text, fontSize: 13 }}>♫+ Add to playlist</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Sheet visible={queueOpen} title="Up next" onClose={() => setQueueOpen(false)}>
        {upcoming.length === 0 ? (
          <Text style={styles.emptyTxt}>Queue is building — keep listening.</Text>
        ) : upcoming.map((q, i) => (
          <View key={q.song.id + i} style={styles.queueRow}>
            <Text style={styles.queueNum}>{i + 1}</Text>
            <ArtThumb song={q.song} size={40} radius={9} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.queueTitle}>{q.song.title}</Text>
              <Text numberOfLines={1} style={styles.queueSub}>{q.song.artist}</Text>
            </View>
            <View style={styles.chip}><Text style={styles.chipTxt}>{q.reason}</Text></View>
          </View>
        ))}
      </Sheet>

      <Sheet visible={playlistOpen} title="Add to playlist" onClose={() => setPlaylistOpen(false)}>
        <PlaylistPicker songId={currentSong.id} onChange={() => forceRerender((n) => n + 1)} />
      </Sheet>
    </View>
  );
}

function PlaylistPicker({ songId, onChange }) {
  const [, force] = useState(0);
  const playlists = getDB().playlists;
  return (
    <View>
      {playlists.length === 0 ? (
        <Text style={styles.emptyTxt}>No playlists yet — create your first one below.</Text>
      ) : playlists.map((p) => {
        const has = p.songIds.includes(songId);
        return (
          <TouchableOpacity
            key={p.id}
            style={styles.plCard}
            onPress={() => { toggleSongInPlaylist(p.id, songId); force((n) => n + 1); onChange(); }}
          >
            <View style={styles.plCover}><Text style={{ color: '#1a0f08', fontWeight: '700' }}>♫</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle}>{p.name}</Text>
              <Text style={styles.queueSub}>{p.songIds.length} song{p.songIds.length !== 1 ? 's' : ''}</Text>
            </View>
            <Text style={{ color: has ? colors.copper : colors.textFaint, fontSize: 18 }}>{has ? '✓' : '+'}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={styles.newPlBtn}
        onPress={() => {
          // In production, replace with a proper text-input modal instead of a native prompt.
          createPlaylist('New playlist ' + (playlists.length + 1));
          force((n) => n + 1); onChange();
        }}
      >
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13.5 }}>+ New playlist</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0c090a' },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 26 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  iconTxt: { color: colors.textDim, fontSize: 18 },
  topLabel: { color: colors.textDim, fontSize: 10.5, letterSpacing: 1.5, fontWeight: '600' },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  artShadow: { shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 20 }, elevation: 20, borderRadius: 26 },
  meta: { marginBottom: 6 },
  title: { color: colors.text, fontSize: 23, fontWeight: '700' },
  artist: { color: colors.textDim, fontSize: 14.5, marginTop: 3 },
  reasonPill: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.line, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 100, marginTop: 10 },
  reasonTxt: { color: colors.copper, fontSize: 11, fontWeight: '700' },
  timesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: 14 },
  timeTxt: { color: colors.textFaint, fontSize: 11 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sideBtn: { padding: 8 },
  sideIcon: { color: colors.textDim, fontSize: 20 },
  mainCtrls: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  mainBtn: { padding: 6 },
  mainIcon: { color: colors.text, fontSize: 24 },
  playBtn: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  playIcon: { fontSize: 26, color: '#161213' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, gap: 10 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.line, paddingVertical: 11, borderRadius: 100 },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  queueNum: { color: colors.textFaint, fontSize: 11, width: 16 },
  queueTitle: { color: colors.text, fontSize: 13, fontWeight: '600' },
  queueSub: { color: colors.textDim, fontSize: 11 },
  chip: { backgroundColor: 'rgba(79,200,184,0.12)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 100 },
  chipTxt: { color: colors.teal, fontSize: 9.5, fontWeight: '700' },
  emptyTxt: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 20 },
  plCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, marginBottom: 8 },
  plCover: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  newPlBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 100, paddingVertical: 12, marginTop: 4 },
});
