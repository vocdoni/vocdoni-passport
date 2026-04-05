import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BackButton, Button } from '../../components/common';
import { MnemonicDisplay } from '../../components/MnemonicDisplay';
import { colors, commonStyles, borderRadius } from '../../components/common/styles';
import { useWallet } from '../../contexts/WalletContext';
import type { WalletStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<WalletStackParamList, 'WalletCreate'>;

export function WalletCreateScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { createNewWallet, markBackedUp } = useWallet();

  const [words, setWords] = useState<string[] | undefined>();
  const [isCreating, setIsCreating] = useState(false);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    createWalletOnMount();
  }, []);

  const createWalletOnMount = async () => {
    setIsCreating(true);
    try {
      const wallet = await createNewWallet();
      if (wallet) {
        setWords(wallet.phrase.split(' '));
        setAddress(wallet.address);
      } else {
        Alert.alert('Error', 'Failed to create wallet. Please try again.');
        navigation.goBack();
      }
    } catch (error) {
      console.error('[WalletCreateScreen] Error creating wallet:', error);
      Alert.alert('Error', 'Failed to create wallet. Please try again.');
      navigation.goBack();
    } finally {
      setIsCreating(false);
    }
  };

  const handleReveal = useCallback(async () => {
    setHasRevealed(true);
  }, []);

  const handleContinue = useCallback(async () => {
    if (!hasRevealed) {
      Alert.alert(
        'Save Your Recovery Phrase',
        'Please reveal and save your recovery phrase before continuing. This is the only way to recover your identity if you lose access to this device.',
        [
          { text: 'Reveal Phrase', onPress: () => {} },
          { text: 'Skip Anyway', style: 'destructive', onPress: () => navigation.navigate('WalletSetupComplete') },
        ]
      );
      return;
    }

    await markBackedUp();
    navigation.navigate('WalletSetupComplete');
  }, [hasRevealed, markBackedUp, navigation]);

  if (isCreating) {
    return (
      <View style={[commonStyles.safeArea, styles.loadingContainer]}>
        <Text style={styles.loadingText}>Creating your identity...</Text>
      </View>
    );
  }

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={commonStyles.pageHeader}>
          <Text style={commonStyles.pageTitle}>Save Your Recovery Phrase</Text>
          <Text style={commonStyles.pageSubtitle}>
            Write down these 12 words in order and store them safely
          </Text>
        </View>

        <MnemonicDisplay
          words={words}
          onReveal={handleReveal}
        />

        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Important Security Notice</Text>
            <Text style={styles.warningText}>
              • Never share your recovery phrase with anyone{'\n'}
              • Store it in a secure location offline{'\n'}
              • Anyone with these words can access your identity{'\n'}
              • Vocdoni will never ask for your recovery phrase
            </Text>
          </View>
        </View>

        {address && (
          <View style={styles.addressBox}>
            <Text style={styles.addressLabel}>Your Address</Text>
            <Text style={styles.addressValue} numberOfLines={1} ellipsizeMode="middle">
              {address}
            </Text>
          </View>
        )}

        <View style={styles.buttons}>
          <Button
            label={hasRevealed ? "I've Saved My Phrase" : 'Continue'}
            onPress={handleContinue}
            variant="primary"
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
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#fff7ed',
    padding: 14,
    borderRadius: borderRadius.lg,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#c2410c',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#c2410c',
  },
  addressBox: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: borderRadius.lg,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressValue: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text,
  },
  buttons: {
    marginTop: 24,
  },
});
