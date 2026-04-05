import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  NativeModules,
  NativeEventEmitter,
  Animated,
  Platform,
  Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BackButton, Button } from '../../../components/common';
import { Card } from '../../../components/common/Card';
import { colors, commonStyles, borderRadius } from '../../../components/common/styles';
import type { IDsStackParamList } from '../../../navigation/types';

const { PassportReader } = NativeModules;

type NavigationProp = NativeStackNavigationProp<IDsStackParamList, 'ExploreIDNfc'>;
type RouteType = RouteProp<IDsStackParamList, 'ExploreIDNfc'>;

interface NfcProgress {
  step: string;
  percent: number;
  message: string;
}

export function ExploreNfcScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();

  const [status, setStatus] = useState('Preparing NFC reader...');
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const scanAttemptRef = useRef(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0.8)).current;

  const { documentNumber, dateOfBirth, dateOfExpiry } = route.params;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    pulse.start();

    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1.3, duration: 2000, useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 0.8, duration: 0, useNativeDriver: true }),
      ]),
    );
    ring.start();

    return () => {
      pulse.stop();
      ring.stop();
    };
  }, [pulseAnim, ringAnim]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  useEffect(() => {
    if (Platform.OS !== 'android') {return;}

    const eventEmitter = new NativeEventEmitter(PassportReader);
    const subscription = eventEmitter.addListener('NfcProgress', (event: NfcProgress) => {
      console.log('[NFC Progress]', event);
      setProgress(event.percent);
      setStatus(event.message);

      if (event.step === 'retry') {
        setRetryCount(prev => prev + 1);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const startScan = useCallback(async () => {
    if (!PassportReader) {
      setError('NFC module not available on this device');
      return;
    }

    const attempt = scanAttemptRef.current + 1;
    scanAttemptRef.current = attempt;
    setScanning(true);
    setError('');
    setProgress(0);
    setRetryCount(0);
    setStatus('Hold your phone against the NFC chip...');

    try {
      const scanFn = PassportReader.scanAll || PassportReader.scan;
      const result = await scanFn({
        documentNumber,
        dateOfBirth,
        dateOfExpiry,
      });

      if (scanAttemptRef.current !== attempt) {return;}

      setStatus('Document read successfully!');
      setProgress(100);

      navigation.navigate('ExploreIDResult', {
        dg1: result.dg1,
        sod: result.sod,
        dg2: result.dg2,
        dg7: result.dg7,
        dg11: result.dg11,
        dg12: result.dg12,
        dg13: result.dg13,
        dg14: result.dg14,
        dg15: result.dg15,
      });
    } catch (err: any) {
      if (scanAttemptRef.current !== attempt) {return;}

      const message = err?.message || '';
      const code = String(err?.code || '');

      if (code.includes('CANCELLED') || message === 'Scan cancelled') {
        setScanning(false);
        return;
      }

      setError(message || 'NFC read failed. Please try again.');
      setScanning(false);
      setProgress(0);
    }
  }, [documentNumber, dateOfBirth, dateOfExpiry, navigation]);

  useEffect(() => {
    startScan();
  }, []);

  const retryScan = useCallback(async () => {
    scanAttemptRef.current += 1;
    setScanning(false);
    setError('');
    setStatus('Restarting NFC reader...');
    setProgress(0);

    try {
      if (typeof PassportReader?.cancelCurrentScan === 'function') {
        await PassportReader.cancelCurrentScan();
      }
    } catch {}

    setTimeout(() => startScan(), 300);
  }, [startScan]);

  const openNfcSettings = useCallback(() => {
    if (Platform.OS === 'android') {
      Linking.sendIntent('android.settings.NFC_SETTINGS').catch(() => {
        Linking.openSettings();
      });
    } else {
      Linking.openURL('App-Prefs:root=General');
    }
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView contentContainerStyle={commonStyles.screenPad} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={commonStyles.pageHeader}>
          <Text style={commonStyles.pageTitle}>🔬 Explore NFC</Text>
          <Text style={commonStyles.pageSubtitle}>
            Read document for inspection (not saved)
          </Text>
        </View>

        <View style={styles.debugBanner}>
          <Text style={styles.debugIcon}>🛠️</Text>
          <Text style={styles.debugText}>Debug Mode - Data will NOT be stored</Text>
        </View>

        <Card>
          <View style={styles.nfcAnimation}>
            <Animated.View style={[styles.nfcRing, { transform: [{ scale: ringAnim }], opacity: scanning ? 0.3 : 0 }]} />
            <Animated.View style={[styles.nfcCircle, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={styles.nfcIcon}>📱</Text>
            </Animated.View>
            <View style={styles.nfcDoc}>
              <Text style={styles.nfcDocIcon}>🪪</Text>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.progressText}>{progress}%</Text>
          </View>

          <Text style={styles.statusText}>{status}</Text>

          {retryCount > 0 && (
            <View style={styles.retryBadge}>
              <Text style={styles.retryText}>Retry attempt {retryCount}/3</Text>
            </View>
          )}

          {scanning && !error && (
            <Button label="Cancel" onPress={() => {
              scanAttemptRef.current += 1;
              setScanning(false);
              setStatus('Scan cancelled');
              try {
                PassportReader?.cancelCurrentScan?.();
              } catch {}
            }} variant="secondary" />
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <View style={styles.errorButtons}>
                <Button label="Try Again" onPress={retryScan} variant="primary" />
                {error.toLowerCase().includes('nfc') && (
                  <Button label="NFC Settings" onPress={openNfcSettings} variant="secondary" />
                )}
              </View>
            </View>
          )}
        </Card>

        <Card title="Tips for successful scan">
          <View style={styles.tipItem}>
            <Text style={styles.tipIcon}>📍</Text>
            <Text style={styles.tipText}>Remove phone case if thick</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipIcon}>🔄</Text>
            <Text style={styles.tipText}>Move phone slowly to find the chip</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipIcon}>⏱️</Text>
            <Text style={styles.tipText}>Keep steady for 5-10 seconds</Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  debugBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: borderRadius.md,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#a5d6a7',
  },
  debugIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  debugText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#2e7d32',
  },
  nfcAnimation: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 180,
    marginBottom: 20,
  },
  nfcRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  nfcCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f5ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.primary,
  },
  nfcIcon: {
    fontSize: 40,
  },
  nfcDoc: {
    position: 'absolute',
    bottom: 10,
    right: '25%',
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  nfcDocIcon: {
    fontSize: 24,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginRight: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    width: 45,
    textAlign: 'right',
  },
  statusText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBadge: {
    alignSelf: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginBottom: 16,
  },
  retryText: {
    fontSize: 12,
    color: '#e65100',
    fontWeight: '600',
  },
  errorContainer: {
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  errorButtons: {
    gap: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tipIcon: {
    fontSize: 16,
    marginRight: 10,
    width: 24,
  },
  tipText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
});
