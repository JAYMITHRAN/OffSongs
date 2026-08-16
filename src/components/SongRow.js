import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import ArtThumb from './ArtThumb';
import { colors, fmtTime } from '../theme';

function SongRow({ song, isCurrent, isPlaying, isFavorite, onPress, onToggleFavorite }) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress}>
      <ArtThumb song={song} size={46} radius={10} />
      <View style={styles.meta}>
        <Text numberOfLines={1} style={[styles.title, isCurrent && { color: colors.copper }]}>{song.title}</Text>
        <Text numberOfLines={1} style={styles.sub}>
          {song.artist}{song.album && song.album !== 'Unknown Album' ? ` · ${song.album}` : ''}
        </Text>
      </View>
      {isCurrent && isPlaying ? (
        <Text style={{ color: colors.copper, fontSize: 11, fontWeight: '700' }}>PLAYING</Text>
      ) : (
        <Text style={styles.dur}>{song.duration ? fmtTime(song.duration) : ''}</Text>
      )}
      <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onToggleFavorite} style={styles.heart}>
        <Text style={{ color: isFavorite ? colors.rose : colors.textFaint, fontSize: 16 }}>{isFavorite ? '♥' : '♡'}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default React.memo(SongRow, (prev, next) =>
  prev.song.id === next.song.id &&
  prev.song.title === next.song.title &&
  prev.song.artist === next.song.artist &&
  prev.song.artworkUrl === next.song.artworkUrl &&
  prev.isCurrent === next.isCurrent &&
  prev.isPlaying === next.isPlaying &&
  prev.isFavorite === next.isFavorite
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 4 },
  meta: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  dur: { color: colors.textFaint, fontSize: 11, fontVariant: ['tabular-nums'] },
  heart: { padding: 4 },
});
