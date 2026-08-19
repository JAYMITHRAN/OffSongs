import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import { colors } from '../theme';

export default function SeekBar({
  progressFrac = 0,
  onSeek,
  onScrubbing,
  accentColor = colors.copper,
  height = 36,
}) {
  const containerRef = useRef(null);
  const layoutRef = useRef({ width: 0, pageX: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragFrac, setDragFrac] = useState(null);

  const calculateFrac = (pageX, locationX) => {
    const width = layoutRef.current.width;
    if (width <= 0) return 0;
    if (pageX !== undefined && layoutRef.current.pageX > 0) {
      const relativeX = pageX - layoutRef.current.pageX;
      return Math.max(0, Math.min(1, relativeX / width));
    }
    if (locationX !== undefined && locationX >= 0) {
      return Math.max(0, Math.min(1, locationX / width));
    }
    return 0;
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      setIsDragging(true);
      if (containerRef.current) {
        containerRef.current.measure((x, y, w, h, pageX) => {
          if (w > 0) layoutRef.current.width = w;
          if (pageX !== undefined) layoutRef.current.pageX = pageX;
        });
      }
      const frac = calculateFrac(e.nativeEvent.pageX, e.nativeEvent.locationX);
      setDragFrac(frac);
      if (onScrubbing) onScrubbing(frac);
    },
    onPanResponderMove: (e) => {
      const frac = calculateFrac(e.nativeEvent.pageX, e.nativeEvent.locationX);
      setDragFrac(frac);
      if (onScrubbing) onScrubbing(frac);
    },
    onPanResponderRelease: (e) => {
      const frac = calculateFrac(e.nativeEvent.pageX, e.nativeEvent.locationX);
      setIsDragging(false);
      setDragFrac(null);
      if (onSeek) onSeek(frac);
    },
    onPanResponderTerminate: () => {
      setIsDragging(false);
      setDragFrac(null);
    },
  }), [onSeek, onScrubbing]);

  const onLayout = (e) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0) layoutRef.current.width = width;
    if (containerRef.current) {
      containerRef.current.measure((x, y, w, h, pageX) => {
        if (w > 0) layoutRef.current.width = w;
        if (pageX !== undefined) layoutRef.current.pageX = pageX;
      });
    }
  };

  const activeFrac = dragFrac !== null ? dragFrac : Math.max(0, Math.min(1, progressFrac || 0));
  const activePercent = `${(activeFrac * 100).toFixed(2)}%`;

  return (
    <View
      ref={containerRef}
      onLayout={onLayout}
      style={[styles.container, { height }]}
      {...panResponder.panHandlers}
    >
      {/* Background Track Rail */}
      <View style={styles.track}>
        {/* Active Progress Fill */}
        <View
          style={[
            styles.progress,
            { width: activePercent, backgroundColor: accentColor },
          ]}
        />
      </View>

      {/* Draggable Knob Dot */}
      <View
        style={[
          styles.thumbContainer,
          { left: activePercent },
        ]}
      >
        <View
          style={[
            styles.thumb,
            isDragging && styles.thumbActive,
            { borderColor: accentColor },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
    position: 'relative',
    paddingVertical: 12,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    width: '100%',
    overflow: 'hidden',
  },
  progress: {
    height: '100%',
    borderRadius: 2,
  },
  thumbContainer: {
    position: 'absolute',
    top: '50%',
    marginLeft: -8,
    marginTop: -8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  thumbActive: {
    width: 18,
    height: 18,
    borderRadius: 9,
    transform: [{ scale: 1.15 }],
  },
});
