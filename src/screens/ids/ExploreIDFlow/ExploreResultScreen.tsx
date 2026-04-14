import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Buffer } from 'buffer';
import { BackButton } from '../../../components/common';
import { Card } from '../../../components/common/Card';
import { colors, commonStyles, borderRadius } from '../../../components/common/styles';
import type { IDsStackParamList } from '../../../navigation/types';

/* eslint-disable no-bitwise, no-control-regex -- BER-TLV parsing and stripping control chars in debug text */

type NavigationProp = NativeStackNavigationProp<IDsStackParamList, 'ExploreIDResult'>;
type RouteType = RouteProp<IDsStackParamList, 'ExploreIDResult'>;

interface ParsedData {
  mrz: string;
  mrzFields: {
    documentType: string;
    issuingCountry: string;
    lastName: string;
    firstName: string;
    documentNumber: string;
    nationality: string;
    dateOfBirth: string;
    gender: string;
    expiryDate: string;
    optionalData1?: string;
    optionalData2?: string;
  };
  signature?: string;
  dg1Raw: string;
  dg2Raw?: string;
  dg7Raw?: string;
  dg11Raw?: string;
  dg12Raw?: string;
  dg13Raw?: string;
  dg14Raw?: string;
  dg15Raw?: string;
  dg11Parsed?: {
    fullNameOfHolder?: string;      // Full name (may include parents)
    otherNames?: string[];          // Other/alias names
    personalNumber?: string;        // National ID number
    placeOfBirth?: string;          // Place of birth
    permanentAddress?: string;      // Permanent address (Domicilio)
    fullDateOfBirth?: string;       // Full date of birth YYYYMMDD
    telephone?: string;             // Phone number
    profession?: string;            // Profession/occupation
    title?: string;                 // Title (Dr., Mr., etc.)
    personalSummary?: string;       // Personal summary text
    custodyInfo?: string;           // Custody information
  };
  dg12Parsed?: {
    issuingAuthority?: string;
    dateOfIssue?: string;
    otherPersons?: string[];
    endorsements?: string;
    taxOrExitRequirements?: string;
  };
  sodInfo: {
    hashAlgorithm: string;
    signatureAlgorithm: string;
    dataGroupHashes: Array<{ dg: number; hash: string }>;
    certificateSubject?: string;
    certificateIssuer?: string;
    certificateSerial?: string;
    certificateNotBefore?: string;
    certificateNotAfter?: string;
  };
}

function extractMrzFromDG1(dg1Base64: string): string {
  try {
    const dg1 = Buffer.from(dg1Base64, 'base64');
    for (let i = 0; i < dg1.length - 2; i++) {
      if (dg1[i] === 0x5f && dg1[i + 1] === 0x1f) {
        const len = dg1[i + 2];
        const start = i + 3;
        if (start + len <= dg1.length) {
          return dg1.slice(start, start + len).toString('ascii');
        }
      }
    }
    return dg1.toString('ascii');
  } catch {
    return '';
  }
}

function parseMrz(mrz: string): ParsedData['mrzFields'] {
  const clean = mrz.replace(/\n/g, '').replace(/ /g, '');

  if (clean.length >= 88 && (clean[0] === 'P' || clean[0] === 'V')) {
    const names = clean.slice(5, 44).split('<<');
    return {
      documentType: clean[0] === 'P' ? 'Passport' : 'Visa',
      issuingCountry: clean.slice(2, 5).replace(/</g, ''),
      lastName: (names[0] || '').replace(/</g, ' ').trim(),
      firstName: (names[1] || '').replace(/</g, ' ').trim(),
      documentNumber: clean.slice(44, 53).replace(/</g, ''),
      nationality: clean.slice(54, 57).replace(/</g, ''),
      dateOfBirth: formatDate(clean.slice(57, 63)),
      gender: clean.slice(64, 65).replace(/</g, ''),
      expiryDate: formatDate(clean.slice(65, 71)),
      optionalData1: clean.slice(71, 85).replace(/</g, ' ').trim() || undefined,
    };
  }

  const line1 = clean.slice(0, 30);
  const line2 = clean.slice(30, 60);
  const line3 = clean.slice(60, 90);
  const names = line3.split('<<');

  return {
    documentType: line1[0] === 'I' ? 'ID Card' : line1[0] === 'A' ? 'ID Card (Type A)' : 'Travel Document',
    issuingCountry: line1.slice(2, 5).replace(/</g, ''),
    lastName: (names[0] || '').replace(/</g, ' ').trim(),
    firstName: (names[1] || '').replace(/</g, ' ').trim(),
    documentNumber: line1.slice(5, 14).replace(/</g, ''),
    nationality: line2.slice(15, 18).replace(/</g, ''),
    dateOfBirth: formatDate(line2.slice(0, 6)),
    gender: line2.slice(7, 8).replace(/</g, ''),
    expiryDate: formatDate(line2.slice(8, 14)),
    optionalData1: line1.slice(15, 30).replace(/</g, ' ').trim() || undefined,
    optionalData2: line2.slice(18, 29).replace(/</g, ' ').trim() || undefined,
  };
}

