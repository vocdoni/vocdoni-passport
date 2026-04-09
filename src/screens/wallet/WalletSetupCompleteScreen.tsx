import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView } from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/common';
import { colors, commonStyles, borderRadius } from '../../components/common/styles';
import { useWallet } from '../../contexts/WalletContext';
import type { RootStackParamList } from '../../navigation/types';

const APP_LOGO = require('../../../assets/logo.png');

type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function WalletSetupCompleteScreen() {
  const rootNavigation = useNavigation<RootNavigationProp>();
  const { address } = useWallet();
  const insets = useSafeAreaInsets();

  const handleContinue = () => {
    rootNavigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      })
    );
  };

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.successIcon}>
          <Text style={styles.successEmoji}>✓</Text>
        </View>

        <Text style={styles.title}>Identity Created!</Text>

        <Text style={styles.description}>
          Your digital identity has been set up successfully. You can now use
          Vocdoni Passport to sign petitions and verify your identity.
        </Text>

        {address && (
          <View style={styles.addressCard}>
            <Text style={styles.addressLabel}>Your Identity Address</Text>
            <Text style={styles.addressValue} numberOfLines={2}>
              {address}
            </Text>
            <Text style={styles.addressHint}>
              This address uniquely identifies you when signing petitions
            </Text>
          </View>
        )}

        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔐</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Secure & Private</Text>
              <Text style={styles.featureText}>
                Your identity is protected by your device's security
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📝</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Sign Petitions</Text>
              <Text style={styles.featureText}>
                Use zero-knowledge proofs to sign without revealing personal data
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔄</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Recoverable</Text>
              <Text style={styles.featureText}>
                Your 12-word phrase can restore your identity on any device
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.buttons}>
          <Button
            label="Get Started"
            onPress={handleContinue}
            variant="primary"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  logoContainer: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
  },
  logo: {
    width: 120,
    height: 48,
  },
  successIcon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successEmoji: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: '700',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  addressCard: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  addressValue: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: colors.text,
    marginBottom: 8,
  },
  addressHint: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  featureList: {
    gap: 16,
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 14,
    marginTop: 2,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  featureText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  buttons: {
    marginTop: 24,
  },
});
