import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { AppHeader } from '../../components/common';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common';
import { MnemonicDisplay } from '../../components/MnemonicDisplay';
import { colors, commonStyles, borderRadius } from '../../components/common/styles';
import { useWallet } from '../../contexts/WalletContext';

const PHRASE_DISPLAY_TIMEOUT = 10; // seconds

export function WalletScreen() {
  const { address, walletInfo, getPhrase, markBackedUp } = useWallet();
  const [showingPhrase, setShowingPhrase] = useState(false);
  const [phraseWords, setPhraseWords] = useState<string[] | undefined>();
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Start countdown when phrase is revealed
  useEffect(() => {
    if (phraseWords && phraseWords.length > 0) {
      setCountdown(PHRASE_DISPLAY_TIMEOUT);
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Time's up - hide the phrase
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            setShowingPhrase(false);
            setPhraseWords(undefined);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phraseWords]);

  const handleCopyAddress = useCallback(() => {
    if (address) {
      Clipboard.setString(address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  }, [address]);

  const handleShowPhrase = useCallback(async () => {
    setShowingPhrase(true);
  }, []);

  const handleRevealPhrase = useCallback(async () => {
    const phrase = await getPhrase();
    if (phrase) {
      setPhraseWords(phrase.split(' '));
      await markBackedUp();
    } else {
      Alert.alert('Authentication Required', 'Please authenticate to view your recovery phrase.');
      setShowingPhrase(false);
    }
  }, [getPhrase, markBackedUp]);

  const handleHidePhrase = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setShowingPhrase(false);
    setPhraseWords(undefined);
    setCountdown(0);
  }, []);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <View style={commonStyles.safeArea}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={commonStyles.pageHeader}>
          <Text style={commonStyles.pageTitle}>Digital Identity</Text>
          <Text style={commonStyles.pageSubtitle}>
            Your secure wallet for Vocdoni services
          </Text>
        </View>

        <Card>
          <View style={styles.identityHeader}>
            <View style={styles.identityIcon}>
              <Text style={styles.identityEmoji}>🔐</Text>
            </View>
            <View style={styles.identityInfo}>
              <Text style={styles.identityLabel}>Identity Address</Text>
              {walletInfo && (
                <Text style={styles.identityDate}>
                  Created {formatDate(walletInfo.createdAt)}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.addressContainer}
            onPress={handleCopyAddress}
            activeOpacity={0.7}
          >
            <Text style={styles.addressText} numberOfLines={2}>
              {address || 'No wallet configured'}
            </Text>
            <View style={[styles.copyBadge, copiedAddress && styles.copyBadgeCopied]}>
              <Text style={styles.copyBadgeText}>
                {copiedAddress ? '✓ Copied' : 'Tap to copy'}
              </Text>
            </View>
          </TouchableOpacity>
        </Card>

        <Card title="About Your Identity">
          <Text style={styles.aboutText}>
            Your digital identity is an Ethereum-compatible wallet that uniquely
            identifies you when interacting with Vocdoni services. When you sign
            a petition, your identity address is cryptographically bound to your
            zero-knowledge proof.
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Text style={styles.featureBullet}>•</Text>
              <Text style={styles.featureText}>
                Your identity is protected by your device's security (biometrics/PIN)
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureBullet}>•</Text>
              <Text style={styles.featureText}>
                Only you control your identity through your recovery phrase
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureBullet}>•</Text>
              <Text style={styles.featureText}>
                Your identity can be restored on any device using your 12 words
              </Text>
            </View>
          </View>
        </Card>

        <Card title="Recovery Phrase">
          {!walletInfo?.hasBackedUp && (
            <View style={styles.backupWarning}>
              <Text style={styles.backupWarningIcon}>⚠️</Text>
              <Text style={styles.backupWarningText}>
                You haven't backed up your recovery phrase yet. Without it, you
                cannot recover your identity if you lose access to this device.
              </Text>
            </View>
          )}

          {showingPhrase ? (
            <View style={styles.phraseSection}>
              <MnemonicDisplay
                words={phraseWords}
                onReveal={handleRevealPhrase}
              />
              {phraseWords && countdown > 0 && (
                <View style={styles.countdownContainer}>
                  <Text style={styles.countdownText}>
                    Auto-hiding in {countdown}s
                  </Text>
                </View>
              )}
              <View style={styles.hidePhraseButton}>
                <Button
                  label="Hide Recovery Phrase"
                  onPress={handleHidePhrase}
                  variant="subtle"
                />
              </View>
            </View>
          ) : (
            <View style={styles.phraseSection}>
              <Text style={styles.phraseDescription}>
                Your recovery phrase is 12 words that can restore your identity
                on any device. Keep it secret and never share it with anyone.
              </Text>
              <Button
                label="Show Recovery Phrase"
                onPress={handleShowPhrase}
                variant="primary"
              />
            </View>
          )}
        </Card>

        <View style={styles.securityNote}>
          <Text style={styles.securityIcon}>🛡️</Text>
          <Text style={styles.securityText}>
            Your recovery phrase is stored encrypted on this device and protected
            by your device's security. Vocdoni never has access to your phrase.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  identityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  identityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f5ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  identityEmoji: {
    fontSize: 24,
  },
  identityInfo: {
    flex: 1,
  },
  identityLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  identityDate: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  addressContainer: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: colors.text,
    marginBottom: 8,
  },
  copyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
  },
  copyBadgeCopied: {
    backgroundColor: colors.successLight,
  },
  copyBadgeText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  featureList: {
    gap: 10,
  },
  featureItem: {
    flexDirection: 'row',
  },
  featureBullet: {
    fontSize: 14,
    color: colors.primary,
    marginRight: 8,
    fontWeight: '700',
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  backupWarning: {
    flexDirection: 'row',
    backgroundColor: colors.warningLight,
    padding: 12,
    borderRadius: borderRadius.md,
    marginBottom: 16,
  },
  backupWarningIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  backupWarningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.warningDark,
  },
  phraseSection: {
    gap: 16,
  },
  countdownContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  countdownText: {
    fontSize: 13,
    color: colors.warning,
    fontWeight: '600',
  },
  phraseDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  hidePhraseButton: {
    marginTop: 8,
  },
  securityNote: {
    flexDirection: 'row',
    backgroundColor: colors.successLight,
    padding: 14,
    borderRadius: borderRadius.lg,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#b6e2c6',
  },
  securityIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  securityText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.successDark,
  },
});
