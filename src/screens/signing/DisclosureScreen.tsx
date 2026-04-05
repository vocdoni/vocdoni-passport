import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BackButton } from '../../components/common';
import { Card, Chip } from '../../components/common/Card';
import { SlideToVerify } from '../../components/SlideToVerify';
import { colors, commonStyles, borderRadius } from '../../components/common/styles';
import { authenticateForSigning } from '../../hooks/useAuth';
import { getIDById } from '../../storage/idStorage';
import { validateIDAgainstQuery } from '../../services/RequirementsValidator';
import type { SigningStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<SigningStackParamList, 'DisclosureReview'>;
type RouteType = RouteProp<SigningStackParamList, 'DisclosureReview'>;

export function DisclosureScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const { request, selectedIdRef } = route.params;
  const [verifying, setVerifying] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const disclosures = useMemo(() => collectDisclosures(request.query), [request.query]);
  const rules = useMemo(() => collectRules(request.query), [request.query]);

  useEffect(() => {
    async function validateSelectedID() {
      try {
        const id = await getIDById(selectedIdRef);
        if (!id) {
          setValidationErrors(['Selected ID not found.']);
          return;
        }
        const result = validateIDAgainstQuery(id, request.query);
        setValidationErrors(result.errors);
      } catch (err) {
        console.error('[DisclosureScreen] Validation error:', err);
      }
    }
    validateSelectedID();
  }, [selectedIdRef, request.query]);

  const handleVerified = async () => {
    if (validationErrors.length > 0) {
      Alert.alert(
        'Requirements Not Met',
        validationErrors.join('\n\n'),
        [{ text: 'OK' }],
      );
      return;
    }

    setVerifying(true);
    try {
      const authenticated = await authenticateForSigning();
      if (!authenticated) {
        Alert.alert('Authentication Required', 'Please authenticate to sign this petition.');
        setVerifying(false);
        return;
      }
      navigation.navigate('ProofProgress', { request, selectedIdRef });
    } catch (error: any) {
      Alert.alert('Authentication Failed', error?.message || 'Could not authenticate.');
      setVerifying(false);
    }
  };

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={commonStyles.pageHeader}>
          <Text style={commonStyles.pageTitle}>Information Disclosure</Text>
          <Text style={commonStyles.pageSubtitle}>
            Review what will be shared with this petition
          </Text>
        </View>

        <Card>
          <View style={styles.warningHeader}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningText}>This petition will receive:</Text>
          </View>

          {disclosures.length > 0 ? (
            <View style={styles.disclosureList}>
              {disclosures.map((field, index) => (
                <View key={index} style={styles.disclosureItem}>
                  <View style={styles.checkBadge}>
                    <Text style={styles.checkIcon}>✓</Text>
                  </View>
                  <Text style={styles.disclosureText}>{field}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noDisclosures}>
              No personal information will be disclosed.
            </Text>
          )}
        </Card>

        {rules.length > 0 && (
          <Card title="Requirements">
            {rules.map((rule, index) => (
              <View key={index} style={styles.ruleItem}>
                <Text style={styles.ruleBullet}>•</Text>
                <Text style={styles.ruleText}>{rule}</Text>
              </View>
            ))}
          </Card>
        )}

        {validationErrors.length > 0 && (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>Requirements Not Met</Text>
              {validationErrors.map((error, index) => (
                <Text key={index} style={styles.errorText}>• {error}</Text>
              ))}
            </View>
          </View>
        )}

        <View style={styles.privacyNote}>
          <Text style={styles.privacyIcon}>🔒</Text>
          <Text style={styles.privacyText}>
            Your name, document number, and other personal details will NOT be shared.
            Only zero-knowledge proofs of the above fields are transmitted.
          </Text>
        </View>

        <View style={styles.sliderContainer}>
          <SlideToVerify
            onVerified={handleVerified}
            disabled={verifying || validationErrors.length > 0}
            label={validationErrors.length > 0 ? 'Requirements not met' : 'Slide to sign'}
          />
          {verifying && (
            <Text style={styles.verifyingText}>Authenticating...</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function collectDisclosures(query?: Record<string, any> | null): string[] {
  if (!query) {return [];}
  return Object.entries(query)
    .filter(([, value]: any) => value?.disclose || value?.eq)
    .map(([key]) => friendlyFieldName(key));
}

function collectRules(query?: Record<string, any> | null): string[] {
  if (!query) {return [];}
  const rules: string[] = [];

  const nationalityIn = query?.nationality?.in;
  const nationalityOut = query?.nationality?.out;
  const issuingCountryIn = query?.issuing_country?.in;
  const issuingCountryOut = query?.issuing_country?.out;
  const ageGte = query?.age?.gte;
  const ageLte = query?.age?.lte;

  if (Array.isArray(nationalityIn) && nationalityIn.length) {
    rules.push(`Nationality must be: ${nationalityIn.join(', ')}`);
  }
  if (Array.isArray(nationalityOut) && nationalityOut.length) {
    rules.push(`Nationality must NOT be: ${nationalityOut.join(', ')}`);
  }
  if (Array.isArray(issuingCountryIn) && issuingCountryIn.length) {
    rules.push(`Issuing country must be: ${issuingCountryIn.join(', ')}`);
  }
  if (Array.isArray(issuingCountryOut) && issuingCountryOut.length) {
    rules.push(`Issuing country must NOT be: ${issuingCountryOut.join(', ')}`);
  }
  if (ageGte) {
    rules.push(`Must be at least ${ageGte} years old`);
  }
  if (ageLte) {
    rules.push(`Must be at most ${ageLte} years old`);
  }

  return rules;
}

function friendlyFieldName(value: string): string {
  const map: Record<string, string> = {
    nationality: 'Nationality',
    issuing_country: 'Issuing Country',
    name: 'Full Name',
    fullname: 'Full Name',
    firstname: 'First Name',
    lastname: 'Last Name',
    document_number: 'Document Number',
    document_type: 'Document Type',
    date_of_birth: 'Date of Birth',
    birthdate: 'Date of Birth',
    expiry_date: 'Expiry Date',
    gender: 'Gender',
    age: 'Age',
    optional_data_1: 'Optional Data 1',
    optional_data_2: 'Optional Data 2',
    // DG11 fields
    place_of_birth: 'Place of Birth',
    permanent_address: 'Permanent Address',
    personal_number: 'Personal Number',
    full_date_of_birth: 'Full Date of Birth',
    full_name_of_holder: 'Full Name',
    personal_number_dg11: 'Personal Number (DG11)',
  };
  return map[value] || value.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  warningText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  disclosureList: {
    gap: 12,
  },
  disclosureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f5ff',
    padding: 12,
    borderRadius: borderRadius.md,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  disclosureText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  noDisclosures: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  ruleItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  ruleBullet: {
    fontSize: 14,
    color: colors.textMuted,
    marginRight: 8,
  },
  ruleText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
  privacyNote: {
    flexDirection: 'row',
    backgroundColor: colors.successLight,
    padding: 14,
    borderRadius: borderRadius.lg,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#b6e2c6',
  },
  privacyIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.successDark,
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: '#fff5f5',
    padding: 14,
    borderRadius: borderRadius.lg,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#fdd',
  },
  errorIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.error,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#c53030',
    marginBottom: 4,
  },
  sliderContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  verifyingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },
});
