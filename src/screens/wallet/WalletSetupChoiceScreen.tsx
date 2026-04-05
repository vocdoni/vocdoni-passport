import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/common';
import { colors, commonStyles, borderRadius } from '../../components/common/styles';
import type { WalletStackParamList } from '../../navigation/types';

const APP_LOGO = require('../../../assets/logo.png');

type NavigationProp = NativeStackNavigationProp<WalletStackParamList, 'WalletSetupChoice'>;

export function WalletSetupChoiceScreen() {
  const navigation = useNavigation<NavigationProp>();

  return (
    <View style={[commonStyles.safeArea, styles.container]}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🔐</Text>
        </View>

        <Text style={styles.title}>Set Up Your Digital Identity</Text>

        <Text style={styles.description}>
          Your digital identity is a secure wallet that will be used to interact
          with Vocdoni services. It's protected by a 12-word recovery phrase that
          only you control.
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>💡</Text>
          <Text style={styles.infoText}>
            Your recovery phrase is the only way to restore your identity.
            Keep it safe and never share it with anyone.
          </Text>
        </View>

        <View style={styles.buttons}>
          <Button
            label="Create New Identity"
            onPress={() => navigation.navigate('WalletCreate')}
            variant="primary"
          />

          <Button
            label="Restore Existing Identity"
            onPress={() => navigation.navigate('WalletRestore')}
            variant="subtle"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
  },
  logoContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 32,
  },
  logo: {
    width: 140,
    height: 56,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f5ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize: 24,
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.warningLight,
    padding: 14,
    borderRadius: borderRadius.lg,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  infoIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.warningDark,
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
});
