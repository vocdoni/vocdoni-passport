import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { colors } from './styles';

const APP_LOGO = require('../../../assets/vocdoni_passport_dark.png');

interface AppHeaderProps {
  showSeparator?: boolean;
}

export function AppHeader({ showSeparator = true }: AppHeaderProps) {
  return (
    <View style={[styles.header, showSeparator && styles.headerWithShadow]}>
      <View style={styles.logoContainer}>
        <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.background,
  },
  headerWithShadow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  logoContainer: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  logo: {
    height: 56,
    width: 224,
  },
});
