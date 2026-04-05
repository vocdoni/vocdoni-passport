import { StyleSheet, Platform, StatusBar } from 'react-native';

export const colors = {
  primary: '#2e6cff',
  primaryLight: '#ecf2ff',
  primaryDark: '#214fb6',

  background: '#f3f6fb',
  surface: '#ffffff',
  surfaceDark: '#111827',

  text: '#0f172a',
  textSecondary: '#51607a',
  textMuted: '#6b7b93',
  textOnDark: '#f8fafc',
  textOnDarkMuted: '#c7d0e2',

  success: '#1f9254',
  successLight: '#e8fbef',
  successDark: '#067647',

  error: '#d92d20',
  errorLight: '#feefef',
  errorDark: '#b42318',

  warning: '#dc6803',
  warningLight: '#fef4e6',
  warningDark: '#b45309',

  border: '#e4ebf8',
  borderLight: '#d7e1f1',

  cardShadow: '#0b1220',
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
    color: '#334155',
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
