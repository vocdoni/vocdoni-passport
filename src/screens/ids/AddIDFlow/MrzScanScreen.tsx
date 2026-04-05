import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Alert, NativeModules } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BackButton, Button } from '../../../components/common';
import { Card } from '../../../components/common/Card';
import { colors, commonStyles, borderRadius } from '../../../components/common/styles';
import type { IDsStackParamList } from '../../../navigation/types';

const { MrzScanner } = NativeModules;

type NavigationProp = NativeStackNavigationProp<IDsStackParamList, 'AddIDMrz'>;

export function MrzScanScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [showManual, setShowManual] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [doc, setDoc] = useState('');
  const [dob, setDob] = useState('');
  const [exp, setExp] = useState('');

  const startCameraScan = useCallback(async () => {
    if (!MrzScanner) {
      setMessage('Camera scanner not available on this device');
      setShowManual(true);
      return;
    }
    setScanning(true);
    setMessage('');
    try {
      const result = await MrzScanner.scan();
      navigation.navigate('AddIDNfc', {
        documentNumber: result.documentNumber.padEnd(9, '<'),
        dateOfBirth: result.dateOfBirth,
        dateOfExpiry: result.dateOfExpiry,
      });
    } catch (error: any) {
      if (error?.message?.includes('cancelled') || error?.message?.includes('Cancelled')) {
        return;
      }
      setMessage(error?.message || 'Camera scan failed');
      setShowManual(true);
    } finally {
      setScanning(false);
    }
  }, [navigation]);

  const submitManual = useCallback(() => {
    const d = doc.trim().toUpperCase();
    const b = dob.trim();
    const e = exp.trim();

    if (!d) {
      Alert.alert('Missing', 'Enter the document number.');
      return;
    }
    if (!/^\d{6}$/.test(b)) {
      Alert.alert('Invalid', 'Birth date must use YYMMDD format (e.g., 900115).');
      return;
    }
    if (!/^\d{6}$/.test(e)) {
      Alert.alert('Invalid', 'Expiry date must use YYMMDD format (e.g., 300115).');
      return;
    }

    navigation.navigate('AddIDNfc', {
      documentNumber: d.padEnd(9, '<'),
      dateOfBirth: b,
      dateOfExpiry: e,
    });
  }, [doc, dob, exp, navigation]);

  return (
    <View style={commonStyles.safeArea}>
      <ScrollView
        contentContainerStyle={commonStyles.screenPad}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <BackButton onPress={() => navigation.goBack()} />

        <View style={commonStyles.pageHeader}>
          <Text style={commonStyles.pageTitle}>Add New ID</Text>
          <Text style={commonStyles.pageSubtitle}>
            Scan the MRZ code on your passport or ID card
          </Text>
        </View>

        <View style={styles.stepIndicator}>
          <View style={[styles.step, styles.stepActive]}>
            <Text style={styles.stepNumber}>1</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={styles.step}>
            <Text style={styles.stepNumber}>2</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={styles.step}>
            <Text style={styles.stepNumber}>3</Text>
          </View>
        </View>
        <View style={styles.stepLabels}>
          <Text style={[styles.stepLabel, styles.stepLabelActive]}>MRZ</Text>
          <Text style={styles.stepLabel}>NFC</Text>
          <Text style={styles.stepLabel}>Done</Text>
        </View>

        {!showManual && (
          <Card title="Camera Scan">
            <Text style={styles.body}>
              Point your camera at the MRZ zone (the two lines of text at the bottom of your document).
            </Text>
            <View style={styles.mrzExample}>
              <Text style={styles.mrzText}>P&lt;ESPGARCIA&lt;&lt;MARIA&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</Text>
              <Text style={styles.mrzText}>AB12345678ESP9001151M3001159&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;02</Text>
            </View>
            <Button
              label={scanning ? 'Opening camera...' : 'Open Camera Scanner'}
              onPress={startCameraScan}
              variant="primary"
              loading={scanning}
            />
            <Button
              label="Enter MRZ manually"
              onPress={() => setShowManual(true)}
              variant="subtle"
            />
          </Card>
        )}

        {message ? (
          <Card title="Scanner Message">
            <Text style={styles.errorText}>{message}</Text>
          </Card>
        ) : null}

        {showManual && (
          <Card title="Manual Entry">
            <Text style={styles.mutedText}>
              Enter the values from the MRZ zone of your document.
            </Text>

            <Text style={styles.label}>Document Number</Text>
            <TextInput
              style={styles.input}
              value={doc}
              onChangeText={setDoc}
              placeholder="AB1234567"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
            />

            <Text style={styles.label}>Date of Birth (YYMMDD)</Text>
            <TextInput
              style={styles.input}
              value={dob}
              onChangeText={setDob}
              placeholder="900115"
              keyboardType="numeric"
              maxLength={6}
            />

            <Text style={styles.label}>Date of Expiry (YYMMDD)</Text>
            <TextInput
              style={styles.input}
              value={exp}
              onChangeText={setExp}
              placeholder="300115"
              keyboardType="numeric"
              maxLength={6}
            />

            <Button
              label="Continue to NFC"
              onPress={submitManual}
              variant="primary"
            />
            {MrzScanner && (
              <Button
                label="Use camera instead"
                onPress={() => {
                  setShowManual(false);
                  setMessage('');
                }}
                variant="subtle"
              />
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  step: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepActive: {
    backgroundColor: colors.primary,
  },
  stepNumber: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  stepLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  stepLabelActive: {
    color: colors.primary,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  mrzExample: {
    backgroundColor: '#f8f9fb',
    padding: 12,
    borderRadius: borderRadius.md,
    marginBottom: 16,
  },
  mrzText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  mutedText: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#f9fbff',
    color: colors.text,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
  },
});
