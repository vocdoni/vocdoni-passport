import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { colors } from '../components/common/styles';
import { preloadCoreProofAssets } from '../services/ProofGenerator';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface BootScreenProps {
  onReady: () => void;
}

export function BootScreen({ onReady }: BootScreenProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [statusText, setStatusText] = useState('Initializing...');

  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslate = useRef(new Animated.Value(20)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ring1Scale = useRef(new Animated.Value(0.8)).current;
  const ring1Opacity = useRef(new Animated.Value(0.6)).current;
  const ring2Scale = useRef(new Animated.Value(0.8)).current;
  const ring2Opacity = useRef(new Animated.Value(0.4)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonTranslate = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslate, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseAnimation.start();

    const ringAnimation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ring1Scale, {
              toValue: 1.8,
              duration: 2000,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ring1Opacity, {
              toValue: 0,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(ring1Scale, {
              toValue: 0.8,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(ring1Opacity, {
              toValue: 0.6,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.sequence([
          Animated.delay(1000),
          Animated.parallel([
            Animated.timing(ring2Scale, {
              toValue: 1.8,
              duration: 2000,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ring2Opacity, {
              toValue: 0,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(ring2Scale, {
              toValue: 0.8,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(ring2Opacity, {
              toValue: 0.4,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
    );
    ringAnimation.start();

    return () => {
      pulseAnimation.stop();
      ringAnimation.stop();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let progress = 0;

    const updateProgress = (target: number) => {
      if (cancelled) {return;}
      Animated.timing(progressWidth, {
        toValue: target,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    };

    preloadCoreProofAssets((step, detail) => {
      if (cancelled) {return;}
      progress += 15;
      if (progress > 90) {progress = 90;}
      updateProgress(progress);

      if (detail.toLowerCase().includes('manifest')) {
        setStatusText('Loading circuits...');
      } else if (detail.toLowerCase().includes('certificate')) {
        setStatusText('Verifying certificates...');
      } else if (detail.toLowerCase().includes('circuit') || detail.toLowerCase().includes('cached')) {
        setStatusText('Preparing proofs...');
      } else if (detail.toLowerCase().includes('crs')) {
        setStatusText('Almost ready...');
      }
    })
      .then(() => {
        if (cancelled) {return;}
        setStatus('ready');
        setStatusText('Ready!');
        updateProgress(100);

        Animated.spring(checkScale, {
          toValue: 1,
          tension: 50,
          friction: 6,
          useNativeDriver: true,
        }).start();

        setTimeout(() => {
          if (cancelled) {return;}
          Animated.parallel([
            Animated.timing(buttonOpacity, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(buttonTranslate, {
              toValue: 0,
              duration: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]).start();
        }, 300);

        setTimeout(() => {
          if (!cancelled) {onReady();}
        }, 1200);
      })
      .catch((error: any) => {
        if (cancelled) {return;}
        setStatus('error');
        setStatusText('Ready to continue');
        updateProgress(100);

        Animated.parallel([
          Animated.timing(buttonOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(buttonTranslate, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start();

        setTimeout(() => {
          if (!cancelled) {onReady();}
        }, 1500);
      });

    return () => {
      cancelled = true;
    };
  }, [onReady]);

  const progressInterpolate = progressWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGradient}>
        <View style={styles.gradientCircle1} />
        <View style={styles.gradientCircle2} />
      </View>

      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Animated.View
            style={[
              styles.ring,
              {
                transform: [{ scale: ring1Scale }],
                opacity: ring1Opacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              styles.ring2,
              {
                transform: [{ scale: ring2Scale }],
                opacity: ring2Opacity,
              },
            ]}
          />

          <Animated.View
            style={[
              styles.logoCircle,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }, { scale: pulseAnim }],
              },
            ]}
          >
            {status === 'ready' ? (
              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <Text style={styles.logoCheck}>✓</Text>
              </Animated.View>
            ) : (
              <Text style={styles.logoIcon}>🪪</Text>
            )}
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslate }],
            },
          ]}
        >
          <Text style={styles.title}>Vocdoni Passport</Text>
          <Text style={styles.subtitle}>Your identity, your control</Text>
        </Animated.View>

        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: progressInterpolate },
                status === 'ready' && styles.progressFillSuccess,
              ]}
            />
          </View>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Secure • Private • Decentralized</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  gradientCircle1: {
    position: 'absolute',
    top: -SCREEN_WIDTH * 0.5,
    right: -SCREEN_WIDTH * 0.3,
    width: SCREEN_WIDTH * 1.2,
    height: SCREEN_WIDTH * 1.2,
    borderRadius: SCREEN_WIDTH * 0.6,
    backgroundColor: 'rgba(46, 108, 255, 0.15)',
  },
  gradientCircle2: {
    position: 'absolute',
    bottom: -SCREEN_WIDTH * 0.4,
    left: -SCREEN_WIDTH * 0.3,
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    borderRadius: SCREEN_WIDTH * 0.5,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  ring: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  ring2: {
    borderColor: 'rgba(99, 102, 241, 0.6)',
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  logoIcon: {
    fontSize: 44,
  },
  logoCheck: {
    fontSize: 44,
    color: '#fff',
    fontWeight: '700',
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressFillSuccess: {
    backgroundColor: colors.success,
  },
  statusText: {
    marginTop: 16,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
  footer: {
    paddingBottom: 50,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
    fontWeight: '600',
    letterSpacing: 1,
  },
});
