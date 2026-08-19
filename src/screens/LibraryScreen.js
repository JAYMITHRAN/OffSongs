import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ArtThumb from '../components/ArtThumb';
import SongRow from '../components/SongRow';
import SongInfoSheet from '../components/SongInfoSheet';
import Sheet from '../components/Sheet';
import { colors } from '../theme';
import {
  statsFor, toggleFavorite, getDB, createPlaylist, deletePlaylist, removeSongFromPlaylist,
  toggleSongInPlaylist, subscribe,
} from '../store';
import { searchGlobalOnline } from '../onlineStream';
import { downloadSongForOffline, isSongDownloaded } from '../downloader';
import { isJunkOrRingtone, matchesSong } from '../library';

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
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState(null);
  const [infoSong, setInfoSong] = useState(null);
  const [pickerSong, setPickerSong] = useState(null);
  const [newPlModalVisible, setNewPlModalVisible] = useState(false);
  const [newPlName, setNewPlName] = useState('');
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [addSongsToPlModal, setAddSongsToPlModal] = useState(false);
  const [addSongsQuery, setAddSongsQuery] = useState('');
  const [, force] = useState(0);

  // Android Hardware Back Navigation inside LibraryScreen
  useEffect(() => {
    const onBackPress = () => {
      if (infoSong) { setInfoSong(null); return true; }
      if (pickerSong) { setPickerSong(null); setIsCreatingInline(false); return true; }
      if (addSongsToPlModal) { setAddSongsToPlModal(false); setAddSongsQuery(''); return true; }
      if (newPlModalVisible) { setNewPlModalVisible(false); setNewPlName(''); return true; }
      if (query.trim().length > 0) { setQuery(''); return true; }
      if (groupFilter) { setGroupFilter(null); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [infoSong, pickerSong, addSongsToPlModal, newPlModalVisible, query, groupFilter]);

  // Subscribe to store updates (playlists, favorites, stats)
  useEffect(() => {
    const unsub = subscribe(() => force((n) => n + 1));
    return () => unsub();
  }, []);

  // Clear group drilldown when tab changes
  useEffect(() => {
    setGroupFilter(null);
  }, [activeTab]);

  // Online Search State
  const [onlineResults, setOnlineResults] = useState([]);
  const [onlineSearching, setOnlineSearching] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState({});
  const [downloadedIds, setDownloadedIds] = useState({});
  const searchTimerRef = useRef(null);

  // Short audio & junk audio filter (<30s, ringtones, alarms, WhatsApp audio)
  const cleanSongs = useMemo(() => {
    return songs.filter((s) => !isJunkOrRingtone(s.title || s.filename, s.uri, s.duration));
  }, [songs]);

  // Universal Song Registry: unites local scanned songs + registered online songs
  const allSongsMap = useMemo(() => {
    const map = new Map();
    cleanSongs.forEach((s) => map.set(s.id, s));
    const onlineMap = getDB().onlineSongs || {};
    Object.keys(onlineMap).forEach((id) => {
      if (!map.has(id)) {
        map.set(id, onlineMap[id]);
      }
    });
    return map;
  }, [cleanSongs]);

  // Local & Hybrid filtered songs with smart fuzzy matching
  const filtered = useMemo(() => {
    let list = cleanSongs;
    if (groupFilter) {
      if (groupFilter.playlistId) {
        const pl = getDB().playlists.find((p) => p.id === groupFilter.playlistId);
        const plSongIds = pl ? pl.songIds : [];
        list = plSongIds.map((id) => allSongsMap.get(id)).filter(Boolean);
      } else if (groupFilter.customList) {
        list = groupFilter.customList;
      } else {
        list = list.filter((s) => s[groupFilter.field] === groupFilter.value);
      }
    }
    const q = query.trim();
    if (q) {
      list = list.filter((s) => matchesSong(s, q));
    }
    return [...list].sort((a, b) =>
      (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [cleanSongs, query, groupFilter, allSongsMap]);

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

  // Unified Search: debounced global online music search
  useEffect(() => {
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
    }, 400);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  const handlePlayFromList = useCallback((song, index, list, label) => {
    if (player && player.playList && list && list.length > 0) {
      player.playList(list, index !== undefined ? index : 0, label || groupFilter?.title || (tab === 'favorites' ? 'Favorites' : 'Library'));
    } else {
      onPlaySong(song);
    }
  }, [player, groupFilter, tab, onPlaySong]);

  function handleToggleFav(id) {
    toggleFavorite(id);
    force((n) => n + 1);
  }

  function handlePlayAll(listToPlay) {
    const target = listToPlay || filtered;
    if (target && target.length > 0) {
      if (player && player.playList) {
        player.playList(target, 0, groupFilter?.title || (tab === 'favorites' ? 'Favorites' : 'Library'));
      } else {
        onPlaySong(target[0]);
      }
    }
  }

  function handleShuffleAll(listToShuffle) {
    const target = listToShuffle || filtered;
    if (target && target.length > 0) {
      if (player && player.shuffleList) {
        player.shuffleList(target, groupFilter?.title || (tab === 'favorites' ? 'Favorites' : 'Library'));
      } else {
        onPlaySong(target[0]);
      }
    }
  }

  // 1-Tap Offline Download Handler
  async function handleDownload(onlineSong) {
    if (downloadingIds[onlineSong.id] || downloadedIds[onlineSong.id]) return;

    setDownloadingIds((prev) => ({ ...prev, [onlineSong.id]: true }));
    try {
      const res = await downloadSongForOffline(onlineSong);
      if (res && res.success) {
        setDownloadedIds((prev) => ({ ...prev, [onlineSong.id]: true }));
        Alert.alert('Saved Offline', `"${onlineSong.title}" is downloaded and ready for offline play.`);
      }
      force((n) => n + 1);
    } catch (err) {
      console.warn('OffSongs: download error', err);
      Alert.alert('Download Error', (err && err.message) ? err.message : 'Could not save song for offline.');
    } finally {
      setDownloadingIds((prev) => ({ ...prev, [onlineSong.id]: false }));
    }
  }

  function handleCreateCustomPlaylist() {
    const trimmed = newPlName.trim();
    if (!trimmed) return;
    const created = createPlaylist(trimmed);
    if (pickerSong) {
      toggleSongInPlaylist(created.id, pickerSong.id);
    }
    setNewPlName('');
    setIsCreatingInline(false);
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

  const isSearching = query.trim().length > 0;

  if (songs.length === 0 && !isSearching) {
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
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Header onScan={onScan} />

      {/* Unified Spotify-Style Search Input Bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons
            name="search-outline"
            size={18}
            color={colors.textFaint}
            style={{ marginLeft: 14, marginRight: 8 }}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search songs, artists, albums, or lyrics…"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {onlineSearching && (
            <ActivityIndicator size="small" color={colors.teal} style={{ marginRight: 8 }} />
          )}
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingRight: 14 }}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* UNIFIED SEARCH RESULTS VIEW (When searching) */}
      {isSearching ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
          {/* Local Device Matches */}
          {filtered.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.sectionLabel}>MATCHES IN YOUR DEVICE · {filtered.length}</Text>
              {filtered.map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  isCurrent={currentSong && currentSong.id === song.id}
                  isPlaying={isPlaying}
                  isFavorite={statsFor(song.id).favorite}
                  showSearchBadges={true}
                  onPress={() => handlePlayFromList(song, idx, filtered, 'Search: Local')}
                  onLongPress={() => setInfoSong(song)}
                  onMenuPress={() => setInfoSong(song)}
                  onToggleFavorite={() => handleToggleFav(song.id)}
                />
              ))}
            </View>
          )}

          {/* Global Online Catalog Matches */}
          {onlineResults.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.sectionLabel}>GLOBAL ONLINE MUSIC (320K) · {onlineResults.length}</Text>
              {onlineResults.map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  isCurrent={currentSong && currentSong.id === song.id}
                  isPlaying={isPlaying}
                  isFavorite={statsFor(song.id).favorite}
                  isDownloading={!!downloadingIds[song.id]}
                  isDownloaded={!!downloadedIds[song.id]}
                  showSearchBadges={true}
                  onPress={() => handlePlayFromList(song, idx, onlineResults, 'Online Stream')}
                  onLongPress={() => setInfoSong(song)}
                  onMenuPress={() => setInfoSong(song)}
                  onToggleFavorite={() => toggleFavorite(song.id)}
                  onDownload={() => handleDownload(song)}
                />
              ))}
            </View>
          )}

          {/* Search loading / empty state */}
          {onlineSearching && onlineResults.length === 0 && (
            <View style={styles.searchStatusBox}>
              <ActivityIndicator size="small" color={colors.teal} style={{ marginRight: 8 }} />
              <Text style={styles.searchStatusTxt}>Searching global online catalog…</Text>
            </View>
          )}

          {!onlineSearching && filtered.length === 0 && onlineResults.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No matches found</Text>
              <Text style={styles.emptyBody}>Check your spelling or try searching for another song or artist.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        /* NORMAL SPOTIFY-STYLE BROWSING (When NOT searching) */
        <>
          {/* Category Tabs */}
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

          {/* Drill-down Back Navigation */}
          {groupFilter && (
            <View style={styles.drillNavRow}>
              <TouchableOpacity onPress={() => setGroupFilter(null)} style={styles.backRow} activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={18} color={colors.copper} />
                <Text numberOfLines={1} style={styles.backTxt}>{groupFilter.title || groupFilter.value}</Text>
              </TouchableOpacity>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {groupFilter.playlistId && (
                  <TouchableOpacity
                    onPress={() => setAddSongsToPlModal(true)}
                    style={styles.addSongPlBtn}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add" size={16} color="#161213" />
                    <Text style={styles.addSongPlBtnTxt}>Add Songs</Text>
                  </TouchableOpacity>
                )}
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
            </View>
          )}

          {/* Hero Action Bar: Play All & Shuffle & Add Songs (if in Playlist) */}
          {(tab === 'songs' || tab === 'favorites' || groupFilter) && (
            <View style={styles.heroActionsRow}>
              {filtered.length > 0 && (
                <>
                  <TouchableOpacity style={styles.playAllBtn} onPress={() => handlePlayAll(filtered)} activeOpacity={0.85}>
                    <Ionicons name="play" size={17} color="#161213" />
                    <Text style={styles.playAllTxt}>Play All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shuffleBtn} onPress={() => handleShuffleAll(filtered)} activeOpacity={0.85}>
                    <Ionicons name="shuffle" size={18} color={colors.text} />
                    <Text style={styles.shuffleTxt}>Shuffle</Text>
                  </TouchableOpacity>
                </>
              )}
              {groupFilter && groupFilter.playlistId && (
                <TouchableOpacity
                  style={[styles.shuffleBtn, { backgroundColor: 'rgba(232,147,92,0.14)', borderColor: colors.copper }]}
                  onPress={() => setAddSongsToPlModal(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle" size={18} color={colors.copper} />
                  <Text style={[styles.shuffleTxt, { color: colors.copper, fontWeight: '700' }]}>+ Add Songs</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* TAB VIEWS */}
          {tab === 'songs' && !groupFilter && (
            <SongList
              songs={filtered}
              currentSong={currentSong}
              isPlaying={isPlaying}
              onPlaySong={handlePlayFromList}
              onToggleFav={handleToggleFav}
              onShowInfo={setInfoSong}
              label="All songs"
            />
          )}

          {groupFilter && (
            <SongList
              songs={filtered}
              currentSong={currentSong}
              isPlaying={isPlaying}
              onPlaySong={handlePlayFromList}
              onToggleFav={handleToggleFav}
              onShowInfo={setInfoSong}
              label={groupFilter.title || groupFilter.value}
              playlistId={groupFilter.playlistId}
              onAddSongsPress={groupFilter.playlistId ? () => setAddSongsToPlModal(true) : null}
              emptyMsg={groupFilter.playlistId ? 'This playlist is empty. Tap "+ Add Songs" to add tracks.' : 'No songs found.'}
              onRemoveFromPlaylist={(songId) => {
                removeSongFromPlaylist(groupFilter.playlistId, songId);
                force((n) => n + 1);
              }}
            />
          )}

          {tab === 'folders' && !groupFilter && (
            <GroupList type="folder" groups={grouped('folder')} onSelect={(value) => setGroupFilter({ field: 'folder', value, title: `📁 ${value}` })} />
          )}

          {tab === 'artists' && !groupFilter && (
            <GroupList type="artist" groups={grouped('artist')} onSelect={(value) => setGroupFilter({ field: 'artist', value, title: `👤 ${value}` })} />
          )}

          {tab === 'albums' && !groupFilter && (
            <GroupList type="album" groups={grouped('album')} onSelect={(value) => setGroupFilter({ field: 'album', value, title: `💿 ${value}` })} />
          )}

          {tab === 'favorites' && !groupFilter && (
            <SongList
              songs={Array.from(allSongsMap.values()).filter((s) => statsFor(s.id).favorite)}
              currentSong={currentSong}
              isPlaying={isPlaying}
              onPlaySong={handlePlayFromList}
              onToggleFav={handleToggleFav}
              onShowInfo={setInfoSong}
              label="Favorites"
              emptyMsg="Tap the heart on any song to save it here."
            />
          )}

          {tab === 'playlists' && !groupFilter && (
            <PlaylistsTab
              cleanSongs={cleanSongs}
              onOpenSmart={openSmartPlaylist}
              onOpenPlaylist={(p) => {
                setGroupFilter({ title: p.name, playlistId: p.id });
              }}
              onCreateNew={() => { setPickerSong(null); setNewPlModalVisible(true); }}
            />
          )}
        </>
      )}

      {/* Song Details Modal Sheet */}
      <SongInfoSheet
        visible={!!infoSong}
        song={infoSong}
        onClose={() => setInfoSong(null)}
        onPlaySong={onPlaySong}
        onAddToPlaylist={(s) => setPickerSong(s)}
      />

      {/* Add Song to Playlist Picker Sheet */}
      <Sheet visible={!!pickerSong} title="Add to Playlist" onClose={() => { setPickerSong(null); setIsCreatingInline(false); }}>
        <View style={{ paddingBottom: 10 }}>
          {pickerSong && (
            <View style={styles.pickerSongPreview}>
              <ArtThumb song={pickerSong} size={42} radius={10} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.groupTitle}>{pickerSong.title}</Text>
                <Text numberOfLines={1} style={styles.groupSub}>{pickerSong.artist}</Text>
              </View>
            </View>
          )}

          <Text style={styles.sectionLabel}>SELECT PLAYLIST</Text>
          {getDB().playlists.length === 0 ? (
            <Text style={styles.emptyBody}>No custom playlists created yet.</Text>
          ) : (
            getDB().playlists.map((pl) => {
              const inPlaylist = pickerSong && pl.songIds.includes(pickerSong.id);
              return (
                <TouchableOpacity
                  key={pl.id}
                  style={styles.plCard}
                  onPress={() => {
                    if (pickerSong) {
                      toggleSongInPlaylist(pl.id, pickerSong);
                      force((n) => n + 1);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.plCover}>
                    <Ionicons name="musical-notes" size={20} color="#1a0f08" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupTitle}>{pl.name}</Text>
                    <Text style={styles.groupSub}>{pl.songIds.length} song{pl.songIds.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <Ionicons
                    name={inPlaylist ? 'checkmark-circle' : 'add-circle-outline'}
                    size={22}
                    color={inPlaylist ? colors.copper : colors.textFaint}
                  />
                </TouchableOpacity>
              );
            })
          )}

          {isCreatingInline ? (
            <View style={styles.inlineCreateBox}>
              <TextInput
                value={newPlName}
                onChangeText={setNewPlName}
                placeholder="Playlist name…"
                placeholderTextColor={colors.textFaint}
                style={styles.inlineCreateInput}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => { setIsCreatingInline(false); setNewPlName(''); }} style={styles.inlineCancelBtn}>
                  <Text style={styles.modalCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCreateCustomPlaylist} style={styles.inlineSaveBtn}>
                  <Text style={styles.modalCreateTxt}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.newPlBtn}
              onPress={() => setIsCreatingInline(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={18} color={colors.copper} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13.5 }}>+ Create New Playlist</Text>
            </TouchableOpacity>
          )}
        </View>
      </Sheet>

      {/* Add Songs Picker Modal for Playlist Detail */}
      {groupFilter && groupFilter.playlistId && (
        <Sheet visible={addSongsToPlModal} title={`Add to "${groupFilter.title}"`} onClose={() => { setAddSongsToPlModal(false); setAddSongsQuery(''); }}>
          <View style={{ paddingBottom: 20 }}>
            <View style={[styles.searchBar, { marginBottom: 12 }]}>
              <Ionicons name="search-outline" size={17} color={colors.textFaint} style={{ marginLeft: 12, marginRight: 8 }} />
              <TextInput
                value={addSongsQuery}
                onChangeText={setAddSongsQuery}
                placeholder="Search songs to add…"
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                autoCapitalize="none"
              />
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {Array.from(allSongsMap.values())
                .filter((s) => {
                  const q = addSongsQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (s.title || '').toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q);
                })
                .map((song) => {
                  const pl = getDB().playlists.find((p) => p.id === groupFilter.playlistId);
                  const isAdded = pl ? pl.songIds.includes(song.id) : false;
                  return (
                    <TouchableOpacity
                      key={song.id}
                      style={[styles.plCard, isAdded && { borderColor: colors.copperSoft, backgroundColor: 'rgba(232,147,92,0.08)' }]}
                      onPress={() => {
                        toggleSongInPlaylist(groupFilter.playlistId, song);
                        force((n) => n + 1);
                      }}
                      activeOpacity={0.7}
                    >
                      <ArtThumb song={song} size={38} radius={8} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={styles.groupTitle}>{song.title}</Text>
                        <Text numberOfLines={1} style={styles.groupSub}>{song.artist}</Text>
                      </View>
                      <Ionicons
                        name={isAdded ? 'checkmark-circle' : 'add-circle-outline'}
                        size={22}
                        color={isAdded ? colors.copper : colors.textFaint}
                      />
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        </Sheet>
      )}

      {/* Standalone Create Playlist Sheet (Crash-Safe) */}
      <Sheet visible={newPlModalVisible} title="Create New Playlist" onClose={() => { setNewPlModalVisible(false); setNewPlName(''); }}>
        <View style={{ paddingBottom: 20 }}>
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
      </Sheet>
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

function SongList({
  songs, currentSong, isPlaying, onPlaySong, onToggleFav, onShowInfo, label, emptyMsg,
  playlistId, onRemoveFromPlaylist, onAddSongsPress,
}) {
  if (songs.length === 0) {
    const isFav = label === 'Favorites';
    return (
      <View style={styles.empty}>
        {isFav && (
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,111,145,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
            <Ionicons name="heart" size={26} color={colors.rose} />
          </View>
        )}
        <Text style={styles.emptyTitle}>{isFav ? 'No Favorites Yet' : 'No Songs Found'}</Text>
        <Text style={styles.emptyBody}>{emptyMsg || 'Tap the heart on any song to save it here.'}</Text>
        {onAddSongsPress && (
          <TouchableOpacity style={styles.primaryBtn} onPress={onAddSongsPress} activeOpacity={0.85}>
            <Ionicons name="add-circle" size={19} color="#1a0f08" />
            <Text style={styles.primaryBtnTxt}>Add Songs to Playlist</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  return (
    <FlatList
      data={songs}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}
      ListHeaderComponent={<Text style={styles.sectionLabel}>{label} · {songs.length}</Text>}
      getItemLayout={(data, index) => ({ length: 62, offset: 62 * index, index })}
      renderItem={({ item, index }) => (
        <SongRow
          song={item}
          isCurrent={currentSong && currentSong.id === item.id}
          isPlaying={isPlaying}
          isFavorite={statsFor(item.id).favorite}
          onPress={() => onPlaySong(item, index, songs, label)}
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
          <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(232,147,92,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Ionicons name="musical-notes" size={24} color={colors.copper} />
          </View>
          <Text style={styles.emptyTitle}>Create Your Playlists</Text>
          <Text style={[styles.emptyBody, { marginBottom: 14 }]}>Organize your favorite music into custom playlists.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onCreateNew} activeOpacity={0.85}>
            <Ionicons name="add-circle" size={18} color="#1a0f08" />
            <Text style={styles.primaryBtnTxt}>+ Create First Playlist</Text>
          </TouchableOpacity>
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
  addSongPlBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.copper, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 100 },
  addSongPlBtnTxt: { color: '#161213', fontWeight: '700', fontSize: 12 },
  deletePlBtn: { padding: 6, backgroundColor: 'rgba(255,111,145,0.12)', borderRadius: 8 },
  heroActionsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 8 },
  playAllBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.copper, paddingVertical: 11, borderRadius: 100 },
  playAllTxt: { color: '#161213', fontWeight: '700', fontSize: 14 },
  shuffleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, paddingVertical: 11, borderRadius: 100 },
  shuffleTxt: { color: colors.text, fontWeight: '600', fontSize: 14 },
  sectionLabel: { color: colors.textFaint, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700', marginTop: 12, marginBottom: 8 },
  searchStatusBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  searchStatusTxt: { color: colors.teal, fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 100, gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  emptyBody: { color: colors.textDim, fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
  emptyScan: { color: colors.textDim, fontSize: 13, marginTop: 10 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.copper, paddingVertical: 13, paddingHorizontal: 24, borderRadius: 100, marginTop: 10 },
  primaryBtnTxt: { color: '#1a0f08', fontWeight: '700', fontSize: 14 },
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
  plCover: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  pickerSongPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgElevated, padding: 10, borderRadius: 12, marginBottom: 10 },
  newPlBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 100, paddingVertical: 12, marginTop: 10 },
  inlineCreateBox: { backgroundColor: colors.bgElevated2, borderWidth: 1, borderColor: colors.copper, borderRadius: 14, padding: 12, marginTop: 10 },
  inlineCreateInput: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, color: colors.text, fontSize: 14, marginBottom: 10 },
  inlineCancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: colors.bgElevated },
  inlineSaveBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: colors.copper },
  modalInput: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, color: colors.text, fontSize: 15, marginBottom: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelTxt: { color: colors.textDim, fontWeight: '600', fontSize: 14 },
  modalCreateBtn: { backgroundColor: colors.copper, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 100 },
  modalCreateTxt: { color: '#161213', fontWeight: '700', fontSize: 14 },
});
