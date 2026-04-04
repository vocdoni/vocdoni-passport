import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, borderRadius } from './styles';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  dark?: boolean;
  style?: object;
}

export function Card({ title, children, dark, style }: CardProps) {
  return (
    <View style={[styles.card, dark && styles.cardDark, style]}>
      {title ? (
        <Text style={[styles.cardTitle, dark && styles.cardTitleDark]}>{title}</Text>
      ) : null}
      {children}
    </View>
  );
}

export function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

export function Pill({ label, tone }: { label: string; tone: 'success' | 'danger' | 'warning' }) {
  return (
    <View style={[styles.pill, styles[`pill${tone}`]]}>
      <Text style={[styles.pillText, styles[`pill${tone}Text`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: 18,
    marginBottom: 14,
    shadowColor: colors.cardShadow,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardDark: {
    backgroundColor: colors.surfaceDark,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  cardTitleDark: {
    color: colors.textOnDark,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: borderRadius.full,
    backgroundColor: '#eef4ff',
    borderWidth: 1,
    borderColor: '#cfe0ff',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginBottom: 10,
  },
  pillsuccess: {
    backgroundColor: colors.successLight,
  },
  pillsuccessText: {
    color: colors.successDark,
  },
  pilldanger: {
    backgroundColor: colors.errorLight,
  },
  pilldangerText: {
    color: colors.errorDark,
  },
  pillwarning: {
    backgroundColor: colors.warningLight,
  },
  pillwarningText: {
    color: colors.warning,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
});
