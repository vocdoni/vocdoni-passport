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
import { BackButton, Button, FlowStepIndicator } from '../../../components/common';
import { Card } from '../../../components/common/Card';
import { colors, commonStyles, borderRadius } from '../../../components/common/styles';
import { useIDs } from '../../../hooks/useIDs';
import { useAuth } from '../../../hooks/useAuth';
import type { IDsStackParamList } from '../../../navigation/types';

const { PassportReader } = NativeModules;

type NavigationProp = NativeStackNavigationProp<IDsStackParamList, 'AddIDNfc'>;
type RouteType = RouteProp<IDsStackParamList, 'AddIDNfc'>;

interface NfcProgress {
  step: string;
  percent: number;
  message: string;
}

const NFC_POSITIONS = [
  { label: 'Passport', description: 'Usually in the front cover or data page', icon: '📕' },
  { label: 'ID Card', description: 'Usually in the center of the card', icon: '🪪' },
];

export function NfcReadScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const { addID } = useIDs();
  const { setupAuth, refreshAuthState } = useAuth();

  const [status, setStatus] = useState('Preparing NFC reader...');
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const scanAttemptRef = useRef(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0.8)).current;
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!PassportReader) {return;}

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

  const cancelCurrentScan = useCallback(async () => {
    if (typeof PassportReader?.cancelCurrentScan !== 'function') {
      return;
    }

    try {
      await Promise.resolve(PassportReader.cancelCurrentScan());
    } catch {}
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
      const result = await PassportReader.scan({
        documentNumber,
        dateOfBirth,
        dateOfExpiry,
      });

      if (scanAttemptRef.current !== attempt) {return;}

      setStatus('Processing document data...');
      setProgress(100);
      const newId = await addID(result.dg1, result.sod, result.dg2);

      await setupAuth();
      await refreshAuthState();

      navigation.navigate('AddIDSuccess', { id: newId.id });
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
  }, [documentNumber, dateOfBirth, dateOfExpiry, addID, navigation, setupAuth, refreshAuthState]);

  useEffect(() => {
    startScan();
    return () => {
      scanAttemptRef.current += 1;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      cancelCurrentScan();
    };
  }, [cancelCurrentScan, startScan]);

  const retryScan = useCallback(async () => {
    scanAttemptRef.current += 1;
    setScanning(false);
    setError('');
    setStatus('Restarting NFC reader...');
    setProgress(0);

    await cancelCurrentScan();

    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      startScan();
    }, 300);
  }, [cancelCurrentScan, startScan]);

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
          <Text style={commonStyles.pageTitle}>Read NFC Chip</Text>
          <Text style={commonStyles.pageSubtitle}>
            Keep your phone steady on the document
          </Text>
        </View>

        <FlowStepIndicator
          steps={['MRZ', 'NFC', 'Done']}
          activeStep={2}
          completedSteps={1}
        />

        <Card>
          <View style={styles.nfcAnimation}>
            <Animated.View
              style={[
                styles.nfcRing,
                { transform: [{ scale: ringAnim }] },
                scanning ? styles.nfcRingScanning : styles.nfcRingIdle,
              ]}
            />
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
              cancelCurrentScan();
              navigation.goBack();
            }} variant="subtle" />
          )}
        </Card>

        {error ? (
          <Card title="Read Failed">
            <Text style={styles.errorText}>{error}</Text>
            <Button label="Try Again" onPress={retryScan} variant="primary" />
            {error.toLowerCase().includes('nfc') && error.toLowerCase().includes('disabled') && (
              <Button label="Open NFC Settings" onPress={openNfcSettings} variant="secondary" />
            )}
            <Button label="Change MRZ Values" onPress={() => navigation.goBack()} variant="subtle" />
          </Card>
        ) : null}

        <View style={styles.tips}>
          <Text style={styles.tipsTitle}>Tips for successful reading:</Text>
          <View style={styles.tipRow}>
            <Text style={styles.tipIcon}>📱</Text>
            <Text style={styles.tipText}>Remove your phone case for better contact</Text>
          </View>
          <View style={styles.tipRow}>
            <Text style={styles.tipIcon}>🎯</Text>
            <Text style={styles.tipText}>The NFC reader is usually near the camera</Text>
          </View>
          <View style={styles.tipRow}>
            <Text style={styles.tipIcon}>✋</Text>
            <Text style={styles.tipText}>Hold completely still until complete</Text>
          </View>
          <View style={styles.tipRow}>
            <Text style={styles.tipIcon}>⏱️</Text>
            <Text style={styles.tipText}>Reading takes 10-20 seconds</Text>
          </View>
        </View>

        <View style={styles.chipLocations}>
          <Text style={styles.chipTitle}>Where is the NFC chip?</Text>
          {NFC_POSITIONS.map((pos, idx) => (
            <View key={idx} style={styles.chipRow}>
              <Text style={styles.chipIcon}>{pos.icon}</Text>
              <View style={styles.chipInfo}>
                <Text style={styles.chipLabel}>{pos.label}</Text>
                <Text style={styles.chipDesc}>{pos.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <Card title="MRZ Values">
          <View style={styles.mrzRow}>
            <Text style={styles.mrzLabel}>Document</Text>
            <Text style={styles.mrzValue}>{documentNumber.replace(/</g, '')}</Text>
          </View>
          <View style={styles.mrzRow}>
            <Text style={styles.mrzLabel}>Birth Date</Text>
            <Text style={styles.mrzValue}>{dateOfBirth}</Text>
          </View>
          <View style={styles.mrzRow}>
            <Text style={styles.mrzLabel}>Expiry Date</Text>
            <Text style={styles.mrzValue}>{dateOfExpiry}</Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mrzRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  mrzLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  mrzValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'monospace',
  },
  nfcAnimation: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 140,
    marginBottom: 16,
  },
  nfcRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  nfcRingScanning: {
    opacity: 0.3,
  },
  nfcRingIdle: {
    opacity: 0,
  },
  nfcCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.infoLight,
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
    bottom: 5,
    right: '28%',
  },
  nfcDocIcon: {
    fontSize: 44,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
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
    width: 40,
    textAlign: 'right',
  },
  statusText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBadge: {
    backgroundColor: '#fff3cd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginBottom: 12,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#856404',
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    marginBottom: 12,
    lineHeight: 20,
  },
  tips: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f0f9ff',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 12,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipIcon: {
    fontSize: 16,
    marginRight: 10,
    width: 24,
    textAlign: 'center',
  },
  tipText: {
    fontSize: 13,
    color: '#0c4a6e',
    flex: 1,
  },
  chipLocations: {
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  chipIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  chipInfo: {
    flex: 1,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  chipDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
