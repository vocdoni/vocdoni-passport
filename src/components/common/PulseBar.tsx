import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { colors, borderRadius } from './styles';

interface PulseBarProps {
  active: boolean;
}

export function PulseBar({ active }: PulseBarProps) {
  const opacity = useRef(new Animated.Value(active ? 1 : 0.55)).current;

  useEffect(() => {
    if (!active) {
      opacity.setValue(0.55);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 900, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, opacity]);

  return (
    <Animated.View style={[styles.rail, { opacity }]}>
      <View style={styles.fill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rail: {
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginBottom: 14,
  },
  fill: {
    width: '58%',
    height: '100%',
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
});