function formatDate(yymmdd: string): string {
  if (yymmdd.length !== 6) {return yymmdd;}
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const year = yy >= 50 ? 1900 + yy : 2000 + yy;
  return `${year}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

function findSequence(buffer: Buffer, sequence: number[], startFrom = 0): number {
  for (let i = startFrom; i <= buffer.length - sequence.length; i++) {
    let found = true;
    for (let j = 0; j < sequence.length; j++) {
      if (buffer[i + j] !== sequence[j]) {
        found = false;
        break;
      }
    }
    if (found) {return i;}
  }
  return -1;
}

function extractImageFromDG7(dg7Base64?: string): string | undefined {
  if (!dg7Base64) {return undefined;}
  try {
    const dg7 = Buffer.from(dg7Base64, 'base64');
    const jpegStart = findSequence(dg7, [0xff, 0xd8, 0xff]);
    if (jpegStart >= 0) {
      const jpegEnd = findSequence(dg7, [0xff, 0xd9], jpegStart);
      if (jpegEnd >= 0) {
        return dg7.slice(jpegStart, jpegEnd + 2).toString('base64');
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// DG11 Tag definitions according to ICAO 9303 Part 10 and JMRTD
// Reference: https://javadoc.io/doc/org.jmrtd/jmrtd/0.5.0/constant-values.html
const DG11_TAGS: Record<number, string> = {
  0x5f0e: 'fullNameOfHolder',       // FULL_NAME_TAG (24334)
  0x5f0f: 'otherNames',             // OTHER_NAME_TAG (24335)
  0x5f10: 'personalNumber',         // PERSONAL_NUMBER_TAG (24336)
  0x5f11: 'placeOfBirth',           // PLACE_OF_BIRTH_TAG (24337)
  0x5f12: 'telephone',              // TELEPHONE_TAG (24338)
  0x5f13: 'profession',             // PROFESSION_TAG (24339)
  0x5f14: 'title',                  // TITLE_TAG (24340)
  0x5f15: 'personalSummary',        // PERSONAL_SUMMARY_TAG (24341)
  0x5f16: 'proofOfCitizenship',     // PROOF_OF_CITIZENSHIP_TAG (24342) - Image
  0x5f17: 'otherTravelDocNumbers',  // OTHER_VALID_TD_NUMBERS_TAG (24343)
  0x5f18: 'custodyInfo',            // CUSTODY_INFORMATION_TAG (24344)
  0x5f2b: 'fullDateOfBirth',        // FULL_DATE_OF_BIRTH_TAG (24363) - YYYYMMDD
  0x5f42: 'permanentAddress',       // PERMANENT_ADDRESS_TAG (24386) - Domicilio
};

// DG12 Tag definitions according to ICAO 9303
const DG12_TAGS: Record<number, string> = {
  0x5f19: 'issuingAuthority',
  0x5f26: 'dateOfIssue',
  0x5f1a: 'otherPersons',
  0x5f1b: 'endorsements',
  0x5f1c: 'taxOrExitRequirements',
  0x5f55: 'imageOfFront',
  0x5f56: 'imageOfRear',
  0x5c:   'dateAndTimeOfPersonalization',
  0x5f57: 'personalizationSystemSerialNumber',
};

function parseTLV(data: Buffer, offset: number): { tag: number; length: number; value: Buffer; nextOffset: number } | null {
  if (offset >= data.length) {return null;}

  let tag = data[offset];
  let tagLen = 1;

  // Multi-byte tag
  if ((tag & 0x1f) === 0x1f) {
    tag = (tag << 8) | data[offset + 1];
    tagLen = 2;
    if (data[offset + 1] & 0x80) {
      tag = (tag << 8) | data[offset + 2];
      tagLen = 3;
    }
  }

  let lenOffset = offset + tagLen;
  if (lenOffset >= data.length) {return null;}

  let length = data[lenOffset];
  let lenBytes = 1;

  if (length & 0x80) {
    const numLenBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < numLenBytes; i++) {
      length = (length << 8) | data[lenOffset + 1 + i];
    }
    lenBytes = 1 + numLenBytes;
  }

  const valueOffset = lenOffset + lenBytes;
  if (valueOffset + length > data.length) {return null;}

  return {
    tag,
    length,
    value: data.slice(valueOffset, valueOffset + length),
    nextOffset: valueOffset + length,
  };
}

function parseAllTLVs(data: Buffer): Array<{ tag: number; value: Buffer }> {
  const results: Array<{ tag: number; value: Buffer }> = [];
  let offset = 0;

  while (offset < data.length) {
    const tlv = parseTLV(data, offset);
    if (!tlv) {break;}
    results.push({ tag: tlv.tag, value: tlv.value });
    offset = tlv.nextOffset;
  }

  return results;
}

function parseDG11(dg11Base64?: string): ParsedData['dg11Parsed'] | undefined {
  if (!dg11Base64) {return undefined;}
  try {
    const dg11 = Buffer.from(dg11Base64, 'base64');
    const result: ParsedData['dg11Parsed'] = {};

    // Skip the outer tag (usually 0x6B for DG11)
    let dataStart = 0;
    if (dg11[0] === 0x6b || dg11[0] === 0x6B) {
      const outerTlv = parseTLV(dg11, 0);
      if (outerTlv) {
        dataStart = dg11.length - outerTlv.length;
      }
    }

    const tlvs = parseAllTLVs(dg11.slice(dataStart));

    for (const { tag, value } of tlvs) {
      const fieldName = DG11_TAGS[tag];
      if (!fieldName) {continue;}

      const strValue = value.toString('utf8').replace(/</g, ' ').trim();

      switch (fieldName) {
        case 'fullNameOfHolder':
          result.fullNameOfHolder = strValue;
          break;
        case 'otherNames':
          if (!result.otherNames) {result.otherNames = [];}
          result.otherNames.push(strValue);
          break;
        case 'personalNumber':
          result.personalNumber = strValue;
          break;
        case 'placeOfBirth':
          result.placeOfBirth = strValue;
          break;
        case 'permanentAddress':
          result.permanentAddress = strValue;
          break;
        case 'fullDateOfBirth':
          result.fullDateOfBirth = strValue;
          break;
        case 'telephone':
          result.telephone = strValue;
          break;
        case 'profession':
          result.profession = strValue;
          break;
        case 'title':
          result.title = strValue;
          break;
        case 'personalSummary':
          result.personalSummary = strValue;
          break;
        case 'custodyInfo':
          result.custodyInfo = strValue;
          break;
      }
    }

    // Fallback: try to extract readable text if TLV parsing found nothing
    if (Object.keys(result).length === 0) {
      const textContent = dg11.toString('utf8').replace(/[\x00-\x1f]/g, ' ').replace(/</g, ' ').trim();
      if (textContent.length > 5) {
        result.personalSummary = textContent;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  } catch (e) {
    console.warn('Failed to parse DG11:', e);
    return undefined;
  }
}

function parseDG12(dg12Base64?: string): ParsedData['dg12Parsed'] | undefined {
  if (!dg12Base64) {return undefined;}
  try {
    const dg12 = Buffer.from(dg12Base64, 'base64');
    const result: ParsedData['dg12Parsed'] = {};

    // Skip the outer tag (usually 0x6C for DG12)
    let dataStart = 0;
    if (dg12[0] === 0x6c || dg12[0] === 0x6C) {
      const outerTlv = parseTLV(dg12, 0);
      if (outerTlv) {
        dataStart = dg12.length - outerTlv.length;
      }
    }

    const tlvs = parseAllTLVs(dg12.slice(dataStart));

    for (const { tag, value } of tlvs) {
      const fieldName = DG12_TAGS[tag];
      if (!fieldName) {continue;}

      const strValue = value.toString('utf8').replace(/</g, ' ').trim();

      switch (fieldName) {
        case 'issuingAuthority':
          result.issuingAuthority = strValue;
          break;
        case 'dateOfIssue':
          result.dateOfIssue = strValue;
          break;
        case 'otherPersons':
          if (!result.otherPersons) {result.otherPersons = [];}
          result.otherPersons.push(strValue);
          break;
        case 'endorsements':
          result.endorsements = strValue;
          break;
        case 'taxOrExitRequirements':
          result.taxOrExitRequirements = strValue;
          break;
      }
    }

    // Fallback: try to extract readable text if TLV parsing found nothing
    if (Object.keys(result).length === 0) {
      const textContent = dg12.toString('utf8').replace(/[\x00-\x1f]/g, ' ').replace(/</g, ' ').trim();
      if (textContent.length > 5) {
        result.issuingAuthority = textContent;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  } catch (e) {
    console.warn('Failed to parse DG12:', e);
    return undefined;
  }
}

function parseSOD(sodBase64: string): ParsedData['sodInfo'] {
  const info: ParsedData['sodInfo'] = {
    hashAlgorithm: 'Unknown',
    signatureAlgorithm: 'Unknown',
    dataGroupHashes: [],
  };

  try {
    const sod = Buffer.from(sodBase64, 'base64');

    if (sod.includes(Buffer.from('SHA-256')) || sod.includes(Buffer.from([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]))) {
      info.hashAlgorithm = 'SHA-256';
    } else if (sod.includes(Buffer.from('SHA-1')) || sod.includes(Buffer.from([0x2b, 0x0e, 0x03, 0x02, 0x1a]))) {
      info.hashAlgorithm = 'SHA-1';
    } else if (sod.includes(Buffer.from('SHA-384'))) {
      info.hashAlgorithm = 'SHA-384';
    } else if (sod.includes(Buffer.from('SHA-512'))) {
      info.hashAlgorithm = 'SHA-512';
    }

    if (sod.includes(Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]))) {
      info.signatureAlgorithm = 'RSA-SHA256';
    } else if (sod.includes(Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x05]))) {
      info.signatureAlgorithm = 'RSA-SHA1';
    } else if (sod.includes(Buffer.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]))) {
      info.signatureAlgorithm = 'ECDSA-SHA256';
    } else if (sod.includes(Buffer.from([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x03]))) {
      info.signatureAlgorithm = 'ECDSA-SHA384';
    }

  } catch (e) {
    console.warn('Failed to parse SOD:', e);
  }

  return info;
}

export function ExploreResultScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const { dg1, sod, dg2, dg7, dg11, dg12, dg13, dg14, dg15 } = route.params;

  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['mrz']));

  useEffect(() => {
    const mrz = extractMrzFromDG1(dg1);
    const mrzFields = parseMrz(mrz);
    const signature = extractImageFromDG7(dg7);
    const sodInfo = parseSOD(sod);
    const dg11Parsed = parseDG11(dg11);
    const dg12Parsed = parseDG12(dg12);

    setParsed({
      mrz,
      mrzFields,
      signature,
      dg1Raw: dg1,
      dg2Raw: dg2,
      dg7Raw: dg7,
      dg11Raw: dg11,
      dg12Raw: dg12,
      dg13Raw: dg13,
      dg14Raw: dg14,
      dg15Raw: dg15,
      dg11Parsed,
      dg12Parsed,
      sodInfo,
    });
  }, [dg1, sod, dg2, dg7, dg11, dg12, dg13, dg14, dg15]); // dg2 kept for raw data display

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const copyToClipboard = (label: string, value: string) => {
    Clipboard.setString(value);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  if (!parsed) {
    return (
      <View style={commonStyles.safeArea}>
        <Text style={styles.loading}>Parsing document data...</Text>
      </View>
    );
  }

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => navigation.popToTop()} />

        <View style={commonStyles.pageHeader}>
          <Text style={commonStyles.pageTitle}>🔬 ID Explorer</Text>
          <Text style={commonStyles.pageSubtitle}>
            Raw document data (debug mode)
          </Text>
        </View>

        <View style={styles.warningBanner}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>
            This data is NOT stored. Close this screen to discard.
          </Text>
        </View>

        {/* Data Groups Found Summary */}
        <View style={styles.dgSummaryBox}>
          <Text style={styles.dgSummaryTitle}>Data Groups Found:</Text>
          <View style={styles.dgBadgeContainer}>
            <View style={[styles.dgBadge, styles.dgBadgePresent]}><Text style={styles.dgBadgeText}>DG1</Text></View>
            <View style={[styles.dgBadge, dg2 ? styles.dgBadgePresent : styles.dgBadgeMissing]}><Text style={styles.dgBadgeText}>DG2</Text></View>
            <View style={[styles.dgBadge, parsed.dg7Raw ? styles.dgBadgePresent : styles.dgBadgeMissing]}><Text style={styles.dgBadgeText}>DG7</Text></View>
            <View style={[styles.dgBadge, parsed.dg11Raw ? styles.dgBadgePresent : styles.dgBadgeMissing]}><Text style={styles.dgBadgeText}>DG11</Text></View>
            <View style={[styles.dgBadge, parsed.dg12Raw ? styles.dgBadgePresent : styles.dgBadgeMissing]}><Text style={styles.dgBadgeText}>DG12</Text></View>
            <View style={[styles.dgBadge, parsed.dg13Raw ? styles.dgBadgePresent : styles.dgBadgeMissing]}><Text style={styles.dgBadgeText}>DG13</Text></View>
            <View style={[styles.dgBadge, parsed.dg14Raw ? styles.dgBadgePresent : styles.dgBadgeMissing]}><Text style={styles.dgBadgeText}>DG14</Text></View>
            <View style={[styles.dgBadge, parsed.dg15Raw ? styles.dgBadgePresent : styles.dgBadgeMissing]}><Text style={styles.dgBadgeText}>DG15</Text></View>
            <View style={[styles.dgBadge, sod ? styles.dgBadgePresent : styles.dgBadgeMissing]}><Text style={styles.dgBadgeText}>SOD</Text></View>
          </View>
          <Text style={styles.dgSummaryNote}>
            Green = present, Gray = not found or not accessible
          </Text>
        </View>

        {/* MRZ Section */}
        <CollapsibleSection
          title="📄 MRZ Data"
          expanded={expandedSections.has('mrz')}
          onToggle={() => toggleSection('mrz')}
        >
          <View style={styles.mrzBox}>
            <Text style={styles.mrzText}>{parsed.mrz}</Text>
          </View>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={() => copyToClipboard('MRZ', parsed.mrz)}
          >
            <Text style={styles.copyButtonText}>Copy MRZ</Text>
          </TouchableOpacity>
        </CollapsibleSection>

        {/* Parsed Fields */}
        <CollapsibleSection
          title="🧾 Parsed Fields"
          expanded={expandedSections.has('fields')}
          onToggle={() => toggleSection('fields')}
        >
          <DataRow label="Document Type" value={parsed.mrzFields.documentType} />
          <DataRow label="Issuing Country" value={parsed.mrzFields.issuingCountry} />
          <DataRow label="Last Name" value={parsed.mrzFields.lastName} />
          <DataRow label="First Name" value={parsed.mrzFields.firstName} />
          <DataRow label="Document Number" value={parsed.mrzFields.documentNumber} />
          <DataRow label="Nationality" value={parsed.mrzFields.nationality} />
          <DataRow label="Date of Birth" value={parsed.mrzFields.dateOfBirth} />
          <DataRow label="Gender" value={parsed.mrzFields.gender || 'Not specified'} />
          <DataRow label="Expiry Date" value={parsed.mrzFields.expiryDate} />
          {parsed.mrzFields.optionalData1 && (
            <DataRow label="Optional Data 1" value={parsed.mrzFields.optionalData1} />
          )}
          {parsed.mrzFields.optionalData2 && (
            <DataRow label="Optional Data 2" value={parsed.mrzFields.optionalData2} />
          )}
        </CollapsibleSection>

        {/* SOD Info */}
        <CollapsibleSection
          title="🔐 Security Object (SOD)"
          expanded={expandedSections.has('sod')}
          onToggle={() => toggleSection('sod')}
        >
          <DataRow label="Hash Algorithm" value={parsed.sodInfo.hashAlgorithm} />
          <DataRow label="Signature Algorithm" value={parsed.sodInfo.signatureAlgorithm} />
          <View style={styles.rawDataSection}>
            <Text style={styles.rawDataLabel}>Raw SOD (Base64):</Text>
            <Text style={styles.rawDataPreview} numberOfLines={3}>
              {sod.slice(0, 200)}...
            </Text>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => copyToClipboard('SOD', sod)}
            >
              <Text style={styles.copyButtonText}>Copy Full SOD ({sod.length} chars)</Text>
            </TouchableOpacity>
          </View>
        </CollapsibleSection>

        {/* Signature (DG7) */}
        {parsed.signature && (
          <CollapsibleSection
            title="✍️ Signature (DG7)"
            expanded={expandedSections.has('signature')}
            onToggle={() => toggleSection('signature')}
          >
            <View style={styles.photoContainer}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${parsed.signature}` }}
                style={styles.signatureImage}
                resizeMode="contain"
              />
            </View>
          </CollapsibleSection>
        )}

        {/* Additional Personal Details (DG11) */}
        {(parsed.dg11Raw || parsed.dg11Parsed) && (
          <CollapsibleSection
            title="👤 Additional Personal (DG11)"
            expanded={expandedSections.has('dg11')}
            onToggle={() => toggleSection('dg11')}
          >
            <Text style={styles.dgDescription}>
              Contains additional personal details like place of birth, parents' names, address
            </Text>
            {parsed.dg11Parsed?.fullNameOfHolder && (
              <DataRow label="Full Name" value={parsed.dg11Parsed.fullNameOfHolder} />
            )}
            {parsed.dg11Parsed?.otherNames && parsed.dg11Parsed.otherNames.length > 0 && (
              <DataRow label="Other Names" value={parsed.dg11Parsed.otherNames.join(', ')} />
            )}
            {parsed.dg11Parsed?.title && (
              <DataRow label="Title" value={parsed.dg11Parsed.title} />
            )}
            {parsed.dg11Parsed?.fullDateOfBirth && (
              <DataRow label="Full Date of Birth" value={parsed.dg11Parsed.fullDateOfBirth} />
            )}
            {parsed.dg11Parsed?.placeOfBirth && (
              <DataRow label="Place of Birth" value={parsed.dg11Parsed.placeOfBirth} />
            )}
            {parsed.dg11Parsed?.permanentAddress && (
              <DataRow label="Permanent Address (Domicilio)" value={parsed.dg11Parsed.permanentAddress} />
            )}
            {parsed.dg11Parsed?.telephone && (
              <DataRow label="Telephone" value={parsed.dg11Parsed.telephone} />
            )}
            {parsed.dg11Parsed?.personalNumber && (
              <DataRow label="Personal/National ID" value={parsed.dg11Parsed.personalNumber} />
            )}
            {parsed.dg11Parsed?.profession && (
              <DataRow label="Profession" value={parsed.dg11Parsed.profession} />
            )}
            {parsed.dg11Parsed?.custodyInfo && (
              <DataRow label="Custody Info" value={parsed.dg11Parsed.custodyInfo} />
            )}
            {parsed.dg11Parsed?.personalSummary && (
              <DataRow label="Summary/Other" value={parsed.dg11Parsed.personalSummary} />
            )}
            {parsed.dg11Raw && (
              <>
                <Text style={[styles.rawDataLabel, styles.rawDataLabelMarginTop12]}>Raw Data (hex preview):</Text>
                <Text style={styles.rawDataPreview} numberOfLines={2}>
                  {Buffer.from(parsed.dg11Raw, 'base64').toString('hex').slice(0, 100)}...
                </Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => copyToClipboard('DG11', parsed.dg11Raw!)}
                >
                  <Text style={styles.copyButtonText}>Copy Base64 ({parsed.dg11Raw.length} chars)</Text>
                </TouchableOpacity>
              </>
            )}
          </CollapsibleSection>
        )}

        {/* Additional Document Details (DG12) */}
        {(parsed.dg12Raw || parsed.dg12Parsed) && (
          <CollapsibleSection
            title="📋 Additional Document (DG12)"
            expanded={expandedSections.has('dg12')}
            onToggle={() => toggleSection('dg12')}
          >
            <Text style={styles.dgDescription}>
              Contains document issuance details, endorsements, and other document-specific data
            </Text>
            {parsed.dg12Parsed?.issuingAuthority && (
              <DataRow label="Issuing Authority" value={parsed.dg12Parsed.issuingAuthority} />
            )}
            {parsed.dg12Parsed?.dateOfIssue && (
              <DataRow label="Date of Issue" value={parsed.dg12Parsed.dateOfIssue} />
            )}
            {parsed.dg12Parsed?.otherPersons && parsed.dg12Parsed.otherPersons.length > 0 && (
              <DataRow label="Other Persons" value={parsed.dg12Parsed.otherPersons.join(', ')} />
            )}
            {parsed.dg12Parsed?.endorsements && (
              <DataRow label="Endorsements" value={parsed.dg12Parsed.endorsements} />
            )}
            {parsed.dg12Parsed?.taxOrExitRequirements && (
              <DataRow label="Tax/Exit Requirements" value={parsed.dg12Parsed.taxOrExitRequirements} />
            )}
            {parsed.dg12Raw && (
              <>
                <Text style={[styles.rawDataLabel, styles.rawDataLabelMarginTop12]}>Raw Data (hex preview):</Text>
                <Text style={styles.rawDataPreview} numberOfLines={2}>
                  {Buffer.from(parsed.dg12Raw, 'base64').toString('hex').slice(0, 100)}...
                </Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => copyToClipboard('DG12', parsed.dg12Raw!)}
                >
                  <Text style={styles.copyButtonText}>Copy Base64 ({parsed.dg12Raw.length} chars)</Text>
                </TouchableOpacity>
              </>
            )}
          </CollapsibleSection>
        )}

        {/* Optional Details (DG13) */}
        {parsed.dg13Raw && (
          <CollapsibleSection
            title="📝 Optional Details (DG13)"
            expanded={expandedSections.has('dg13')}
            onToggle={() => toggleSection('dg13')}
          >
            <Text style={styles.dgDescription}>
              Country-specific optional data (format varies by issuing country)
            </Text>
            {(() => {
              try {
                const dg13Text = Buffer.from(parsed.dg13Raw!, 'base64')
                  .toString('utf8')
                  .replace(/[\x00-\x1f]/g, ' ')
                  .replace(/</g, ' ')
                  .trim();
                if (dg13Text.length > 5 && /[a-zA-Z]/.test(dg13Text)) {
                  return <DataRow label="Content" value={dg13Text.slice(0, 500)} />;
                }
                return null;
              } catch { return null; }
            })()}
            <Text style={[styles.rawDataLabel, styles.rawDataLabelMarginTop8]}>Raw Data (hex preview):</Text>
            <Text style={styles.rawDataPreview} numberOfLines={3}>
              {Buffer.from(parsed.dg13Raw, 'base64').toString('hex').slice(0, 150)}...
            </Text>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => copyToClipboard('DG13', parsed.dg13Raw!)}
            >
              <Text style={styles.copyButtonText}>Copy Base64 ({parsed.dg13Raw.length} chars)</Text>
            </TouchableOpacity>
          </CollapsibleSection>
        )}

        {/* Security Options (DG14) */}
        {parsed.dg14Raw && (
          <CollapsibleSection
            title="🔑 Security Options (DG14)"
            expanded={expandedSections.has('dg14')}
            onToggle={() => toggleSection('dg14')}
          >
            <Text style={styles.dgDescription}>
              Contains PACE and Chip Authentication parameters
            </Text>
            <Text style={styles.rawDataPreview} numberOfLines={3}>
              {parsed.dg14Raw.slice(0, 200)}...
            </Text>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => copyToClipboard('DG14', parsed.dg14Raw!)}
            >
              <Text style={styles.copyButtonText}>Copy DG14 ({parsed.dg14Raw.length} chars)</Text>
            </TouchableOpacity>
          </CollapsibleSection>
        )}

        {/* Active Authentication Key (DG15) */}
        {parsed.dg15Raw && (
          <CollapsibleSection
            title="🔐 AA Public Key (DG15)"
            expanded={expandedSections.has('dg15')}
            onToggle={() => toggleSection('dg15')}
          >
            <Text style={styles.dgDescription}>
              Active Authentication public key for chip authenticity verification
            </Text>
            <Text style={styles.rawDataPreview} numberOfLines={3}>
              {parsed.dg15Raw.slice(0, 200)}...
            </Text>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => copyToClipboard('DG15', parsed.dg15Raw!)}
            >
              <Text style={styles.copyButtonText}>Copy DG15 ({parsed.dg15Raw.length} chars)</Text>
            </TouchableOpacity>
          </CollapsibleSection>
        )}

        {/* Raw Data Groups Section */}
        <CollapsibleSection
          title="📦 Raw Data Groups"
          expanded={expandedSections.has('rawDGs')}
          onToggle={() => toggleSection('rawDGs')}
        >
          <DataRow label="DG1 (MRZ)" value={`${dg1.length} chars`} />
          {dg2 && <DataRow label="DG2 (Photo)" value={`${dg2.length} chars`} />}
          {parsed.dg7Raw && <DataRow label="DG7 (Signature)" value={`${parsed.dg7Raw.length} chars`} />}
          {parsed.dg11Raw && <DataRow label="DG11 (Personal)" value={`${parsed.dg11Raw.length} chars`} />}
          {parsed.dg12Raw && <DataRow label="DG12 (Document)" value={`${parsed.dg12Raw.length} chars`} />}
          {parsed.dg13Raw && <DataRow label="DG13 (Optional)" value={`${parsed.dg13Raw.length} chars`} />}
          {parsed.dg14Raw && <DataRow label="DG14 (Security)" value={`${parsed.dg14Raw.length} chars`} />}
          {parsed.dg15Raw && <DataRow label="DG15 (AA Key)" value={`${parsed.dg15Raw.length} chars`} />}
          <DataRow label="SOD" value={`${sod.length} chars`} />

          <View style={styles.copyButtonsRow}>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => copyToClipboard('DG1', dg1)}
            >
              <Text style={styles.copyButtonText}>DG1</Text>
            </TouchableOpacity>
            {dg2 && (
              <TouchableOpacity
                style={styles.copyButton}
                onPress={() => copyToClipboard('DG2', dg2)}
              >
                <Text style={styles.copyButtonText}>DG2</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => copyToClipboard('SOD', sod)}
            >
              <Text style={styles.copyButtonText}>SOD</Text>
            </TouchableOpacity>
          </View>
        </CollapsibleSection>

        {/* Export All */}
        <TouchableOpacity
          style={styles.exportButton}
          onPress={() => {
            const exportData = JSON.stringify({
              dg1,
              dg2: dg2 || null,
              dg7: parsed.dg7Raw || null,
              dg11: parsed.dg11Raw || null,
              dg12: parsed.dg12Raw || null,
              dg13: parsed.dg13Raw || null,
              dg14: parsed.dg14Raw || null,
              dg15: parsed.dg15Raw || null,
              sod,
              parsed: {
                mrz: parsed.mrz,
                fields: parsed.mrzFields,
                dg11: parsed.dg11Parsed || null,
                dg12: parsed.dg12Parsed || null,
              },
            }, null, 2);
            copyToClipboard('All Data (JSON)', exportData);
          }}
        >
          <Text style={styles.exportButtonText}>📋 Export All as JSON</Text>
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionToggle}>{expanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>
      {expanded && <View style={styles.sectionContent}>{children}</View>}
    </Card>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue} selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  loading: {
    textAlign: 'center',
    marginTop: 100,
    fontSize: 16,
    color: colors.textMuted,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    padding: 12,
    borderRadius: borderRadius.md,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  warningIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: colors.warningDark,
  },
  photoContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  photo: {
    width: 150,
    height: 200,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  signatureImage: {
    width: 200,
    height: 80,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
  },
  dgDescription: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  copyButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  mrzBox: {
    backgroundColor: colors.surfaceDark,
    padding: 12,
    borderRadius: borderRadius.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mrzText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#00ff88',
    lineHeight: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  sectionToggle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  sectionContent: {
    marginTop: 12,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dataLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  dataValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  rawDataSection: {
    marginTop: 12,
  },
  rawDataLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  rawDataLabelMarginTop12: {
    marginTop: 12,
  },
  rawDataLabelMarginTop8: {
    marginTop: 8,
  },
  rawDataPreview: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    padding: 8,
    borderRadius: borderRadius.sm,
    marginBottom: 8,
  },
  copyButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyButtonText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  exportButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: 16,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomPadding: {
    height: 40,
  },
  dgSummaryBox: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: borderRadius.md,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dgSummaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  dgBadgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dgBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  dgBadgePresent: {
    backgroundColor: '#22c55e',
  },
  dgBadgeMissing: {
    backgroundColor: colors.border,
  },
  dgBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  dgSummaryNote: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
