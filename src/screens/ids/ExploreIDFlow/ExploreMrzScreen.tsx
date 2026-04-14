import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  NativeModules,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BackButton, Button } from '../../../components/common';
import { Card } from '../../../components/common/Card';
import { colors, commonStyles, borderRadius } from '../../../components/common/styles';
import type { IDsStackParamList } from '../../../navigation/types';

const { MrzScanner } = NativeModules;

type NavigationProp = NativeStackNavigationProp<IDsStackParamList, 'ExploreIDMrz'>;

export function ExploreMrzScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [message, setMessage] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [documentNumber, setDocumentNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dateOfExpiry, setDateOfExpiry] = useState('');

  const handleCameraScan = useCallback(async () => {
    if (!MrzScanner?.scan) {
      setMessage('Camera scanner not available on this device');
      setManualMode(true);
      return;
    }

    setMessage('');
    try {
      const result = await MrzScanner.scan();
      if (result?.documentNumber && result?.dateOfBirth && result?.dateOfExpiry) {
        navigation.navigate('ExploreIDNfc', {
          documentNumber: result.documentNumber.padEnd(9, '<'),
          dateOfBirth: result.dateOfBirth,
          dateOfExpiry: result.dateOfExpiry,
        });
      } else {
        setMessage('Could not read MRZ. Try manual entry.');
        setManualMode(true);
      }
    } catch (error: any) {
      if (error?.message?.includes('cancelled') || error?.message?.includes('Cancelled')) {
        return;
      }
      setMessage(error?.message || 'Camera scan failed');
      setManualMode(true);
    }
  }, [navigation]);

  const handleManualSubmit = useCallback(() => {
    const cleanDocNum = documentNumber.trim().toUpperCase();
    const cleanDob = dateOfBirth.trim().replace(/[^0-9]/g, '');
    const cleanExp = dateOfExpiry.trim().replace(/[^0-9]/g, '');

    if (!cleanDocNum) {
      Alert.alert('Missing Field', 'Please enter the document number');
      return;
    }
    if (cleanDob.length !== 6) {
      Alert.alert('Invalid Date', 'Date of birth must be 6 digits (YYMMDD)');
      return;
    }
    if (cleanExp.length !== 6) {
      Alert.alert('Invalid Date', 'Expiry date must be 6 digits (YYMMDD)');
      return;
    }

    navigation.navigate('ExploreIDNfc', {
      documentNumber: cleanDocNum.padEnd(9, '<'),
      dateOfBirth: cleanDob,
      dateOfExpiry: cleanExp,
    });
  }, [documentNumber, dateOfBirth, dateOfExpiry, navigation]);

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView contentContainerStyle={commonStyles.screenPad} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={commonStyles.pageHeader}>
          <Text style={commonStyles.pageTitle}>🔬 Explore ID</Text>
          <Text style={commonStyles.pageSubtitle}>
            Scan document to view all raw data
          </Text>
        </View>

        <View style={styles.debugBanner}>
          <Text style={styles.debugIcon}>🛠️</Text>
          <View style={styles.debugContent}>
            <Text style={styles.debugTitle}>Debug Mode</Text>
            <Text style={styles.debugText}>
              This will read and display all data from the ID chip without storing anything.
            </Text>
          </View>
        </View>

        {!manualMode ? (
          <>
            <Card>
              <View style={styles.scanOption}>
                <Text style={styles.scanIcon}>📷</Text>
                <Text style={styles.scanTitle}>Camera Scan</Text>
                <Text style={styles.scanDescription}>
                  Point your camera at the MRZ (machine readable zone) at the bottom of the document
                </Text>
                <Button label="Open Camera" onPress={handleCameraScan} variant="primary" />
              </View>
            </Card>

            <View style={styles.orDivider}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OR</Text>
              <View style={styles.orLine} />
            </View>

            <Card>
              <View style={styles.scanOption}>
                <Text style={styles.scanIcon}>✏️</Text>
                <Text style={styles.scanTitle}>Manual Entry</Text>
                <Text style={styles.scanDescription}>
                  Enter the document details manually
                </Text>
                <Button label="Enter Manually" onPress={() => setManualMode(true)} variant="secondary" />
              </View>
            </Card>
          </>
        ) : (
          <Card>
            <Text style={styles.manualTitle}>Enter Document Details</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Document Number</Text>
              <TextInput
                style={styles.input}
                value={documentNumber}
                onChangeText={setDocumentNumber}
                placeholder="e.g., AB1234567"
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Date of Birth (YYMMDD)</Text>
              <TextInput
                style={styles.input}
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                placeholder="e.g., 900115"
                keyboardType="number-pad"
                maxLength={6}
              />
              <Text style={styles.inputHint}>Example: 900115 for Jan 15, 1990</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Expiry Date (YYMMDD)</Text>
              <TextInput
                style={styles.input}
                value={dateOfExpiry}
                onChangeText={setDateOfExpiry}
                placeholder="e.g., 300115"
                keyboardType="number-pad"
                maxLength={6}
              />
              <Text style={styles.inputHint}>Example: 300115 for Jan 15, 2030</Text>
            </View>

            <View style={styles.buttonRow}>
              <Button label="Back" onPress={() => setManualMode(false)} variant="secondary" />
              <View style={styles.buttonSpacer} />
              <Button label="Continue" onPress={handleManualSubmit} variant="primary" />
            </View>
          </Card>
        )}

        {message ? (
          <Card title="Scanner Message">
            <Text style={styles.errorText}>{message}</Text>
          </Card>
        ) : null}

        <Card title="What will be shown">
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📷</Text>
            <Text style={styles.featureText}>Photo from the chip (if available)</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📄</Text>
            <Text style={styles.featureText}>Full MRZ data</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🧾</Text>
            <Text style={styles.featureText}>All parsed fields</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔐</Text>
            <Text style={styles.featureText}>Security Object (SOD) info</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📦</Text>
            <Text style={styles.featureText}>Raw DG1, DG2, SOD (Base64)</Text>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  debugBanner: {
    flexDirection: 'row',
    backgroundColor: colors.successLight,
    padding: 14,
    borderRadius: borderRadius.lg,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  debugIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  debugContent: {
    flex: 1,
  },
  debugTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.successDark,
    marginBottom: 4,
  },
  debugText: {
    fontSize: 13,
    color: colors.successDark,
    lineHeight: 18,
  },
  scanOption: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  scanIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  scanDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  orText: {
    marginHorizontal: 16,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  manualTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: 14,
    fontSize: 16,
    color: colors.text,
  },
  inputHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  buttonSpacer: {
    width: 12,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  featureIcon: {
    fontSize: 16,
    marginRight: 10,
    width: 24,
  },
  featureText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
});
