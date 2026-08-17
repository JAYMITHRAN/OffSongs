import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import ArtThumb from '../components/ArtThumb';
import SeekBar from '../components/SeekBar';
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
  const [scrubPosition, setScrubPosition] = useState(null);
  const [, forceRerender] = useState(0);

  if (!currentSong) return null;
  const st = statsFor(currentSong.id);
  const [c1, c2] = gradientFor(currentSong.id);
  const progressFrac = duration ? position / duration : 0;
  const upcoming = queue.slice(queuePos + 1, queuePos + 1 + 25);

  function onFavorite() {
    toggleFavoriteStore(currentSong.id);
    forceRerender((n) => n + 1);
  }

  const currentDisplayTime = scrubPosition !== null ? scrubPosition : position;

  return (
    <View style={styles.fill}>
      {/* Blurred artwork background */}
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
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-down" size={22} color={colors.textDim} />
          </TouchableOpacity>
          <Text style={styles.topLabel}>NOW PLAYING</Text>
          <TouchableOpacity onPress={() => setQueueOpen(true)} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="list" size={20} color={colors.textDim} />
          </TouchableOpacity>
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

        {/* Smooth Line & Dot Seek Scrubber */}
        <SeekBar
          progressFrac={progressFrac}
          accentColor={colors.copper}
          onScrubbing={(frac) => setScrubPosition(frac * (duration || 0))}
          onSeek={(frac) => {
            seekTo(frac * (duration || 0));
            setScrubPosition(null);
          }}
        />

        <View style={styles.timesRow}>
          <Text style={styles.timeTxt}>{fmtTime(currentDisplayTime)}</Text>
          <Text style={styles.timeTxt}>{fmtTime(duration)}</Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={toggleSmart} style={styles.sideBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons
              name="shuffle"
              size={22}
              color={smartMode ? colors.copper : colors.textDim}
            />
          </TouchableOpacity>
          <View style={styles.mainCtrls}>
            <TouchableOpacity onPress={goPrev} style={styles.mainBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="play-skip-back" size={26} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={togglePlay} style={styles.playBtn} activeOpacity={0.85}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#161213" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => advance(true)} style={styles.mainBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="play-skip-forward" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={cycleRepeat} style={styles.sideBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons
              name={repeatMode === 'one' ? 'repeat-outline' : 'repeat'}
              size={22}
              color={repeatMode !== 'off' ? colors.copper : colors.textDim}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomRow}>
          <TouchableOpacity onPress={onFavorite} style={[styles.pill, st.favorite && { borderColor: colors.rose }]}>
            <Ionicons
              name={st.favorite ? 'heart' : 'heart-outline'}
              size={18}
              color={st.favorite ? colors.rose : colors.text}
            />
            <Text style={{ color: st.favorite ? colors.rose : colors.text, fontSize: 13, fontWeight: '600' }}>Favorite</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPlaylistOpen(true)} style={styles.pill}>
            <Ionicons name="add-circle-outline" size={18} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Add to playlist</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Sheet visible={queueOpen} title="Up next" onClose={() => setQueueOpen(false)}>
        <View style={styles.queueHeaderRow}>
          <Text style={styles.queueCountTxt}>{upcoming.length} upcoming tracks</Text>
          {upcoming.length > 0 && (
            <TouchableOpacity onPress={player.clearQueue} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearBtnTxt}>Clear Queue</Text>
            </TouchableOpacity>
          )}
        </View>
        {upcoming.length === 0 ? (
          <Text style={styles.emptyTxt}>Queue is empty — select songs or keep listening to generate more.</Text>
        ) : upcoming.map((q, i) => {
          const actualIndex = queuePos + 1 + i;
          return (
            <View key={q.song.id + '_' + i} style={styles.queueRow}>
              <Text style={styles.queueNum}>{i + 1}</Text>
              <ArtThumb song={q.song} size={40} radius={9} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.queueTitle}>{q.song.title}</Text>
                <Text numberOfLines={1} style={styles.queueSub}>{q.song.artist}</Text>
              </View>
              <View style={styles.chip}><Text style={styles.chipTxt}>{q.reason}</Text></View>
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => player.removeFromQueue(actualIndex)}
                style={{ padding: 4, marginLeft: 4 }}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
          );
        })}
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
            <View style={styles.plCover}>
              <Ionicons name="musical-notes" size={20} color="#1a0f08" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle}>{p.name}</Text>
              <Text style={styles.queueSub}>{p.songIds.length} song{p.songIds.length !== 1 ? 's' : ''}</Text>
            </View>
            <Ionicons
              name={has ? 'checkmark-circle' : 'add-circle-outline'}
              size={22}
              color={has ? colors.copper : colors.textFaint}
            />
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={styles.newPlBtn}
        onPress={() => {
          createPlaylist('New playlist ' + (playlists.length + 1));
          force((n) => n + 1);
          onChange();
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
  topLabel: { color: colors.textDim, fontSize: 10.5, letterSpacing: 1.5, fontWeight: '600' },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  artShadow: { shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 20 }, elevation: 20, borderRadius: 26 },
  meta: { marginBottom: 12 },
  title: { color: colors.text, fontSize: 23, fontWeight: '700' },
  artist: { color: colors.textDim, fontSize: 14.5, marginTop: 3 },
  reasonPill: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.line, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 100, marginTop: 10 },
  reasonTxt: { color: colors.copper, fontSize: 11, fontWeight: '700' },
  timesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, marginBottom: 14 },
  timeTxt: { color: colors.textFaint, fontSize: 11, fontVariant: ['tabular-nums'] },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sideBtn: { padding: 8 },
  mainCtrls: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  mainBtn: { padding: 6 },
  playBtn: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, gap: 10 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.line, paddingVertical: 11, borderRadius: 100 },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  queueNum: { color: colors.textFaint, fontSize: 11, width: 16 },
  queueTitle: { color: colors.text, fontSize: 13, fontWeight: '600' },
  queueSub: { color: colors.textDim, fontSize: 11 },
  chip: { backgroundColor: 'rgba(79,200,184,0.12)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 100 },
  chipTxt: { color: colors.teal, fontSize: 9.5, fontWeight: '700' },
  queueHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  queueCountTxt: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  clearBtn: { paddingVertical: 4, paddingHorizontal: 8, backgroundColor: 'rgba(255,111,145,0.12)', borderRadius: 6 },
  clearBtnTxt: { color: colors.rose, fontSize: 11, fontWeight: '700' },
  plCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, marginBottom: 8 },
  plCover: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  newPlBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 100, paddingVertical: 12, marginTop: 4 },
});
