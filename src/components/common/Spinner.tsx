import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { colors } from './styles';

interface SpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  centered?: boolean;
}

export function Spinner({ size = 'large', color = colors.primary, centered }: SpinnerProps) {
  if (centered) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size={size} color={color} />
      </View>
    );
  }
  return <ActivityIndicator size={size} color={color} style={size === 'large' ? styles.large : undefined} />;
}

const styles = StyleSheet.create({
  large: {
    marginVertical: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
