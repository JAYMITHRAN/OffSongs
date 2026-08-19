import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Sheet from './Sheet';
import ArtThumb from './ArtThumb';
import { colors, fmtTime } from '../theme';
import { statsFor, toggleFavorite } from '../store';

export default function SongInfoSheet({ visible, song, onClose, onAddToPlaylist, onPlaySong }) {
  if (!song) return null;

  const st = statsFor(song.id);
  const ext = (song.uri || '').split('.').pop()?.toUpperCase() || (song.isOnline ? 'STREAM' : 'AUDIO');
  const durationStr = fmtTime(song.duration);
  const dateStr = song.addedAt ? new Date(song.addedAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  }) : 'Unknown';

  return (
    <Sheet visible={visible} title="Song Options & Info" onClose={onClose}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.headerCard}>
          <ArtThumb song={song} size={64} radius={14} fontSize={28} />
          <View style={styles.headerMeta}>
            <Text numberOfLines={2} style={styles.title}>{song.title}</Text>
            <Text numberOfLines={1} style={styles.artist}>{song.artist}</Text>
            <Text numberOfLines={1} style={styles.album}>{song.album || 'Unknown Album'}</Text>
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.actionGrid}>
          {onPlaySong && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => { onClose(); onPlaySong(song); }}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={20} color="#161213" />
              <Text style={styles.actionCardTxtPlay}>Play Now</Text>
            </TouchableOpacity>
          )}

          {onAddToPlaylist && (
            <TouchableOpacity
              style={styles.actionCardSecondary}
              onPress={() => { onClose(); onAddToPlaylist(song); }}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.copper} />
              <Text style={styles.actionCardTxt}>Add to Playlist</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>AUDIO & FILE INFORMATION</Text>
          
          <InfoRow icon="musical-notes-outline" label="Audio Format" value={ext} />
          <InfoRow icon="time-outline" label="Duration" value={durationStr} />
          <InfoRow icon="folder-outline" label="Folder" value={song.folder || (song.isOnline ? 'Online Cloud' : 'Music')} />
          <InfoRow icon="pricetag-outline" label="Genre" value={song.genre || 'Unspecified'} />
          <InfoRow icon="calendar-outline" label="Date Added" value={dateStr} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>LISTENING STATS</Text>
          
          <InfoRow icon="play-outline" label="Plays" value={`${st.playCount || 0} times`} />
          <InfoRow icon="checkmark-done-outline" label="Completions" value={`${st.completionCount || 0} times`} />
          <InfoRow icon="play-skip-forward-outline" label="Skips" value={`${st.skipCount || 0} times`} />
          <InfoRow icon="heart-outline" label="Favorite" value={st.favorite ? 'Yes (In Favorites)' : 'No'} />
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.closeBtnTxt}>Close</Text>
        </TouchableOpacity>
      </ScrollView>
    </Sheet>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={17} color={colors.copper} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text numberOfLines={1} style={styles.val}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 20 },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 14,
  },
  headerMeta: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  artist: { color: colors.copper, fontSize: 13, fontWeight: '600', marginTop: 2 },
  album: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  actionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.copper,
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionCardTxtPlay: {
    color: '#161213',
    fontWeight: '700',
    fontSize: 13.5,
  },
  actionCardSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionCardTxt: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13.5,
  },
  section: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  sectionHeader: {
    color: colors.textFaint,
    fontSize: 10.5,
    letterSpacing: 1.2,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  iconWrap: { width: 26 },
  label: { color: colors.textDim, fontSize: 13, flex: 1 },
  val: { color: colors.text, fontSize: 13, fontWeight: '600', maxWidth: '50%' },
  closeBtn: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 100,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  closeBtnTxt: { color: colors.text, fontWeight: '600', fontSize: 14 },
});
