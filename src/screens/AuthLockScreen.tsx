import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Button } from '../components/common';
import { colors, commonStyles, borderRadius } from '../components/common/styles';

const APP_LOGO = require('../../assets/logo.png');

interface AuthLockScreenProps {
  onUnlock: () => void;
  biometricsAvailable: boolean;
}

export function AuthLockScreen({ onUnlock, biometricsAvailable }: AuthLockScreenProps) {
  return (
    <View style={[commonStyles.safeArea, styles.container]}>
      <View style={styles.content}>
        <View style={styles.logoBadge}>
          <Image source={APP_LOGO} style={styles.logoImage} resizeMode="contain" />
        </View>

        <View style={styles.lockIcon}>
          <Text style={styles.lockEmoji}>🔒</Text>
        </View>

        <Text style={styles.title}>App Locked</Text>
        <Text style={styles.subtitle}>
          {biometricsAvailable
            ? 'Use biometrics or your PIN to unlock'
            : 'Enter your PIN to unlock'}
        </Text>

        <Button label="Unlock" onPress={onUnlock} variant="primary" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    alignItems: 'center',
  },
  logoBadge: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  logoImage: {
    width: 120,
    height: 48,
  },
  lockIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f5ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  lockEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
});
