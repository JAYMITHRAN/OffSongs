import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ArtThumb from './ArtThumb';
import { colors, fmtTime } from '../theme';

function SongRow({ song, isCurrent, isPlaying, isFavorite, onPress, onLongPress, onToggleFavorite, onMenuPress }) {
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <ArtThumb song={song} size={46} radius={10} />
      <View style={styles.meta}>
        <Text numberOfLines={1} style={[styles.title, isCurrent && { color: colors.copper }]}>{song.title}</Text>
        <Text numberOfLines={1} style={styles.sub}>
          {song.artist}{song.album && song.album !== 'Unknown Album' ? ` · ${song.album}` : ''}
        </Text>
      </View>
      {isCurrent && isPlaying ? (
        <Text style={{ color: colors.copper, fontSize: 11, fontWeight: '700', marginRight: 4 }}>PLAYING</Text>
      ) : (
        <Text style={styles.dur}>{song.duration ? fmtTime(song.duration) : ''}</Text>
      )}
      <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={onToggleFavorite} style={styles.heart}>
        <Ionicons
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={18}
          color={isFavorite ? colors.rose : colors.textFaint}
        />
      </TouchableOpacity>
      {onMenuPress && (
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={onMenuPress} style={styles.menuBtn}>
          <Ionicons name="ellipsis-vertical" size={16} color={colors.textFaint} />
        </TouchableOpacity>
      )}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8, paddingHorizontal: 4 },
  meta: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  dur: { color: colors.textFaint, fontSize: 11, fontVariant: ['tabular-nums'] },
  heart: { padding: 4 },
  menuBtn: { padding: 4, marginLeft: 2 },
});
