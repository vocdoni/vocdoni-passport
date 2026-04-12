import React, { useMemo } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppHeader, BackButton, Card } from '../components/common';
import { borderRadius, colors, commonStyles, spacing, typography } from '../components/common/styles';
import { APP_BUILD_INFO } from '../generated/buildInfo';
import type { IDsStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<IDsStackParamList, 'About'>;

const WEBSITE_URL = 'https://vocdoni.io';
const GITHUB_URL = 'https://github.com/vocdoni/vocdoni-passport';

export function AboutScreen() {
  const navigation = useNavigation<NavigationProp>();

  const buildLabel = useMemo(() => {
    if (APP_BUILD_INFO.gitRefKind === 'tag') {
      return APP_BUILD_INFO.gitRef;
    }
    return APP_BUILD_INFO.gitRef.slice(0, 7);
  }, []);

  const handleOpenLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open link', url);
    }
  };

  return (
    <View style={commonStyles.safeArea}>
      <AppHeader />
      <ScrollView contentContainerStyle={commonStyles.screenPad} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={commonStyles.pageHeader}>
          <Text style={commonStyles.pageTitle}>About Vocdoni Passport</Text>
          <Text style={commonStyles.pageSubtitle}>
            Private identity proofs for real-world participation, without handing over more personal data than necessary.
          </Text>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>Privacy-first identity</Text>
          <Text style={styles.heroTitle}>Prove what matters. Keep the rest to yourself.</Text>
          <Text style={styles.heroBody}>
            Vocdoni Passport helps you use an NFC passport or identity card to generate proofs about facts such as age or nationality,
            instead of sharing the whole document.
          </Text>
          <View style={styles.versionRow}>
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeLabel}>Version</Text>
              <Text style={styles.versionBadgeValue}>{APP_BUILD_INFO.version}</Text>
            </View>
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeLabel}>
                {APP_BUILD_INFO.gitRefKind === 'tag' ? 'Release' : 'Build'}
              </Text>
              <Text style={styles.versionBadgeValue}>{buildLabel}</Text>
            </View>
          </View>
        </View>

        <Card title="What The App Does">
          <Text style={styles.cardText}>
            You scan a compatible document, keep it encrypted on your phone, and use it to answer requests from services that need limited proof.
          </Text>
          <Text style={styles.cardText}>
            Instead of uploading your full ID, you can share only the specific attribute the service asks for.
          </Text>
        </Card>

        <Card title="How Privacy Is Protected">
          <Text style={styles.cardText}>
            The app uses zero-knowledge proofs. In simple terms, that means it can prove a statement is true without exposing all the data behind it.
          </Text>
          <Text style={styles.cardText}>
            For example, a service can verify that you are eligible to sign a petition without seeing your full document image or all document fields.
          </Text>
        </Card>

        <Card title="How Security Works">
          <Text style={styles.cardText}>
            Your identity data stays encrypted on your device. Access is protected with your device security and your private key stays under your control.
          </Text>
          <Text style={styles.cardText}>
            The app reads the secure chip from supported documents, so the proof is based on authentic document data rather than a manual form entry.
          </Text>
        </Card>

        <Card title="Why Decentralization Matters">
          <Text style={styles.cardText}>
            Vocdoni is built to reduce dependence on centralized identity databases and opaque gatekeepers.
          </Text>
          <Text style={styles.cardText}>
            That makes it easier to build participation flows, such as voting or petition signing, with stronger privacy and less unnecessary data collection.
          </Text>
        </Card>

        <Card title="Learn More">
          <TouchableOpacity style={styles.linkRow} onPress={() => handleOpenLink(WEBSITE_URL)} activeOpacity={0.8}>
            <View>
              <Text style={styles.linkTitle}>vocdoni.io</Text>
              <Text style={styles.linkText}>Project website and product overview</Text>
            </View>
            <Text style={styles.linkArrow}>↗</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.linkRow, styles.linkRowLast]} onPress={() => handleOpenLink(GITHUB_URL)} activeOpacity={0.8}>
            <View>
              <Text style={styles.linkTitle}>Open-source repository</Text>
              <Text style={styles.linkText}>Source code, issues and release history</Text>
            </View>
            <Text style={styles.linkArrow}>↗</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#13213f',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroKicker: {
    color: '#c7d8ff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  heroBody: {
    color: '#d9e3fb',
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.md,
  },
  versionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  versionBadge: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  versionBadgeLabel: {
    color: '#c7d8ff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  versionBadgeValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  cardText: {
    ...typography.body,
    marginBottom: spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  linkText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    marginTop: 2,
  },
  linkArrow: {
    fontSize: 20,
    color: colors.primary,
    marginLeft: spacing.md,
  },
});
