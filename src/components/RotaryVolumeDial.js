import React, { useRef, useMemo } from 'react';
import { View, Text, StyleSheet, PanResponder, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// Rotary Circular Volume Knob (Hi-Fi Amplifier Dial)
// Clockwise drag increases volume, Anti-clockwise drag decreases volume.
export default function RotaryVolumeDial({ volume = 1.0, onVolumeChange, size = 110 }) {
  const lastAngleRef = useRef(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const knobRadius = size / 2;

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const dx = locationX - knobRadius;
        const dy = locationY - knobRadius;
        lastAngleRef.current = Math.atan2(dy, dx) * (180 / Math.PI);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const dx = locationX - knobRadius;
        const dy = locationY - knobRadius;
        const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);

        if (lastAngleRef.current !== null) {
          let delta = currentAngle - lastAngleRef.current;
          // Handle wrap-around across -180 / +180 boundary
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;

          // Sensitivity: 270 degrees = full 0% to 100% volume sweep
          const volDelta = delta / 270;
          const newVol = Math.max(0, Math.min(1.0, volumeRef.current + volDelta));
          if (onVolumeChange && Math.abs(newVol - volumeRef.current) > 0.005) {
            onVolumeChange(Number(newVol.toFixed(2)));
          }
        }
        lastAngleRef.current = currentAngle;
      },
      onPanResponderRelease: () => {
        lastAngleRef.current = null;
      },
      onPanResponderTerminate: () => {
        lastAngleRef.current = null;
      },
    });
  }, [knobRadius, onVolumeChange]);

  // Rotary rotation angle: -135deg (0% volume) to +135deg (100% volume)
  const rotationDeg = (volume - 0.5) * 270;
  const volPercent = Math.round(volume * 100);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.dialLabel}>ROTARY SOUND DIAL</Text>
        <Text style={styles.dialVolText}>{volPercent}%</Text>
      </View>

      <View style={[styles.dialWrapper, { width: size + 20, height: size + 20 }]}>
        {/* Outer Circular Ring with Tick Dots */}
        <View style={[styles.outerRing, { width: size + 16, height: size + 16, borderRadius: (size + 16) / 2 }]}>
          {/* Circular Indicator Ticks */}
          {[...Array(12)].map((_, i) => {
            const angle = (i / 11) * 270 - 135;
            const isLit = (i / 11) <= volume;
            const rad = (angle - 90) * (Math.PI / 180);
            const r = knobRadius + 4;
            const x = knobRadius + 8 + r * Math.cos(rad) - 2;
            const y = knobRadius + 8 + r * Math.sin(rad) - 2;
            return (
              <View
                key={i}
                style={[
                  styles.tickDot,
                  { left: x, top: y },
                  isLit && styles.tickDotLit,
                ]}
              />
            );
          })}

          {/* Interactive Rotating Knob */}
          <View
            {...panResponder.panHandlers}
            style={[
              styles.knobBody,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
          >
            {/* Rotating Indicator Needle / Dot */}
            <View
              style={[
                styles.rotaryIndicatorWrap,
                { transform: [{ rotate: `${rotationDeg}deg` }] },
              ]}
              pointerEvents="none"
            >
              <View style={styles.indicatorDot} />
            </View>

            {/* Center Tap to Mute/Unmute */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
              style={[styles.centerCap, { width: size * 0.56, height: size * 0.56, borderRadius: (size * 0.56) / 2 }]}
            >
              <Ionicons
                name={volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'}
                size={20}
                color={volume === 0 ? colors.rose : colors.copper}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Text style={styles.hintTxt}>Drag circle clockwise ↻ to increase · ↺ to decrease</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  dialLabel: {
    color: colors.textFaint,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  dialVolText: {
    color: colors.copper,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  dialWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,147,92,0.15)',
    position: 'relative',
  },
  tickDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tickDotLit: {
    backgroundColor: colors.copper,
    shadowColor: colors.copper,
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  knobBody: {
    backgroundColor: colors.bgElevated2,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  rotaryIndicatorWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  indicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.copper,
    shadowColor: colors.copper,
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  centerCap: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  hintTxt: {
    color: colors.textFaint,
    fontSize: 10,
    marginTop: 8,
    textAlign: 'center',
  },
});
