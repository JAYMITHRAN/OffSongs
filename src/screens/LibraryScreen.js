import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ArtThumb from '../components/ArtThumb';
import SongRow from '../components/SongRow';
import SongInfoSheet from '../components/SongInfoSheet';
import { colors } from '../theme';
import {
  statsFor, toggleFavorite, getDB, createPlaylist, deletePlaylist, removeSongFromPlaylist,
} from '../store';
import { searchGlobalOnline } from '../onlineStream';
import { downloadSongForOffline, isSongDownloaded } from '../downloader';

const TABS = [
  { key: 'songs', label: 'Songs', icon: 'musical-notes' },
  { key: 'folders', label: 'Folders', icon: 'folder' },
  { key: 'artists', label: 'Artists', icon: 'person' },
  { key: 'albums', label: 'Albums', icon: 'disc' },
  { key: 'playlists', label: 'Playlists', icon: 'albums' },
  { key: 'favorites', label: 'Favorites', icon: 'heart' },
];

export default function LibraryScreen({
  songs, loading, scanProgress, onScan, currentSong, isPlaying, onPlaySong,
  activeTab, onTabChange, player,
}) {
  const tab = activeTab || 'songs';
  const setTab = onTabChange || (() => {});
  const [searchMode, setSearchMode] = useState('library'); // 'library' | 'online'
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState(null);
  const [infoSong, setInfoSong] = useState(null);
  const [newPlModalVisible, setNewPlModalVisible] = useState(false);
  const [newPlName, setNewPlName] = useState('');
  const [, force] = useState(0);

  // Online Search State
  const [onlineResults, setOnlineResults] = useState([]);
  const [onlineSearching, setOnlineSearching] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState({});
  const [downloadedIds, setDownloadedIds] = useState({});
  const searchTimerRef = useRef(null);

  // Short audio (<30s) filter
  const cleanSongs = useMemo(() => {
    return songs.filter((s) => !s.duration || s.duration >= 30);
  }, [songs]);

  const filtered = useMemo(() => {
    let list = cleanSongs;
    if (groupFilter) {
      if (groupFilter.customList) {
        list = groupFilter.customList;
      } else {
        list = list.filter((s) => s[groupFilter.field] === groupFilter.value);
      }
    }
    const q = query.trim().toLowerCase();
    if (q && searchMode === 'library') {
      list = list.filter((s) =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.artist || '').toLowerCase().includes(q) ||
        (s.album || '').toLowerCase().includes(q) ||
        (s.folder || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) =>
      (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [cleanSongs, query, groupFilter, searchMode]);

  const grouped = useCallback((field) => {
    const groups = {};
    cleanSongs.forEach((s) => {
      let key = s[field];
      if (!key || key === 'Unknown') {
        key = field === 'artist' ? 'Unknown Artist' : field === 'album' ? 'Unknown Album' : 'Music';
      }
      (groups[key] = groups[key] || []).push(s);
    });
    return Object.entries(groups).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [cleanSongs]);

  // Debounced Online Music Search
  useEffect(() => {
    if (searchMode !== 'online') return;
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setOnlineResults([]);
      setOnlineSearching(false);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setOnlineSearching(true);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchGlobalOnline(trimmed);
        setOnlineResults(results);

        // Check download status for all found items
        const downloadedMap = {};
        for (const item of results) {
          const isDl = await isSongDownloaded(item.id);
          if (isDl) downloadedMap[item.id] = true;
        }
        setDownloadedIds(downloadedMap);
      } catch (err) {
        setOnlineResults([]);
      } finally {
        setOnlineSearching(false);
      }
    }, 450);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, searchMode]);

  function handleToggleFav(id) {
    toggleFavorite(id);
    force((n) => n + 1);
  }

  function handlePlayAll(listToPlay) {
    if (player && player.playList) {
      player.playList(listToPlay || (searchMode === 'online' ? onlineResults : filtered));
    } else if (filtered.length > 0) {
      onPlaySong(filtered[0]);
    }
  }

  function handleShuffleAll(listToShuffle) {
    if (player && player.shuffleList) {
      player.shuffleList(listToShuffle || (searchMode === 'online' ? onlineResults : filtered));
    } else if (filtered.length > 0) {
      onPlaySong(filtered[0]);
    }
  }

  // 1-Tap Offline Download Handler
  async function handleDownload(onlineSong) {
    if (downloadingIds[onlineSong.id] || downloadedIds[onlineSong.id]) return;

    setDownloadingIds((prev) => ({ ...prev, [onlineSong.id]: true }));
    try {
      await downloadSongForOffline(onlineSong);
      setDownloadedIds((prev) => ({ ...prev, [onlineSong.id]: true }));
      force((n) => n + 1);
    } catch (err) {
      Alert.alert('Download Failed', 'Could not save song for offline. Please check internet connection.');
    } finally {
      setDownloadingIds((prev) => ({ ...prev, [onlineSong.id]: false }));
    }
  }

  function handleCreateCustomPlaylist() {
    const trimmed = newPlName.trim();
    if (!trimmed) return;
    createPlaylist(trimmed);
    setNewPlName('');
    setNewPlModalVisible(false);
    force((n) => n + 1);
  }

  // Open Smart Auto-Playlists
  function openSmartPlaylist(type) {
    if (type === 'recent') {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recent = cleanSongs
        .filter((s) => s.addedAt >= thirtyDaysAgo)
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      setGroupFilter({ title: 'Recently Added', customList: recent.length > 0 ? recent : cleanSongs.slice(0, 30) });
    } else if (type === 'most_played') {
      const mostPlayed = [...cleanSongs]
        .filter((s) => (statsFor(s.id).playCount || 0) > 0)
        .sort((a, b) => (statsFor(b.id).playCount || 0) - (statsFor(a.id).playCount || 0))
        .slice(0, 30);
      setGroupFilter({ title: 'Most Played', customList: mostPlayed });
    } else if (type === 'history') {
      const histIds = getDB().history.map((h) => h.songId).reverse();
      const histSongs = [];
      const seen = new Set();
      for (const hid of histIds) {
        if (!seen.has(hid)) {
          seen.add(hid);
          const found = cleanSongs.find((s) => s.id === hid);
          if (found) histSongs.push(found);
        }
      }
      setGroupFilter({ title: 'Listening History', customList: histSongs });
    }
  }

  if (songs.length === 0 && searchMode === 'library') {
    return (
      <View style={styles.fill}>
        <Header onScan={onScan} />
        <View style={styles.empty}>
          {loading ? (
            <>
              <ActivityIndicator color={colors.copper} size="large" />
              <Text style={styles.emptyScan}>Scanning your device… {scanProgress ? `${scanProgress} songs found` : ''}</Text>
            </>
          ) : (
            <>
              <Ionicons name="musical-notes-outline" size={54} color={colors.copper} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyTitle}>Your library is empty</Text>
              <Text style={styles.emptyBody}>
                Connect your device's music folder — OffSongs reads it directly through
                the system media library, entirely offline.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={onScan} activeOpacity={0.85}>
                <Ionicons name="folder-open-outline" size={19} color="#1a0f08" />
                <Text style={styles.primaryBtnTxt}>Connect music library</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exploreBtn}
                onPress={() => setSearchMode('online')}
                activeOpacity={0.85}
              >
                <Ionicons name="globe-outline" size={19} color={colors.teal} />
                <Text style={styles.exploreBtnTxt}>Explore Online Music (Free & Ad-Free)</Text>
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

      {/* Dual Search Mode Toggle Switch: Library vs Explore Online */}
      <View style={styles.modeToggleRow}>
        <TouchableOpacity
          style={[styles.modeToggleBtn, searchMode === 'library' && styles.modeToggleActive]}
          onPress={() => { setSearchMode('library'); setQuery(''); }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="musical-notes"
            size={15}
            color={searchMode === 'library' ? '#161213' : colors.textDim}
          />
          <Text style={[styles.modeToggleTxt, searchMode === 'library' && styles.modeToggleTxtActive]}>
            My Library
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeToggleBtn, searchMode === 'online' && styles.modeToggleActiveOnline]}
          onPress={() => { setSearchMode('online'); setQuery(''); }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="globe-outline"
            size={15}
            color={searchMode === 'online' ? '#161213' : colors.teal}
          />
          <Text style={[styles.modeToggleTxt, searchMode === 'online' && styles.modeToggleTxtActive]}>
            Explore Online (320k)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons
            name={searchMode === 'online' ? 'globe-outline' : 'search-outline'}
            size={18}
            color={searchMode === 'online' ? colors.teal : colors.textFaint}
            style={{ marginLeft: 12, marginRight: 8 }}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={
              searchMode === 'online'
                ? 'Search any song, artist, movie, or lyrics…'
                : 'Search songs, artists, albums, folders…'
            }
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {onlineSearching && (
            <ActivityIndicator size="small" color={colors.teal} style={{ marginRight: 8 }} />
          )}
          {query.length > 0 && !onlineSearching && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingRight: 12 }}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category Tabs (shown in Library mode) */}
      {searchMode === 'library' && (
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
                style={[styles.tab, tab === item.key && !groupFilter && styles.tabActive]}
              >
                <Text style={[styles.tabTxt, tab === item.key && !groupFilter && styles.tabTxtActive]}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Drill-down Back Navigation */}
      {groupFilter && searchMode === 'library' && (
        <View style={styles.drillNavRow}>
          <TouchableOpacity onPress={() => setGroupFilter(null)} style={styles.backRow} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color={colors.copper} />
            <Text numberOfLines={1} style={styles.backTxt}>{groupFilter.title || groupFilter.value}</Text>
          </TouchableOpacity>
          {groupFilter.playlistId && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert('Delete Playlist', `Delete "${groupFilter.title}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      deletePlaylist(groupFilter.playlistId);
                      setGroupFilter(null);
                      force((n) => n + 1);
                    },
                  },
                ]);
              }}
              style={styles.deletePlBtn}
            >
              <Ionicons name="trash-outline" size={16} color={colors.rose} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Hero Action Bar: Play All & Shuffle */}
      {searchMode === 'library' && (tab === 'songs' || tab === 'favorites' || groupFilter) && filtered.length > 0 && (
        <View style={styles.heroActionsRow}>
          <TouchableOpacity style={styles.playAllBtn} onPress={() => handlePlayAll(filtered)} activeOpacity={0.85}>
            <Ionicons name="play" size={17} color="#161213" />
            <Text style={styles.playAllTxt}>Play All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shuffleBtn} onPress={() => handleShuffleAll(filtered)} activeOpacity={0.85}>
            <Ionicons name="shuffle" size={18} color={colors.text} />
            <Text style={styles.shuffleTxt}>Shuffle</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ONLINE STREAMING SEARCH RESULTS VIEW */}
      {searchMode === 'online' && (
        <OnlineSearchResults
          results={onlineResults}
          query={query}
          loading={onlineSearching}
          currentSong={currentSong}
          isPlaying={isPlaying}
          downloadingIds={downloadingIds}
          downloadedIds={downloadedIds}
          onPlaySong={onPlaySong}
          onDownload={handleDownload}
          onShowInfo={setInfoSong}
        />
      )}

      {/* LIBRARY VIEWS */}
      {searchMode === 'library' && tab === 'songs' && !groupFilter && (
        <SongList
          songs={filtered}
          currentSong={currentSong}
          isPlaying={isPlaying}
          onPlaySong={onPlaySong}
          onToggleFav={handleToggleFav}
          onShowInfo={setInfoSong}
          label="All songs"
        />
      )}

      {searchMode === 'library' && groupFilter && (
        <SongList
          songs={filtered}
          currentSong={currentSong}
          isPlaying={isPlaying}
          onPlaySong={onPlaySong}
          onToggleFav={handleToggleFav}
          onShowInfo={setInfoSong}
          label={groupFilter.title || groupFilter.value}
          playlistId={groupFilter.playlistId}
          onRemoveFromPlaylist={(songId) => {
            removeSongFromPlaylist(groupFilter.playlistId, songId);
            const updated = (groupFilter.customList || []).filter((s) => s.id !== songId);
            setGroupFilter({ ...groupFilter, customList: updated });
            force((n) => n + 1);
          }}
        />
      )}

      {searchMode === 'library' && tab === 'folders' && !groupFilter && (
        <GroupList type="folder" groups={grouped('folder')} onSelect={(value) => setGroupFilter({ field: 'folder', value, title: `📁 ${value}` })} />
      )}

      {searchMode === 'library' && tab === 'artists' && !groupFilter && (
        <GroupList type="artist" groups={grouped('artist')} onSelect={(value) => setGroupFilter({ field: 'artist', value, title: `👤 ${value}` })} />
      )}

      {searchMode === 'library' && tab === 'albums' && !groupFilter && (
        <GroupList type="album" groups={grouped('album')} onSelect={(value) => setGroupFilter({ field: 'album', value, title: `💿 ${value}` })} />
      )}

      {searchMode === 'library' && tab === 'favorites' && !groupFilter && (
        <SongList
          songs={filtered.filter((s) => statsFor(s.id).favorite)}
          currentSong={currentSong}
          isPlaying={isPlaying}
          onPlaySong={onPlaySong}
          onToggleFav={handleToggleFav}
          onShowInfo={setInfoSong}
          label="Favorites"
          emptyMsg="Tap the heart on any song to save it here."
        />
      )}

      {searchMode === 'library' && tab === 'playlists' && !groupFilter && (
        <PlaylistsTab
          cleanSongs={cleanSongs}
          onOpenSmart={openSmartPlaylist}
          onOpenPlaylist={(p) => {
            const list = p.songIds.map((id) => cleanSongs.find((s) => s.id === id)).filter(Boolean);
            setGroupFilter({ title: p.name, playlistId: p.id, customList: list });
          }}
          onCreateNew={() => setNewPlModalVisible(true)}
        />
      )}

      {/* Song Details Modal Sheet */}
      <SongInfoSheet visible={!!infoSong} song={infoSong} onClose={() => setInfoSong(null)} />

      {/* Create Playlist Modal */}
      <Modal visible={newPlModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Create New Playlist</Text>
            <TextInput
              value={newPlName}
              onChangeText={setNewPlName}
              placeholder="e.g. Chill Beats, Workout, Road Trip"
              placeholderTextColor={colors.textFaint}
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setNewPlModalVisible(false); setNewPlName(''); }} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateCustomPlaylist} style={styles.modalCreateBtn}>
                <Text style={styles.modalCreateTxt}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Header({ onScan }) {
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>Off<Text style={{ color: colors.copper }}>Songs</Text></Text>
      <TouchableOpacity onPress={onScan} style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="refresh-outline" size={19} color={colors.textDim} />
      </TouchableOpacity>
    </View>
  );
}

function OnlineSearchResults({
  results, query, loading, currentSong, isPlaying, downloadingIds, downloadedIds,
  onPlaySong, onDownload, onShowInfo,
}) {
  if (loading && results.length === 0) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator size="large" color={colors.teal} />
        <Text style={styles.emptyBody}>Searching ad-free global music…</Text>
      </View>
    );
  }

  if (!query || query.length < 2) {
    return (
      <View style={styles.empty}>
        <Ionicons name="globe-outline" size={48} color={colors.teal} style={{ marginBottom: 8 }} />
        <Text style={styles.emptyTitle}>Explore Any Song in the World</Text>
        <Text style={styles.emptyBody}>
          Type any song name, movie, singer, or lyric lines. Stream in high-definition (320kbps) with 0 ads, and save directly to your phone for offline playback with 1 tap.
        </Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No songs found</Text>
        <Text style={styles.emptyBody}>Try searching by movie name, artist, or a different lyric phrase.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={results}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
      ListHeaderComponent={<Text style={styles.sectionLabel}>GLOBAL SEARCH RESULTS · {results.length}</Text>}
      getItemLayout={(data, index) => ({ length: 62, offset: 62 * index, index })}
      renderItem={({ item }) => (
        <SongRow
          song={item}
          isCurrent={currentSong && currentSong.id === item.id}
          isPlaying={isPlaying}
          isFavorite={statsFor(item.id).favorite}
          isDownloading={!!downloadingIds[item.id]}
          isDownloaded={!!downloadedIds[item.id]}
          onPress={() => onPlaySong(item)}
          onLongPress={() => onShowInfo(item)}
          onMenuPress={() => onShowInfo(item)}
          onToggleFavorite={() => toggleFavorite(item.id)}
          onDownload={() => onDownload(item)}
        />
      )}
      initialNumToRender={15}
      maxToRenderPerBatch={15}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

function SongList({
  songs, currentSong, isPlaying, onPlaySong, onToggleFav, onShowInfo, label, emptyMsg,
  playlistId, onRemoveFromPlaylist,
}) {
  if (songs.length === 0) {
    return <View style={styles.empty}><Text style={styles.emptyBody}>{emptyMsg || 'No songs found.'}</Text></View>;
  }
  return (
    <FlatList
      data={songs}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
      ListHeaderComponent={<Text style={styles.sectionLabel}>{label} · {songs.length}</Text>}
      getItemLayout={(data, index) => ({ length: 62, offset: 62 * index, index })}
      renderItem={({ item }) => (
        <SongRow
          song={item}
          isCurrent={currentSong && currentSong.id === item.id}
          isPlaying={isPlaying}
          isFavorite={statsFor(item.id).favorite}
          onPress={() => onPlaySong(item)}
          onLongPress={() => onShowInfo(item)}
          onMenuPress={() => onShowInfo(item)}
          onToggleFavorite={() => onToggleFav(item.id)}
        />
      )}
      initialNumToRender={15}
      maxToRenderPerBatch={15}
      windowSize={7}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews
    />
  );
}

function GroupList({ type = 'artist', groups, onSelect }) {
  if (groups.length === 0) return <View style={styles.empty}><Text style={styles.emptyBody}>No groups found.</Text></View>;
  
  const iconName = type === 'artist' ? 'person' : type === 'album' ? 'disc' : 'folder';

  return (
    <FlatList
      data={groups}
      keyExtractor={([key]) => key}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
      ListHeaderComponent={<Text style={styles.sectionLabel}>{groups.length} {type === 'artist' ? 'artists' : type === 'album' ? 'albums' : 'folders'}</Text>}
      renderItem={({ item: [key, list] }) => (
        <TouchableOpacity style={styles.groupRow} onPress={() => onSelect(key)} activeOpacity={0.7}>
          <View style={styles.groupIcon}>
            <Ionicons name={iconName} size={20} color={colors.copper} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.groupTitle}>{key}</Text>
            <Text style={styles.groupSub}>{list.length} song{list.length !== 1 ? 's' : ''}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </TouchableOpacity>
      )}
    />
  );
}

function PlaylistsTab({ cleanSongs, onOpenSmart, onOpenPlaylist, onCreateNew }) {
  const playlists = getDB().playlists;

  return (
    <FlatList
      data={playlists}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130, paddingTop: 6 }}
      ListHeaderComponent={
        <>
          {/* Smart Auto-Playlists Section */}
          <Text style={styles.sectionLabel}>SMART PLAYLISTS</Text>
          <View style={styles.smartGrid}>
            <TouchableOpacity style={styles.smartCard} onPress={() => onOpenSmart('recent')} activeOpacity={0.8}>
              <View style={[styles.smartIconWrap, { backgroundColor: 'rgba(232,147,92,0.18)' }]}>
                <Ionicons name="time" size={22} color={colors.copper} />
              </View>
              <Text style={styles.smartTitle}>Recently Added</Text>
              <Text style={styles.smartSub}>Last 30 days</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.smartCard} onPress={() => onOpenSmart('most_played')} activeOpacity={0.8}>
              <View style={[styles.smartIconWrap, { backgroundColor: 'rgba(255,111,145,0.18)' }]}>
                <Ionicons name="flame" size={22} color={colors.rose} />
              </View>
              <Text style={styles.smartTitle}>Most Played</Text>
              <Text style={styles.smartSub}>Top 25 favorites</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.smartCard} onPress={() => onOpenSmart('history')} activeOpacity={0.8}>
              <View style={[styles.smartIconWrap, { backgroundColor: 'rgba(79,200,184,0.18)' }]}>
                <Ionicons name="receipt-outline" size={22} color={colors.teal} />
              </View>
              <Text style={styles.smartTitle}>History</Text>
              <Text style={styles.smartSub}>Recent listening</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.customPlHeaderRow}>
            <Text style={styles.sectionLabel}>MY PLAYLISTS ({playlists.length})</Text>
            <TouchableOpacity style={styles.newPlAction} onPress={onCreateNew} activeOpacity={0.8}>
              <Ionicons name="add-circle" size={18} color={colors.copper} />
              <Text style={styles.newPlActionTxt}>New Playlist</Text>
            </TouchableOpacity>
          </View>
        </>
      }
      ListEmptyComponent={
        <View style={styles.emptyCustom}>
          <Text style={styles.emptyBody}>No custom playlists yet. Tap "+ New Playlist" to create one.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.plCard} onPress={() => onOpenPlaylist(item)} activeOpacity={0.7}>
          <View style={styles.plCover}>
            <Ionicons name="musical-notes" size={22} color="#1a0f08" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupTitle}>{item.name}</Text>
            <Text style={styles.groupSub}>{item.songIds.length} song{item.songIds.length !== 1 ? 's' : ''}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 6 },
  brand: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  headerBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  modeToggleRow: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4, gap: 10 },
  modeToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 100, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated },
  modeToggleActive: { backgroundColor: colors.copper, borderColor: colors.copper },
  modeToggleActiveOnline: { backgroundColor: colors.teal, borderColor: colors.teal },
  modeToggleTxt: { color: colors.textDim, fontSize: 12.5, fontWeight: '700' },
  modeToggleTxtActive: { color: '#161213' },
  searchWrap: { paddingHorizontal: 20, paddingVertical: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 100 },
  searchInput: { flex: 1, paddingVertical: 10, color: colors.text, fontSize: 14.5 },
  tabsRow: { paddingVertical: 4 },
  tab: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1, borderColor: colors.line },
  tabActive: { backgroundColor: colors.text, borderColor: colors.text },
  tabTxt: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  tabTxtActive: { color: '#161213' },
  drillNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  backTxt: { color: colors.copper, fontWeight: '700', fontSize: 15 },
  deletePlBtn: { padding: 6, backgroundColor: 'rgba(255,111,145,0.12)', borderRadius: 8 },
  heroActionsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 8 },
  playAllBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.copper, paddingVertical: 11, borderRadius: 100 },
  playAllTxt: { color: '#161213', fontWeight: '700', fontSize: 14 },
  shuffleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, paddingVertical: 11, borderRadius: 100 },
  shuffleTxt: { color: colors.text, fontWeight: '600', fontSize: 14 },
  sectionLabel: { color: colors.textFaint, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700', marginTop: 12, marginBottom: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 100, gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  emptyBody: { color: colors.textDim, fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
  emptyScan: { color: colors.textDim, fontSize: 13, marginTop: 10 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.copper, paddingVertical: 13, paddingHorizontal: 24, borderRadius: 100, marginTop: 10 },
  primaryBtnTxt: { color: '#1a0f08', fontWeight: '700', fontSize: 14 },
  exploreBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(79,200,184,0.15)', borderWidth: 1, borderColor: colors.teal, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 100, marginTop: 10 },
  exploreBtnTxt: { color: colors.teal, fontWeight: '700', fontSize: 13.5 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  groupIcon: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  groupSub: { color: colors.textDim, fontSize: 12 },
  smartGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  smartCard: { flex: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12 },
  smartIconWrap: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  smartTitle: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  smartSub: { color: colors.textFaint, fontSize: 10.5, marginTop: 2 },
  customPlHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 6 },
  newPlAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  newPlActionTxt: { color: colors.copper, fontSize: 13, fontWeight: '600' },
  emptyCustom: { paddingVertical: 20, alignItems: 'center' },
  plCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, marginBottom: 8 },
  plCover: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { width: '100%', backgroundColor: colors.bgElevated2, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 22 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalInput: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, color: colors.text, fontSize: 15, marginBottom: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelTxt: { color: colors.textDim, fontWeight: '600', fontSize: 14 },
  modalCreateBtn: { backgroundColor: colors.copper, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 100 },
  modalCreateTxt: { color: '#161213', fontWeight: '700', fontSize: 14 },
});
