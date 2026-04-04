import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { colors } from './styles';

const APP_LOGO = require('../../../assets/logo.png');

interface AppHeaderProps {
  showSeparator?: boolean;
}

export function AppHeader({ showSeparator = true }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.logoContainer}>
        <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
      </View>
      {showSeparator && <View style={styles.separator} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.background,
  },
  logoContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  logo: {
    height: 40,
    width: 160,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 20,
    opacity: 0.6,
  },
});
