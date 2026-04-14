import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BackButton, Button } from '../../components/common';
import { Card } from '../../components/common/Card';
import { getDocumentLabel } from '../../components/IDCard';
import { Spinner } from '../../components/common/Spinner';
import { colors, commonStyles, borderRadius } from '../../components/common/styles';
import { getIDById, deleteID, type StoredID } from '../../storage/idStorage';
import type { IDsStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<IDsStackParamList, 'IDDetails'>;
type RouteType = RouteProp<IDsStackParamList, 'IDDetails'>;

const COUNTRY_FLAGS: Record<string, string> = {
  ESP: '🇪🇸', DEU: '🇩🇪', FRA: '🇫🇷', ITA: '🇮🇹', GBR: '🇬🇧', USA: '🇺🇸',
  PRT: '🇵🇹', NLD: '🇳🇱', BEL: '🇧🇪', AUT: '🇦🇹', CHE: '🇨🇭', POL: '🇵🇱',
};

const COUNTRY_NAMES: Record<string, string> = {
  ESP: 'Spain', DEU: 'Germany', FRA: 'France', ITA: 'Italy', GBR: 'United Kingdom',
  USA: 'United States', PRT: 'Portugal', NLD: 'Netherlands', BEL: 'Belgium',
  AUT: 'Austria', CHE: 'Switzerland', POL: 'Poland',
};

export function IDDetailsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const [id, setId] = useState<StoredID | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const loadID = useCallback(async () => {
    setLoading(true);
    const data = await getIDById(route.params.id);
    setId(data);
    setLoading(false);
  }, [route.params.id]);

  useEffect(() => {
    loadID();
  }, [loadID]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete ID',
      'Are you sure you want to delete this ID? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            await deleteID(route.params.id);
            navigation.goBack();
          },
        },
      ],
    );
  }, [navigation, route.params.id]);

  if (loading) {
    return <Spinner centered />;
  }

  if (!id) {
    return (
      <View style={commonStyles.safeArea}>
        <ScrollView contentContainerStyle={commonStyles.screenPad}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.errorText}>ID not found</Text>
        </ScrollView>
      </View>
    );
  }

  const flag = COUNTRY_FLAGS[id.issuingCountry] || '🏳️';
  const countryName = COUNTRY_NAMES[id.issuingCountry] || id.issuingCountry;
  const docType = getDocumentLabel(id.issuingCountry, id.mrzDocCode);
  const fullName = `${id.firstName} ${id.lastName}`.trim();
  const addedDate = new Date(id.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView contentContainerStyle={commonStyles.screenPad} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={styles.heroCard}>
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={styles.photoPlaceholderText}>👤</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroFlag}>{flag}</Text>
            <Text style={styles.heroDocType}>{docType.toUpperCase()} - {countryName.toUpperCase()}</Text>
            <Text style={styles.heroName}>{fullName}</Text>
          </View>
        </View>

        <Card title="Personal Information">
          <InfoRow label="Document Number" value={id.documentNumber} />
          <InfoRow label="Nationality" value={id.nationality} />
          <InfoRow label="Date of Birth" value={id.dateOfBirth} />
          <InfoRow label="Gender" value={id.gender || 'N/A'} />
          <InfoRow label="Expiry Date" value={id.expiryDate} />
        </Card>

        <Card title="Technical Details">
          <InfoRow label="Added on" value={addedDate} />
          <InfoRow label="DG1 Size" value={`${Math.round(id.dg1.length * 0.75)} bytes`} />
          <InfoRow label="SOD Size" value={formatBytes(id.sod.length * 0.75)} />
          <InfoRow label="Document Type" value={`${getDocumentLabel(id.issuingCountry, id.mrzDocCode)}${id.mrzDocCode ? ` (${id.mrzDocCode})` : ''}`} />
        </Card>

        <Button
          label={deleting ? 'Deleting...' : 'Delete ID'}
          onPress={handleDelete}
          variant="danger"
          disabled={deleting}
          loading={deleting}
        />
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {return `${Math.round(bytes)} bytes`;}
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: 32,
    opacity: 0.5,
  },
  heroInfo: {
    flex: 1,
    marginLeft: 16,
  },
  heroFlag: {
    fontSize: 32,
    marginBottom: 8,
  },
  heroDocType: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  errorText: {
    fontSize: 16,
    color: colors.error,
    textAlign: 'center',
    marginTop: 40,
  },
});
