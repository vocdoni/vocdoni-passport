import React from 'react';
import { View, Text, ScrollView, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/common';
import { Card } from '../../components/common/Card';
import { colors, commonStyles, borderRadius } from '../../components/common/styles';
import type { SigningStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<SigningStackParamList, 'PetitionDetails'>;
type RouteType = RouteProp<SigningStackParamList, 'PetitionDetails'>;

export function PetitionDetailsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const { request } = route.params;

  const handleCancel = () => {
    navigation.getParent()?.goBack();
  };

  const handleContinue = () => {
    navigation.navigate('SelectID', { request });
  };

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.closeButton} onPress={handleCancel}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.serviceHeader}>
          {request.service?.logo ? (
            <Image source={{ uri: request.service.logo }} style={styles.serviceLogo} />
          ) : (
            <View style={styles.serviceLogoPlaceholder}>
              <Text style={styles.serviceLogoText}>🏛️</Text>
            </View>
          )}
          <Text style={styles.serviceName}>
            {request.service?.name || 'Vocdoni Passport'}
          </Text>
        </View>

        <Card title="Petition Details">
          {request.service?.purpose && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Purpose</Text>
              <Text style={styles.detailValue}>{request.service.purpose}</Text>
            </View>
          )}

          {request.petitionId && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Petition ID</Text>
              <Text style={styles.detailValueMono} numberOfLines={1}>{request.petitionId}</Text>
            </View>
          )}

          {request.service?.scope && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Scope</Text>
              <Text style={styles.detailValue}>{request.service.scope}</Text>
            </View>
          )}

          {request.service?.mode && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Mode</Text>
              <Text style={styles.detailValue}>{request.service.mode}</Text>
            </View>
          )}

          {request.service?.domain && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Domain</Text>
              <Text style={styles.detailValue}>{request.service.domain}</Text>
            </View>
          )}
        </Card>

        <View style={styles.serverInfo}>
          <Text style={styles.serverLabel}>Server</Text>
          <Text style={styles.serverUrl} numberOfLines={1}>{request.aggregateUrl}</Text>
        </View>

        <View style={styles.buttons}>
          <Button label="Continue" onPress={handleContinue} variant="primary" />
          <Button label="Cancel" onPress={handleCancel} variant="subtle" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 32,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    zIndex: 10,
  },
  closeButtonText: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '600',
  },
  serviceHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  serviceLogo: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: 12,
  },
  serviceLogoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  serviceLogoText: {
    fontSize: 36,
  },
  serviceName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  detailSection: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  detailValueMono: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: colors.text,
  },
  serverInfo: {
    padding: 14,
    backgroundColor: colors.surfaceDark,
    borderRadius: borderRadius.md,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  serverLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  serverUrl: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.textSecondary,
  },
  buttons: {
    marginTop: 8,
  },
});
