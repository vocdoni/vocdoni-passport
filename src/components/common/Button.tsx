import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { colors, borderRadius as br } from './styles';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'subtle' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        !fullWidth && styles.inline,
      ]}
      onPress={onPress}
      activeOpacity={0.84}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.primary}
        />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.text, styles[`${variant}Text`], isDisabled && styles.disabledText]}>
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <Text style={styles.backLink}>← Back</Text>
    </TouchableOpacity>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Text style={styles.textButton}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: br.lg,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  inline: {
    alignSelf: 'flex-start',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  primaryText: {
    color: '#ffffff',
  },
  secondary: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryText: {
    color: colors.primary,
  },
  subtle: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subtleText: {
    color: colors.textMuted,
  },
  danger: {
    backgroundColor: colors.error,
  },
  dangerText: {
    color: '#ffffff',
  },
  disabled: {
    opacity: 0.52,
  },
  disabledText: {
    color: colors.textMuted,
  },
  backLink: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  textButton: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
