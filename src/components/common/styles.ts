import { StyleSheet, Platform, StatusBar } from 'react-native';

export const colors = {
  primary: '#2e6cff',
  primaryLight: 'rgba(46,108,255,0.15)',
  primaryDark: '#214fb6',
  infoLight: 'rgba(46,108,255,0.1)',
  infoBorder: 'rgba(46,108,255,0.2)',

  background: '#0a0f1a',
  surface: '#131929',
  surfaceDark: '#0e1422',

  text: '#f0f4ff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textOnDark: '#f8fafc',
  textOnDarkMuted: '#c7d0e2',

  success: '#1f9254',
  successLight: 'rgba(31,146,84,0.18)',
  successDark: '#4ade80',
  successBorder: 'rgba(31,146,84,0.25)',

  error: '#ef4444',
  errorLight: 'rgba(239,68,68,0.15)',
  errorDark: '#f87171',
  errorBorder: 'rgba(239,68,68,0.25)',

  warning: '#f59e0b',
  warningLight: 'rgba(245,158,11,0.15)',
  warningDark: '#fcd34d',
  warningBorder: 'rgba(245,158,11,0.25)',

  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.05)',

  cardShadow: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const borderRadius = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 22,
  full: 999,
};

export const typography = {
  title: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800' as const,
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  label: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.textSecondary,
  },
};

export const commonStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenPad: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 56,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  },
  pageHeader: {
    marginTop: 8,
    marginBottom: 12,
  },
  pageTitle: {
    ...typography.title,
  },
  pageSubtitle: {
    ...typography.subtitle,
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: {
    flex: 1,
  },
  gap8: {
    gap: 8,
  },
  gap12: {
    gap: 12,
  },
  gap16: {
    gap: 16,
  },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  mt16: { marginTop: 16 },
  mt24: { marginTop: 24 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
});
