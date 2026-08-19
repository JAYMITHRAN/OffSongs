import React, { useState, useEffect, useMemo } from 'react';
import { View, Image, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradientFor } from '../theme';

export default function ArtThumb({ song, size = 46, radius = 10, fontSize }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const style = { width: size, height: size, borderRadius: radius, overflow: 'hidden' };

  // Candidates ordered from highest-fidelity to native system fallback
  const candidates = useMemo(() => {
    if (!song) return [];
    const list = [];
    if (song.artworkUrl) list.push(song.artworkUrl);
    if (song.mediaStoreArtUri && !list.includes(song.mediaStoreArtUri)) {
      list.push(song.mediaStoreArtUri);
    }
    if (Platform.OS === 'android') {
      if (song.albumId) {
        const albumArt = `content://media/external/audio/albumart/${song.albumId}`;
        if (!list.includes(albumArt)) list.push(albumArt);
      }
      if (song.assetId) {
        const mediaArt = `content://media/external/audio/media/${song.assetId}/albumart`;
        if (!list.includes(mediaArt)) list.push(mediaArt);
      }
    }
    return list;
  }, [song?.artworkUrl, song?.mediaStoreArtUri, song?.albumId, song?.assetId]);

  useEffect(() => {
    setCandidateIndex(0);
  }, [song?.artworkUrl, song?.mediaStoreArtUri, song?.id]);

  const currentUri = candidates[candidateIndex];

  if (currentUri) {
    return (
      <Image
        source={{ uri: currentUri }}
        style={style}
        onError={() => setCandidateIndex((prev) => prev + 1)}
      />
    );
  }

  const [c1, c2] = gradientFor((song && song.id) || 'default');
  return (
    <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[style, styles.center]}>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: fontSize || size * 0.38 }}>
        {((song && song.title) || '?').trim().slice(0, 1).toUpperCase()}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
