import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import type { StoredID } from '../storage/idStorage';
import { colors, borderRadius } from './common/styles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 80;
const CARD_HEIGHT = CARD_WIDTH * 0.58;

interface IDCardProps {
  id: StoredID;
  blurred?: boolean;
  onPress?: () => void;
}

const COUNTRY_FLAGS: Record<string, string> = {
  ESP: '🇪🇸', DEU: '🇩🇪', FRA: '🇫🇷', ITA: '🇮🇹', GBR: '🇬🇧', USA: '🇺🇸',
  PRT: '🇵🇹', NLD: '🇳🇱', BEL: '🇧🇪', AUT: '🇦🇹', CHE: '🇨🇭', POL: '🇵🇱',
  SWE: '🇸🇪', NOR: '🇳🇴', DNK: '🇩🇰', FIN: '🇫🇮', IRL: '🇮🇪', GRC: '🇬🇷',
  CZE: '🇨🇿', HUN: '🇭🇺', ROU: '🇷🇴', BGR: '🇧🇬', HRV: '🇭🇷', SVK: '🇸🇰',
  SVN: '🇸🇮', LTU: '🇱🇹', LVA: '🇱🇻', EST: '🇪🇪', CYP: '🇨🇾', MLT: '🇲🇹',
  LUX: '🇱🇺', ARG: '🇦🇷', BRA: '🇧🇷', MEX: '🇲🇽', CAN: '🇨🇦', AUS: '🇦🇺',
  JPN: '🇯🇵', KOR: '🇰🇷', CHN: '🇨🇳', IND: '🇮🇳', RUS: '🇷🇺', TUR: '🇹🇷',
};

const COUNTRY_NAMES: Record<string, string> = {
  ESP: 'Spain', DEU: 'Germany', FRA: 'France', ITA: 'Italy', GBR: 'United Kingdom',
  USA: 'United States', PRT: 'Portugal', NLD: 'Netherlands', BEL: 'Belgium',
  AUT: 'Austria', CHE: 'Switzerland', POL: 'Poland', SWE: 'Sweden', NOR: 'Norway',
  DNK: 'Denmark', FIN: 'Finland', IRL: 'Ireland', GRC: 'Greece', CZE: 'Czech Republic',
  HUN: 'Hungary', ROU: 'Romania', BGR: 'Bulgaria', HRV: 'Croatia', SVK: 'Slovakia',
  SVN: 'Slovenia', LTU: 'Lithuania', LVA: 'Latvia', EST: 'Estonia', CYP: 'Cyprus',
  MLT: 'Malta', LUX: 'Luxembourg', ARG: 'Argentina', BRA: 'Brazil', MEX: 'Mexico',
  CAN: 'Canada', AUS: 'Australia', JPN: 'Japan', KOR: 'South Korea', CHN: 'China',
  IND: 'India', RUS: 'Russia', TUR: 'Turkey',
};

export function IDCard({ id, blurred = false, onPress }: IDCardProps) {
  const flag = COUNTRY_FLAGS[id.issuingCountry] || '🏳️';
  const countryName = COUNTRY_NAMES[id.issuingCountry] || id.issuingCountry;
  const docType = id.documentType === 'passport' ? 'PASSPORT' : 'ID CARD';
  const maskedDocNum = maskDocumentNumber(id.documentNumber);
  const fullName = `${id.firstName} ${id.lastName}`.trim();

  const content = (
    <View style={styles.card}>
      <View style={styles.cardInner}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.flag}>{flag}</Text>
            <View>
              <Text style={styles.country}>{countryName.toUpperCase()}</Text>
              <Text style={styles.docType}>{docType}</Text>
            </View>
          </View>
          <View style={styles.chipIcon}>
            <Text style={styles.chipText}>◈</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.photoContainer}>
            {id.photo ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${id.photo}` }}
                style={[styles.photo, blurred && styles.blurred]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]}>
                <Text style={styles.photoPlaceholderText}>👤</Text>
              </View>
            )}
          </View>

          <View style={styles.info}>
            <Text style={[styles.name, blurred && styles.blurredText]} numberOfLines={1}>
              {blurred ? '●●●●●●●●●●' : fullName}
            </Text>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.label}>DOC NO.</Text>
                <Text style={[styles.value, blurred && styles.blurredText]}>
                  {blurred ? '●●●●●●' : maskedDocNum}
                </Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.label}>EXPIRES</Text>
                <Text style={[styles.value, blurred && styles.blurredText]}>
                  {blurred ? '●●/●●' : formatExpiry(id.expiryDate)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>NFC VERIFIED</Text>
          <Text style={styles.nationality}>{id.nationality}</Text>
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

export function IDCardCompact({ id, selected, onPress }: { id: StoredID; selected?: boolean; onPress?: () => void }) {
  const flag = COUNTRY_FLAGS[id.issuingCountry] || '🏳️';
  const docType = id.documentType === 'passport' ? 'Passport' : 'ID Card';
  const maskedDocNum = maskDocumentNumber(id.documentNumber);
  const fullName = `${id.firstName} ${id.lastName}`.trim();

  return (
    <TouchableOpacity 
      style={[styles.compactCard, selected && styles.compactCardSelected]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
      <Text style={styles.compactFlag}>{flag}</Text>
      <View style={styles.compactInfo}>
        <Text style={styles.compactTitle}>{id.issuingCountry} {docType}</Text>
        <Text style={styles.compactSubtitle}>{fullName} · {maskedDocNum}</Text>
      </View>
    </TouchableOpacity>
  );
}

function maskDocumentNumber(docNum: string): string {
  if (docNum.length <= 4) return docNum;
  const visible = docNum.slice(-4);
  return `****${visible}`;
}

function formatExpiry(date: string): string {
  if (!date) return 'N/A';
  const parts = date.split('-');
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[0].slice(-2)}`;
  }
  return date;
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cardInner: {
    flex: 1,
    backgroundColor: '#1a1f36',
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flag: {
    fontSize: 22,
    marginRight: 8,
  },
  country: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  docType: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  chipIcon: {
    width: 28,
    height: 20,
    borderRadius: 4,
    backgroundColor: 'rgba(255,215,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    color: '#ffd700',
    fontSize: 12,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  photoContainer: {
    width: 56,
    height: 70,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginRight: 12,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: 24,
    opacity: 0.5,
  },
  blurred: {
    opacity: 0.2,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  blurredText: {
    opacity: 0.3,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  infoItem: {},
  label: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  footerText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  nationality: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '600',
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  compactCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#f0f5ff',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  compactFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  compactInfo: {
    flex: 1,
  },
  compactTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  compactSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
});
