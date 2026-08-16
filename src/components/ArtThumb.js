import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradientFor } from '../theme';

export default function ArtThumb({ song, size = 46, radius = 10, fontSize }) {
  const style = { width: size, height: size, borderRadius: radius, overflow: 'hidden' };
  if (song.artworkUrl) {
    return <Image source={{ uri: song.artworkUrl }} style={style} />;
  }
  const [c1, c2] = gradientFor(song.id);
  return (
    <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[style, styles.center]}>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: fontSize || size * 0.38 }}>
        {(song.title || '?').trim().slice(0, 1).toUpperCase()}
      </Text>
    </LinearGradient>
  );
}
const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
