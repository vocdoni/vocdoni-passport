import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, Dimensions } from 'react-native';
import { colors, borderRadius } from './common/styles';

const SLIDER_WIDTH = Dimensions.get('window').width - 72;
const THUMB_SIZE = 56;
const TRACK_PADDING = 4;

interface SlideToVerifyProps {
  onVerified: () => void;
  disabled?: boolean;
  label?: string;
}

export function SlideToVerify({ onVerified, disabled = false, label = 'Slide to verify' }: SlideToVerifyProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [verified, setVerified] = useState(false);
  const maxSlide = SLIDER_WIDTH - THUMB_SIZE - TRACK_PADDING * 2;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled && !verified,
      onMoveShouldSetPanResponder: () => !disabled && !verified,
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(0, Math.min(gestureState.dx, maxSlide));
        translateX.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= maxSlide * 0.85) {
          Animated.spring(translateX, {
            toValue: maxSlide,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start(() => {
            setVerified(true);
            onVerified();
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        }
      },
    }),
  ).current;

  const thumbOpacity = translateX.interpolate({
    inputRange: [0, maxSlide],
    outputRange: [1, 0.9],
  });

  const textOpacity = translateX.interpolate({
    inputRange: [0, maxSlide * 0.5],
    outputRange: [1, 0],
  });

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.track}>
        <Animated.Text style={[styles.label, { opacity: textOpacity }]}>
          {verified ? 'Verified!' : label}
        </Animated.Text>
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [{ translateX }],
              opacity: thumbOpacity,
            },
            verified && styles.thumbVerified,
          ]}
          {...panResponder.panHandlers}
        >
          <Text style={styles.thumbIcon}>{verified ? '✓' : '→'}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  track: {
    width: SLIDER_WIDTH,
    height: THUMB_SIZE + TRACK_PADDING * 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  label: {
    position: 'absolute',
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  thumb: {
    position: 'absolute',
    left: TRACK_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  thumbVerified: {
    backgroundColor: colors.success,
  },
  thumbIcon: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
});
