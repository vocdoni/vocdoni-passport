import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  NativeModules,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { Button, AppHeader } from '../../components/common';
import { Card } from '../../components/common/Card';
import { Spinner } from '../../components/common/Spinner';
import { colors, borderRadius } from '../../components/common/styles';
import { fetchProofRequestPayload, type ProofRequestPayload } from '../../services/ServerClient';
import type { RootStackParamList } from '../../navigation/types';
import { Buffer } from 'buffer';

const { ServerQrScanner } = NativeModules;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ScannerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [scanning, setScanning] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [requestLink, setRequestLink] = useState('');
  const [loadingLink, setLoadingLink] = useState(false);

  const parseScannedPayload = useCallback((raw: string): ProofRequestPayload => {
    const text = String(raw || '').trim();
    if (!text) throw new Error('Empty QR payload');

    const tryJson = (s: string): any | null => {
      try { return JSON.parse(s); } catch { return null; }
    };

    let payload: any = tryJson(text);
    if (!payload) {
      try {
        const b64 = getQueryParam(text, 'payload') || getQueryParam(text, 'request') || getQueryParam(text, 'c');
        if (b64) {
          const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
          const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
          payload = tryJson(Buffer.from(padded, 'base64').toString('utf8'));
        }
      } catch {}
    }

    if (!payload || typeof payload !== 'object') throw new Error('QR does not contain a valid request');
    if (!payload.aggregateUrl || typeof payload.aggregateUrl !== 'string') throw new Error('QR payload missing aggregateUrl');
    return payload as ProofRequestPayload;
  }, []);

  const resolvePayload = useCallback(async (raw: string): Promise<ProofRequestPayload> => {
    const text = String(raw || '').trim();
    if (!text) throw new Error('Empty request payload');

    try {
      return parseScannedPayload(text);
    } catch {}

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(text);
    } catch {
      throw new Error('Request is neither valid JSON nor a valid URL');
    }

    const embeddedPayload = getQueryParam(parsedUrl.toString(), 'payload') ||
      getQueryParam(parsedUrl.toString(), 'request') ||
      getQueryParam(parsedUrl.toString(), 'c');

    if (embeddedPayload) {
      return parseScannedPayload(text);
    }

    return fetchProofRequestPayload(parsedUrl.toString());
  }, [parseScannedPayload]);

  const handleScanQR = useCallback(async () => {
    if (!ServerQrScanner) {
      Alert.alert('Unavailable', 'QR scanner is not available on this device.');
      return;
    }

    setScanning(true);
    try {
      const result = await ServerQrScanner.scan();
      const payload = await resolvePayload(result?.payload || '');
      navigation.navigate('Signing', { screen: 'ServerCheck', params: { request: payload } });
    } catch (error: any) {
      if (!error?.message?.includes('cancelled')) {
        Alert.alert('Scan Failed', error?.message || 'Could not scan the QR code.');
      }
    } finally {
      setScanning(false);
    }
  }, [navigation, resolvePayload]);

  const handlePasteLink = useCallback(async () => {
    try {
      const value = await Clipboard.getString();
      setRequestLink(value || '');
    } catch (error: any) {
      Alert.alert('Paste Failed', error?.message || 'Could not read clipboard.');
    }
  }, []);

  const handleLoadLink = useCallback(async () => {
    if (!requestLink.trim()) return;

    setLoadingLink(true);
    try {
      const payload = await resolvePayload(requestLink);
      setRequestLink('');
      setShowLinkInput(false);
      navigation.navigate('Signing', { screen: 'ServerCheck', params: { request: payload } });
    } catch (error: any) {
      Alert.alert('Invalid Link', error?.message || 'Could not load the request link.');
    } finally {
      setLoadingLink(false);
    }
  }, [navigation, requestLink, resolvePayload]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AppHeader />

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.title}>Scan Petition</Text>
          <Text style={styles.subtitle}>
            Scan a QR code to sign a petition
          </Text>
        </View>

        <View style={styles.scannerArea}>
          <View style={styles.scannerFrame}>
            {scanning ? (
              <View style={styles.scanningOverlay}>
                <Spinner size="large" />
                <Text style={styles.scanningText}>Opening camera...</Text>
              </View>
            ) : (
              <>
                <View style={styles.qrPlaceholder}>
                  <View style={styles.qrGrid}>
                    {[...Array(9)].map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.qrCell,
                          (i === 0 || i === 2 || i === 6) && styles.qrCellFilled,
                        ]}
                      />
                    ))}
                  </View>
                  <View style={styles.qrCornerTL} />
                  <View style={styles.qrCornerTR} />
                  <View style={styles.qrCornerBL} />
                </View>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                <TouchableOpacity style={styles.scanButton} onPress={handleScanQR} activeOpacity={0.8}>
                  <Text style={styles.scanButtonIcon}>📷</Text>
                  <Text style={styles.scanButtonText}>Tap to Scan QR</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <Text style={styles.hint}>
          Point at a petition QR code to start the signing process
        </Text>

        {!showLinkInput ? (
          <Button
            label="Or paste a request link"
            onPress={() => setShowLinkInput(true)}
            variant="subtle"
          />
        ) : (
          <Card title="Request Link">
            <TextInput
              value={requestLink}
              onChangeText={setRequestLink}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://server.example/api/request..."
              placeholderTextColor="#94a3b8"
              style={styles.linkInput}
              multiline
            />
            <View style={styles.linkButtons}>
              <Button label="Paste" onPress={handlePasteLink} variant="subtle" fullWidth={false} />
              <Button
                label={loadingLink ? 'Loading...' : 'Load Link'}
                onPress={handleLoadLink}
                variant="primary"
                disabled={loadingLink || !requestLink.trim()}
                loading={loadingLink}
                fullWidth={false}
              />
            </View>
            <Button
              label="Cancel"
              onPress={() => {
                setShowLinkInput(false);
                setRequestLink('');
              }}
              variant="subtle"
            />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function getQueryParam(rawUrl: string, key: string): string | null {
  const text = String(rawUrl || '').trim();
  const queryIndex = text.indexOf('?');
  if (queryIndex < 0) return null;
  const fragmentIndex = text.indexOf('#', queryIndex);
  const query = text.slice(queryIndex + 1, fragmentIndex >= 0 ? fragmentIndex : undefined);
  for (const part of query.split('&')) {
    if (!part) continue;
    const eqIndex = part.indexOf('=');
    const rawKey = eqIndex >= 0 ? part.slice(0, eqIndex) : part;
    const rawValue = eqIndex >= 0 ? part.slice(eqIndex + 1) : '';
    const decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    if (decodedKey !== key) continue;
    return decodeURIComponent(rawValue.replace(/\+/g, ' '));
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  titleSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  scannerArea: {
    alignItems: 'center',
    marginBottom: 20,
  },
  scannerFrame: {
    width: SCREEN_WIDTH - 80,
    height: SCREEN_WIDTH - 80,
    backgroundColor: '#1a1f36',
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  qrPlaceholder: {
    position: 'absolute',
    width: 100,
    height: 100,
    opacity: 0.15,
  },
  qrGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 60,
    height: 60,
    position: 'absolute',
    bottom: 10,
    right: 10,
  },
  qrCell: {
    width: 20,
    height: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#fff',
  },
  qrCellFilled: {
    backgroundColor: '#fff',
  },
  qrCornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 30,
    borderWidth: 6,
    borderColor: '#fff',
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  qrCornerTR: {
    position: 'absolute',
    top: 0,
    right: 30,
    width: 30,
    height: 30,
    borderWidth: 6,
    borderColor: '#fff',
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  qrCornerBL: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    width: 30,
    height: 30,
    borderWidth: 6,
    borderColor: '#fff',
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: colors.primary,
    borderWidth: 4,
  },
  cornerTL: {
    top: 20,
    left: 20,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 20,
    right: 20,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 20,
    left: 20,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 20,
    right: 20,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  scanButton: {
    alignItems: 'center',
    padding: 24,
    zIndex: 10,
  },
  scanButtonIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scanningOverlay: {
    alignItems: 'center',
  },
  scanningText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 12,
  },
  hint: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  linkInput: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: '#f8fbff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  linkButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
});
