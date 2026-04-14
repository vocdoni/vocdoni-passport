import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Button } from '../components/common';
import { colors, commonStyles, borderRadius } from '../components/common/styles';

const APP_LOGO = require('../../assets/vocdoni_passport_dark.png');

interface AuthLockScreenProps {
  onUnlock: () => void;
  biometricsAvailable: boolean;
}

export function AuthLockScreen({ onUnlock, biometricsAvailable }: AuthLockScreenProps) {
  return (
    <View style={[commonStyles.safeArea, styles.container]}>
      <View style={styles.content}>
        <Image source={APP_LOGO} style={styles.logoImage} resizeMode="contain" />

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
  logoImage: {
    width: 180,
    height: 56,
    marginBottom: 40,
  },
  lockIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
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
