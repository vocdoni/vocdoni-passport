import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BackButton, Button } from '../../components/common';
import { IDCardCompact } from '../../components/IDCard';
import { Spinner } from '../../components/common/Spinner';
import { colors, commonStyles, borderRadius } from '../../components/common/styles';
import { useIDs } from '../../hooks/useIDs';
import { getEligibleIDs, formatRequirementsSummary } from '../../services/RequirementsValidator';
import type { SigningStackParamList, RootStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<SigningStackParamList, 'SelectID'>;
type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<SigningStackParamList, 'SelectID'>;

export function SelectIDScreen() {
  const navigation = useNavigation<NavigationProp>();
  const rootNavigation = useNavigation<RootNavigationProp>();
  const route = useRoute<RouteType>();
  const { request } = route.params;
  const { ids, loading, refresh } = useIDs();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { eligible, ineligible } = useMemo(
    () => getEligibleIDs(ids, request.query),
    [ids, request.query],
  );

  const requirements = useMemo(
    () => formatRequirementsSummary(request.query),
    [request.query],
  );

  const hasRequirements = requirements.length > 0;

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  React.useEffect(() => {
    if (eligible.length === 1 && !selectedId) {
      setSelectedId(eligible[0].id);
    }
  }, [eligible, selectedId]);

  const handleContinue = () => {
    if (!selectedId) {
      Alert.alert('Select ID', 'Please select an ID to use for signing.');
      return;
    }
    navigation.navigate('DisclosureReview', { request, selectedIdRef: selectedId });
  };

  const handleIneligiblePress = (reasons: string[]) => {
    Alert.alert(
      'ID Not Eligible',
      reasons.join('\n\n'),
      [{ text: 'OK' }],
    );
  };

  const handleAddID = () => {
    rootNavigation.navigate('Main', {
      screen: 'IDs',
      params: { screen: 'AddIDMrz' },
    });
  };

  if (loading) {
    return <Spinner centered />;
  }

  if (ids.length === 0) {
    return (
      <View style={commonStyles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <BackButton onPress={() => navigation.goBack()} />

          <View style={styles.emptyContent}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>🪪</Text>
            </View>
            <Text style={styles.emptyTitle}>No IDs available</Text>
            <Text style={styles.emptySubtitle}>
              You need to add an ID before you can sign petitions.
            </Text>
            <Button label="Add ID" onPress={handleAddID} variant="primary" />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (eligible.length === 0 && ids.length > 0) {
    return (
      <View style={commonStyles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <BackButton onPress={() => navigation.goBack()} />

          <View style={styles.emptyContent}>
            <View style={[styles.emptyIcon, styles.errorIcon]}>
              <Text style={styles.emptyIconText}>⚠️</Text>
            </View>
            <Text style={styles.emptyTitle}>No Eligible IDs</Text>
            <Text style={styles.emptySubtitle}>
              None of your IDs meet the requirements for this petition.
            </Text>

            {hasRequirements && (
              <View style={styles.requirementsBox}>
                <Text style={styles.requirementsTitle}>Requirements:</Text>
                {requirements.map((req, index) => (
                  <Text key={index} style={styles.requirementItem}>• {req}</Text>
                ))}
              </View>
            )}

            <View style={styles.ineligibleSection}>
              <Text style={styles.ineligibleTitle}>Your IDs:</Text>
              {ineligible.map(({ id, reasons }) => (
                <TouchableOpacity
                  key={id.id}
                  style={styles.ineligibleCard}
                  onPress={() => handleIneligiblePress(reasons)}
                >
                  <View style={styles.ineligibleInfo}>
                    <Text style={styles.ineligibleName}>
                      {id.firstName} {id.lastName}
                    </Text>
                    <Text style={styles.ineligibleCountry}>
                      {id.issuingCountry} • {id.nationality}
                    </Text>
                  </View>
                  <View style={styles.ineligibleBadge}>
                    <Text style={styles.ineligibleBadgeText}>✕</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <Button label="Add Another ID" onPress={handleAddID} variant="secondary" />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={commonStyles.pageHeader}>
          <Text style={commonStyles.pageTitle}>Select ID</Text>
          <Text style={commonStyles.pageSubtitle}>
            Choose which document to use for this signature
          </Text>
        </View>

        {hasRequirements && (
          <View style={styles.requirementsBoxSmall}>
            <Text style={styles.requirementsTitleSmall}>Requirements:</Text>
            <Text style={styles.requirementsTextSmall}>
              {requirements.join(' • ')}
            </Text>
          </View>
        )}

        <View style={styles.idList}>
          {eligible.map((id) => (
            <IDCardCompact
              key={id.id}
              id={id}
              selected={selectedId === id.id}
              onPress={() => setSelectedId(id.id)}
            />
          ))}
        </View>

        {ineligible.length > 0 && (
          <View style={styles.ineligibleSectionSmall}>
            <Text style={styles.ineligibleTitleSmall}>
              Not eligible ({ineligible.length}):
            </Text>
            {ineligible.map(({ id, reasons }) => (
              <TouchableOpacity
                key={id.id}
                style={styles.ineligibleCardSmall}
                onPress={() => handleIneligiblePress(reasons)}
              >
                <Text style={styles.ineligibleNameSmall}>
                  {id.firstName} {id.lastName} ({id.nationality})
                </Text>
                <Text style={styles.ineligibleHint}>Tap for details</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.addMoreButton} onPress={handleAddID}>
          <Text style={styles.addMoreText}>+ Add another ID</Text>
        </TouchableOpacity>

        <View style={styles.buttons}>
          <Button
            label="Continue"
            onPress={handleContinue}
            variant="primary"
            disabled={!selectedId}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  idList: {
    marginTop: 8,
  },
  addMoreButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  addMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  buttons: {
    marginTop: 16,
  },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  errorIcon: {
    backgroundColor: colors.warningLight,
  },
  emptyIconText: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  requirementsBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: borderRadius.lg,
    padding: 16,
    marginBottom: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  requirementItem: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
    paddingLeft: 4,
  },
  requirementsBoxSmall: {
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.md,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.infoBorder,
  },
  requirementsTitleSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  requirementsTextSmall: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  ineligibleSection: {
    width: '100%',
    marginBottom: 20,
  },
  ineligibleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
  },
  ineligibleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.error,
    opacity: 0.8,
  },
  ineligibleInfo: {
    flex: 1,
  },
  ineligibleName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  ineligibleCountry: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  ineligibleBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ineligibleBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  ineligibleSectionSmall: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ineligibleTitleSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
  },
  ineligibleCardSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef5f5',
    borderRadius: borderRadius.sm,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#fdd',
  },
  ineligibleNameSmall: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  ineligibleHint: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
