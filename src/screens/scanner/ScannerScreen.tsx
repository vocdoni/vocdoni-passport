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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { Button, AppHeader } from '../../components/common';
import { Card } from '../../components/common/Card';
import { Spinner } from '../../components/common/Spinner';
import { colors, borderRadius } from '../../components/common/styles';
import { navigateToSigningRequest } from '../../navigation/rootNavigation';
import { resolveProofRequestPayload } from '../../utils/requestLinks';

const { ServerQrScanner } = NativeModules;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const [scanning, setScanning] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [requestLink, setRequestLink] = useState('');
  const [loadingLink, setLoadingLink] = useState(false);

  const navigateToSigning = useCallback((payload: Awaited<ReturnType<typeof resolveProofRequestPayload>>) => {
    navigateToSigningRequest(payload);
  }, []);

  const handleScanQR = useCallback(async () => {
    if (!ServerQrScanner) {
      Alert.alert('Unavailable', 'QR scanner is not available on this device.');
      return;
    }

    setScanning(true);
    try {
      const result = await ServerQrScanner.scan();
      const payload = await resolveProofRequestPayload(result?.payload || '');
      navigateToSigning(payload);
    } catch (error: any) {
      if (!error?.message?.includes('cancelled')) {
        Alert.alert('Scan Failed', error?.message || 'Could not scan the QR code.');
      }
    } finally {
      setScanning(false);
    }
  }, [navigateToSigning]);

  const handlePasteLink = useCallback(async () => {
    try {
      const value = await Clipboard.getString();
      setRequestLink(value || '');
    } catch (error: any) {
      Alert.alert('Paste Failed', error?.message || 'Could not read clipboard.');
    }
  }, []);

  const handleLoadLink = useCallback(async () => {
    if (!requestLink.trim()) {return;}

    setLoadingLink(true);
    try {
      const payload = await resolveProofRequestPayload(requestLink);
      setRequestLink('');
      setShowLinkInput(false);
      navigateToSigning(payload);
    } catch (error: any) {
      Alert.alert('Invalid Link', error?.message || 'Could not load the request link.');
    } finally {
      setLoadingLink(false);
    }
  }, [navigateToSigning, requestLink]);

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
              placeholderTextColor={colors.textMuted}
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
    backgroundColor: colors.surface,
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
    borderColor: 'rgba(255,255,255,0.3)',
  },
  qrCellFilled: {
    backgroundColor: 'rgba(255,255,255,0.3)',
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
    borderColor: colors.border,
    backgroundColor: colors.surfaceDark,
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
