import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ArtThumb from './ArtThumb';
import { colors } from '../theme';

export default function MiniPlayer({ song, isPlaying, progressFrac, onOpen, onPrev, onPlayPause, onNext }) {
  if (!song) return null;
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onOpen} style={styles.wrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(100, progressFrac * 100)}%` }]} />
      </View>
      <ArtThumb song={song} size={40} radius={10} />
      <View style={styles.meta}>
        <Text numberOfLines={1} style={styles.title}>{song.title}</Text>
        <Text numberOfLines={1} style={styles.sub}>{song.artist}</Text>
      </View>
      <View style={styles.ctrls}>
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onPrev} style={styles.btn}>
          <Ionicons name="play-skip-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onPlayPause} style={styles.playBtn}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#161213" />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onNext} style={styles.btn}>
          <Ionicons name="play-skip-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 10, right: 10, bottom: 76,
    backgroundColor: colors.bgElevated2, borderRadius: 16, borderWidth: 1, borderColor: colors.line,
    paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 11,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  progressTrack: { position: 'absolute', left: 10, right: 10, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.copper },
  meta: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 13, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 11 },
  ctrls: { flexDirection: 'row', alignItems: 'center' },
  btn: { padding: 6 },
  playBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
});
