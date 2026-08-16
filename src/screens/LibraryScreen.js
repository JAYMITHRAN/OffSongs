import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import ArtThumb from '../components/ArtThumb';
import SongRow from '../components/SongRow';
import { colors } from '../theme';
import { statsFor, toggleFavorite, getDB, createPlaylist } from '../store';

const TABS = [
  { key: 'songs', label: 'Songs' },
  { key: 'artists', label: 'Artists' },
  { key: 'albums', label: 'Albums' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'favorites', label: 'Favorites' },
];

export default function LibraryScreen({
  songs, loading, scanProgress, onScan, currentSong, isPlaying, onPlaySong,
  activeTab, onTabChange,
}) {
  const tab = activeTab || 'songs';
  const setTab = onTabChange || (() => {});
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState(null); // {field, value} when drilled into an artist/album
  const [, force] = useState(0);

  const filtered = useMemo(() => {
    let list = songs;
    if (groupFilter) list = list.filter((s) => s[groupFilter.field] === groupFilter.value);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      s.album.toLowerCase().includes(q));
  }, [songs, query, groupFilter]);

  const grouped = useCallback((field) => {
    const groups = {};
    filtered.forEach((s) => {
      const key = s[field] || 'Unknown';
      (groups[key] = groups[key] || []).push(s);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function handleToggleFav(id) { toggleFavorite(id); force((n) => n + 1); }

  if (songs.length === 0) {
    return (
      <View style={styles.fill}>
        <Header onScan={onScan} />
        <View style={styles.empty}>
          {loading ? (
            <>
              <ActivityIndicator color={colors.copper} />
              <Text style={styles.emptyScan}>Scanning your device… {scanProgress ? `${scanProgress} found` : ''}</Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyGlyph}>♪</Text>
              <Text style={styles.emptyTitle}>Your library is empty</Text>
              <Text style={styles.emptyBody}>
                Connect your device's music folder — OffSongs reads it directly through
                the system media library, entirely offline.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={onScan}>
                <Text style={styles.primaryBtnTxt}>+ Connect music library</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Header onScan={onScan} />
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search songs, artists, albums…"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
        />
      </View>
      <View style={styles.tabsRow}>
        <FlatList
          horizontal
          data={TABS}
          keyExtractor={(t) => t.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => { setTab(item.key); setGroupFilter(null); }}
              style={[styles.tab, tab === item.key && styles.tabActive]}
            >
              <Text style={[styles.tabTxt, tab === item.key && styles.tabTxtActive]}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {groupFilter && (
        <TouchableOpacity onPress={() => setGroupFilter(null)} style={styles.backRow}>
          <Text style={styles.backTxt}>‹ {groupFilter.value}</Text>
        </TouchableOpacity>
      )}

      {tab === 'songs' && !groupFilter && (
        <SongList songs={filtered} currentSong={currentSong} isPlaying={isPlaying} onPlaySong={onPlaySong} onToggleFav={handleToggleFav} label="All songs" />
      )}
      {groupFilter && (
        <SongList songs={filtered} currentSong={currentSong} isPlaying={isPlaying} onPlaySong={onPlaySong} onToggleFav={handleToggleFav} label={groupFilter.value} />
      )}
      {tab === 'favorites' && !groupFilter && (
        <SongList songs={filtered.filter((s) => statsFor(s.id).favorite)} currentSong={currentSong} isPlaying={isPlaying} onPlaySong={onPlaySong} onToggleFav={handleToggleFav} label="Favorites" emptyMsg="Tap the heart on any song to save it here." />
      )}
      {tab === 'artists' && !groupFilter && (
        <GroupList groups={grouped('artist')} onSelect={(value) => setGroupFilter({ field: 'artist', value })} />
      )}
      {tab === 'albums' && !groupFilter && (
        <GroupList groups={grouped('album')} onSelect={(value) => setGroupFilter({ field: 'album', value })} />
      )}
      {tab === 'playlists' && !groupFilter && <PlaylistsTab />}
    </View>
  );
}

function Header({ onScan }) {
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>Off<Text style={{ color: colors.copper }}>Songs</Text></Text>
      <TouchableOpacity onPress={onScan} style={styles.headerBtn}>
        <Text style={{ color: colors.textDim, fontSize: 16 }}>⟳</Text>
      </TouchableOpacity>
    </View>
  );
}

function SongList({ songs, currentSong, isPlaying, onPlaySong, onToggleFav, label, emptyMsg }) {
  if (songs.length === 0) {
    return <View style={styles.empty}><Text style={styles.emptyBody}>{emptyMsg || 'No results.'}</Text></View>;
  }
  return (
    <FlatList
      data={songs}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
      ListHeaderComponent={<Text style={styles.sectionLabel}>{label} · {songs.length}</Text>}
      renderItem={({ item }) => (
        <SongRow
          song={item}
          isCurrent={currentSong && currentSong.id === item.id}
          isPlaying={isPlaying}
          isFavorite={statsFor(item.id).favorite}
          onPress={() => onPlaySong(item)}
          onToggleFavorite={() => onToggleFav(item.id)}
        />
      )}
      initialNumToRender={20}
      maxToRenderPerBatch={30}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

function GroupList({ groups, onSelect }) {
  if (groups.length === 0) return <View style={styles.empty}><Text style={styles.emptyBody}>No results.</Text></View>;
  return (
    <FlatList
      data={groups}
      keyExtractor={([key]) => key}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
      ListHeaderComponent={<Text style={styles.sectionLabel}>{groups.length} groups</Text>}
      renderItem={({ item: [key, list] }) => (
        <TouchableOpacity style={styles.groupRow} onPress={() => onSelect(key)}>
          <View style={styles.groupIcon}><Text style={{ color: colors.copper }}>♫</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupTitle}>{key}</Text>
            <Text style={styles.groupSub}>{list.length} song{list.length !== 1 ? 's' : ''}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

function PlaylistsTab() {
  const [, force] = useState(0);
  const playlists = getDB().playlists;
  return (
    <View style={{ paddingHorizontal: 20, flex: 1 }}>
      <TouchableOpacity
        style={styles.ghostBtn}
        onPress={() => { createPlaylist('New playlist ' + (playlists.length + 1)); force((n) => n + 1); }}
      >
        <Text style={{ color: colors.text, fontWeight: '600' }}>+ New playlist</Text>
      </TouchableOpacity>
      {playlists.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyBody}>No playlists yet. Create one, then add songs from the Now Playing screen.</Text></View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 130, paddingTop: 8 }}
          renderItem={({ item }) => (
            <View style={styles.plCard}>
              <View style={styles.plCover}><Text style={{ color: '#1a0f08', fontWeight: '700' }}>♫</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupTitle}>{item.name}</Text>
                <Text style={styles.groupSub}>{item.songIds.length} song{item.songIds.length !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 6 },
  brand: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  headerBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 20, paddingVertical: 10 },
  searchInput: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 100, paddingVertical: 10, paddingHorizontal: 16, color: colors.text, fontSize: 14.5 },
  tabsRow: { paddingVertical: 6 },
  tab: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 100, borderWidth: 1, borderColor: colors.line },
  tabActive: { backgroundColor: colors.text, borderColor: colors.text },
  tabTxt: { color: colors.textDim, fontSize: 12.5, fontWeight: '600' },
  tabTxtActive: { color: '#161213' },
  backRow: { paddingHorizontal: 20, paddingVertical: 8 },
  backTxt: { color: colors.copper, fontWeight: '600', fontSize: 13.5 },
  sectionLabel: { color: colors.textFaint, fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', marginTop: 12, marginBottom: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 100, gap: 10 },
  emptyGlyph: { fontSize: 34, color: colors.textDim, marginBottom: 6 },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '700', marginBottom: 4 },
  emptyBody: { color: colors.textDim, fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
  emptyScan: { color: colors.textDim, fontSize: 13, marginTop: 10 },
  primaryBtn: { backgroundColor: colors.copper, paddingVertical: 13, paddingHorizontal: 24, borderRadius: 100, marginTop: 10 },
  primaryBtnTxt: { color: '#1a0f08', fontWeight: '700', fontSize: 14 },
  ghostBtn: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 100, paddingVertical: 11, alignItems: 'center', marginTop: 4, marginBottom: 4 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  groupIcon: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  groupSub: { color: colors.textDim, fontSize: 12 },
  plCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, marginBottom: 8 },
  plCover: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
});
