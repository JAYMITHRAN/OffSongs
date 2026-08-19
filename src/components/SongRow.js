import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ArtThumb from './ArtThumb';
import { colors, fmtTime } from '../theme';

function SongRow({
  song, isCurrent, isPlaying, isFavorite, isDownloading, isDownloaded,
  onPress, onLongPress, onToggleFavorite, onMenuPress, onDownload, showSearchBadges,
}) {
  const isLocalOrDownloaded = !song.isOnline || isDownloaded;

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={[styles.title, isCurrent && { color: colors.copper }, { flexShrink: 1 }]}>
            {song.title}
          </Text>
          {showSearchBadges && isLocalOrDownloaded && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeTxt}>OFFLINE</Text>
            </View>
          )}
          {showSearchBadges && song.isOnline && !isDownloaded && (
            <View style={styles.onlineBadge}>
              <Text style={styles.onlineBadgeTxt}>
                {song.source === 'saavn' ? '320K' : 'WEB'}
              </Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={styles.sub}>
          {song.artist}{song.album && song.album !== 'Unknown Album' && song.album !== 'Single' ? ` · ${song.album}` : ''}
        </Text>
      </View>

      {isCurrent && isPlaying ? (
        <Text style={{ color: colors.copper, fontSize: 11, fontWeight: '700', marginRight: 4 }}>PLAYING</Text>
      ) : (
        <Text style={styles.dur}>{song.duration ? fmtTime(song.duration) : ''}</Text>
      )}

      {/* Online Download Button (only shown for online songs that are not yet downloaded) */}
      {song.isOnline && !isDownloaded && onDownload && (
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={onDownload}
          style={styles.actionBtn}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <ActivityIndicator size="small" color={colors.teal} />
          ) : (
            <Ionicons
              name="cloud-download-outline"
              size={19}
              color={colors.copper}
            />
          )}
        </TouchableOpacity>
      )}

      {/* Downloaded checkmark badge if searching */}
      {showSearchBadges && song.isOnline && isDownloaded && (
        <View style={styles.actionBtn}>
          <Ionicons name="checkmark-circle" size={18} color={colors.teal} />
        </View>
      )}

      {/* Favorite Button */}
      {onToggleFavorite && (
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={onToggleFavorite} style={styles.actionBtn}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={18}
            color={isFavorite ? colors.rose : colors.textFaint}
          />
        </TouchableOpacity>
      )}

      {/* 3-Dots Options Menu */}
      {onMenuPress && (
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={onMenuPress} style={styles.actionBtn}>
          <Ionicons name="ellipsis-vertical" size={16} color={colors.textFaint} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default React.memo(SongRow);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8, paddingHorizontal: 4, height: 62 },
  meta: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  dur: { color: colors.textFaint, fontSize: 11, fontVariant: ['tabular-nums'], marginRight: 2 },
  offlineBadge: { backgroundColor: 'rgba(79,200,184,0.18)', borderWidth: 1, borderColor: colors.teal, paddingVertical: 1, paddingHorizontal: 5, borderRadius: 4 },
  offlineBadgeTxt: { color: colors.teal, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.5 },
  onlineBadge: { backgroundColor: 'rgba(232,147,92,0.18)', borderWidth: 1, borderColor: colors.copper, paddingVertical: 1, paddingHorizontal: 5, borderRadius: 4 },
  onlineBadgeTxt: { color: colors.copper, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.5 },
  actionBtn: { padding: 4 },
});
