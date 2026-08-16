import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import { colors, mulberry32, hashStr } from '../theme';

const BAR_COUNT = 40;

export default function Waveform({ songId, progressFrac, onSeek, height = 40 }) {
  const containerWidth = useRef(0);
  const [dragFrac, setDragFrac] = useState(null);

  const heights = useMemo(() => {
    const rng = mulberry32(hashStr(songId || 'x'));
    return Array.from({ length: BAR_COUNT }, () => 18 + rng() * 82);
  }, [songId]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => handleTouch(e.nativeEvent.locationX),
    onPanResponderMove: (e) => handleTouch(e.nativeEvent.locationX),
    onPanResponderRelease: (e) => { handleTouch(e.nativeEvent.locationX, true); },
  }), [onSeek]);

  function handleTouch(x, commit) {
    if (!containerWidth.current) return;
    const frac = Math.max(0, Math.min(1, x / containerWidth.current));
    setDragFrac(frac);
    if (commit) { onSeek(frac); setDragFrac(null); }
  }

  const activeFrac = dragFrac !== null ? dragFrac : progressFrac;
  const playedCount = Math.round(activeFrac * BAR_COUNT);

  return (
    <View
      style={[styles.row, { height }]}
      onLayout={(e) => { containerWidth.current = e.nativeEvent.layout.width; }}
      {...panResponder.panHandlers}
    >
      {heights.map((h, i) => (
        <View
          key={i}
          style={{
            flex: 1, marginHorizontal: 1, borderRadius: 3, height: `${h}%`,
            backgroundColor: i < playedCount ? colors.copper : 'rgba(255,255,255,0.16)',
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});
