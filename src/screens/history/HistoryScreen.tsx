import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/common';
import { colors, borderRadius } from '../../components/common/styles';
import {
  getAllSignatures,
  groupSignaturesByDate,
  type SignatureRecord,
} from '../../storage/historyStorage';

export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSignatures = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllSignatures();
      console.log('[HistoryScreen] Loaded signatures:', data.length);
      setSignatures(data);
    } catch (error) {
      console.error('[HistoryScreen] Failed to load signatures:', error);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSignatures();
    }, [loadSignatures]),
  );

  const groupedSignatures = groupSignaturesByDate(signatures);

  if (!loading && signatures.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <AppHeader />
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSignatures} />}
        >
          <View style={styles.emptyContent}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>📜</Text>
            </View>
            <Text style={styles.emptyTitle}>No signatures yet</Text>
            <Text style={styles.emptySubtitle}>
              Your signed petitions will appear here. Scan a petition QR code to get started.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AppHeader />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSignatures} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.title}>Signature History</Text>
          <Text style={styles.subtitle}>
            {signatures.length} petition{signatures.length !== 1 ? 's' : ''} signed
          </Text>
        </View>

        {Array.from(groupedSignatures.entries()).map(([dateLabel, records]) => (
          <View key={dateLabel} style={styles.section}>
            <Text style={styles.sectionTitle}>{dateLabel}</Text>
            {records.map((record) => (
              <SignatureCard key={record.id} record={record} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SignatureCard({ record }: { record: SignatureRecord }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(record.timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <TouchableOpacity
      style={styles.signatureCard}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.8}
    >
      <View style={styles.signatureHeader}>
        <View style={[styles.statusBadge, record.success ? styles.statusSuccess : styles.statusFailed]}>
          <Text style={[styles.statusIcon, !record.success && styles.statusIconFailed]}>
            {record.success ? '✓' : '✕'}
          </Text>
        </View>
        <View style={styles.signatureInfo}>
          <Text style={styles.serviceName} numberOfLines={1}>
            {record.serviceName || 'Petition'}
          </Text>
          <Text style={styles.signatureMeta}>
            {record.usedIdLabel} · {time}
          </Text>
        </View>
        <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {expanded && (
        <View style={styles.signatureDetails}>
          {record.purpose && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Purpose</Text>
              <Text style={styles.detailValue}>{record.purpose}</Text>
            </View>
          )}
          {record.petitionId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Petition ID</Text>
              <Text style={styles.detailValue} numberOfLines={1}>{record.petitionId}</Text>
            </View>
          )}
          {record.disclosedFields.length > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Disclosed</Text>
              <Text style={styles.detailValue}>{record.disclosedFields.join(', ')}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration</Text>
            <Text style={styles.detailValue}>{(record.durationMs / 1000).toFixed(1)}s</Text>
          </View>
          {record.nullifier && (
            <View style={styles.nullifierBox}>
              <Text style={styles.nullifierLabel}>Nullifier</Text>
              <Text style={styles.nullifierValue} selectable numberOfLines={2}>
                {record.nullifier}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  signatureCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 14,
    marginBottom: 10,
    shadowColor: colors.cardShadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  signatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statusSuccess: {
    backgroundColor: colors.successLight,
  },
  statusFailed: {
    backgroundColor: colors.errorLight,
  },
  statusIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.success,
  },
  statusIconFailed: {
    color: colors.error,
  },
  signatureInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  signatureMeta: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  expandIcon: {
    fontSize: 12,
    color: colors.textMuted,
  },
  signatureDetails: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  nullifierBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: colors.surfaceDark,
    borderRadius: borderRadius.md,
  },
  nullifierLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  nullifierValue: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: colors.text,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyContent: {
    alignItems: 'center',
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyIconText: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
  },
  emptySubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
