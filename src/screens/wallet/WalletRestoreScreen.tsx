import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Keyboard, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Clipboard from '@react-native-clipboard/clipboard';
import { BackButton, Button } from '../../components/common';
import { colors, commonStyles, borderRadius } from '../../components/common/styles';
import { useWallet } from '../../contexts/WalletContext';
import type { WalletStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<WalletStackParamList, 'WalletRestore'>;

export function WalletRestoreScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { restoreFromPhrase, validateMnemonic } = useWallet();
  
  const [phrase, setPhrase] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePaste = useCallback(async () => {
    const text = await Clipboard.getString();
    if (text) {
      setPhrase(text.trim());
      setError(null);
      Keyboard.dismiss();
    }
  }, []);

  const handleRestore = useCallback(async () => {
    const trimmedPhrase = phrase.trim().toLowerCase();
    
    // Validate word count
    const words = trimmedPhrase.split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError('Recovery phrase must be 12 or 24 words');
      return;
    }

    // Validate mnemonic
    if (!validateMnemonic(trimmedPhrase)) {
      setError('Invalid recovery phrase. Please check your words and try again.');
      return;
    }

    setIsRestoring(true);
    setError(null);

    try {
      const wallet = await restoreFromPhrase(trimmedPhrase);
      if (wallet) {
        navigation.navigate('WalletSetupComplete');
      } else {
        setError('Failed to restore wallet. Please try again.');
      }
    } catch (err) {
      console.error('[WalletRestoreScreen] Error restoring wallet:', err);
      setError('Failed to restore wallet. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  }, [phrase, validateMnemonic, restoreFromPhrase, navigation]);

  const wordCount = phrase.trim() ? phrase.trim().split(/\s+/).length : 0;

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={commonStyles.pageHeader}>
          <Text style={commonStyles.pageTitle}>Restore Your Identity</Text>
          <Text style={commonStyles.pageSubtitle}>
            Enter your 12-word recovery phrase to restore your digital identity
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            multiline
            placeholder="Enter your recovery phrase, separated by spaces..."
            placeholderTextColor={colors.textMuted}
            value={phrase}
            onChangeText={(text) => {
              setPhrase(text);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
          
          <View style={styles.inputFooter}>
            <Text style={styles.wordCount}>
              {wordCount} / 12 words
            </Text>
            <TouchableOpacity onPress={handlePaste} style={styles.pasteButton}>
              <Text style={styles.pasteButtonText}>Paste</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>💡</Text>
          <Text style={styles.infoText}>
            Your recovery phrase is 12 words that were shown when you first 
            created your identity. Enter them in the exact order, separated by spaces.
          </Text>
        </View>

        <View style={styles.buttons}>
          <Button
            label={isRestoring ? "Restoring..." : "Restore Identity"}
            onPress={handleRestore}
            variant="primary"
            disabled={isRestoring || wordCount < 12}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  inputContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  input: {
    minHeight: 160,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    textAlignVertical: 'top',
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  wordCount: {
    fontSize: 13,
    color: colors.textMuted,
  },
  pasteButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
  },
  pasteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: '#fef2f2',
    padding: 14,
    borderRadius: borderRadius.lg,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: colors.error,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: borderRadius.lg,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  buttons: {
    marginTop: 24,
  },
});
