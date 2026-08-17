import React, { useState, useEffect } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradientFor } from '../theme';

export default function ArtThumb({ song, size = 46, radius = 10, fontSize }) {
  const [hasError, setHasError] = useState(false);
  const style = { width: size, height: size, borderRadius: radius, overflow: 'hidden' };

  useEffect(() => {
    setHasError(false);
  }, [song?.artworkUrl, song?.id]);

  if (song && song.artworkUrl && !hasError) {
    return (
      <Image
        source={{ uri: song.artworkUrl }}
        style={style}
        onError={() => setHasError(true)}
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
