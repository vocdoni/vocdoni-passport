import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/common';
import { colors, borderRadius } from '../../components/common/styles';
import { getIDById } from '../../storage/idStorage';
import { saveSignature, generateSignatureId } from '../../storage/historyStorage';
import {
  generatePassportInnerProofPackage,
} from '../../services/ProofGenerator';
import { aggregateProofOnServer, DuplicateSignatureError } from '../../services/ServerClient';
import type { SigningStackParamList } from '../../navigation/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<SigningStackParamList, 'ProofProgress'>;
type RouteType = RouteProp<SigningStackParamList, 'ProofProgress'>;

type StepStatus = 'pending' | 'active' | 'completed' | 'error';

interface Step {
  id: string;
  label: string;
  icon: string;
  status: StepStatus;
  startTime?: number;
  endTime?: number;
}

interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const STEPS: Omit<Step, 'status'>[] = [
  { id: 'prepare', label: 'Preparing', icon: '📄' },
  { id: 'compute', label: 'Computing', icon: '⚡' },
  { id: 'upload', label: 'Uploading', icon: '☁️' },
  { id: 'verify', label: 'Verifying', icon: '✓' },
];

const FRIENDLY_MESSAGES = [
  'Crunching cryptographic numbers...',
  'Building your zero-knowledge proof...',
  'Securing your identity...',
  'Almost there, hang tight...',
  'Verifying document authenticity...',
  'Creating mathematical magic...',
];

export function ProofProgressScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();
  const { request, selectedIdRef } = route.params;

  const [steps, setSteps] = useState<Step[]>(() =>
    STEPS.map((s) => ({ ...s, status: 'pending' })),
  );
  const [friendlyMessage, setFriendlyMessage] = useState(FRIENDLY_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [isDuplicateSignature, setIsDuplicateSignature] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalTime, setTotalTime] = useState<number | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);

  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const processStartRef = useRef<number>(0);
  const proofStarted = useRef(false);
  const messageIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const devTapCount = useRef(0);
  const devTapTimer = useRef<NodeJS.Timeout | null>(null);

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs((prev) => [...prev, { timestamp: Date.now(), level, message }]);
  }, []);

  const updateStep = useCallback((stepId: string, status: StepStatus) => {
    const now = Date.now();
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id === stepId) {
          return {
            ...s,
            status,
            startTime: status === 'active' && !s.startTime ? now : s.startTime,
            endTime: status === 'completed' || status === 'error' ? now : s.endTime,
          };
        }
        if (status === 'active' && s.status === 'active' && s.id !== stepId) {
          return { ...s, status: 'completed', endTime: now };
        }
        return s;
      }),
    );
  }, []);

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    return () => {
      spin.stop();
      pulse.stop();
    };
  }, [spinAnim, pulseAnim]);

  useEffect(() => {
    if (!error) {
      messageIntervalRef.current = setInterval(() => {
        setFriendlyMessage(
          FRIENDLY_MESSAGES[Math.floor(Math.random() * FRIENDLY_MESSAGES.length)],
        );
      }, 4000);
    }
    return () => {
      if (messageIntervalRef.current) {
        clearInterval(messageIntervalRef.current);
      }
    };
  }, [error]);

  const mapPhaseToStep = (phase: string): string => {
    if (phase === 'parse' || phase === 'circuits' || phase === 'registry' || phase === 'download') {
      return 'prepare';
    }
    if (phase === 'inputs' || phase === 'prove') {
      return 'compute';
    }
    if (phase === 'outer') {
      return 'upload';
    }
    return 'prepare';
  };

  const runProof = useCallback(async () => {
    processStartRef.current = Date.now();
    addLog('info', 'Starting proof generation');

    const storedId = await getIDById(selectedIdRef);
    if (!storedId) {
      setError('Selected ID not found');
      setErrorDetails('The document you selected could not be loaded from storage.');
      addLog('error', 'Selected ID not found in storage');
      return;
    }

    addLog('info', `Using ${storedId.issuingCountry} ${storedId.documentType}`);
    updateStep('prepare', 'active');
    Animated.timing(progressAnim, { toValue: 0.1, duration: 300, useNativeDriver: false }).start();

    try {
      addLog('info', 'Generating inner proof package...');
      const inner = await generatePassportInnerProofPackage(
        { dg1: storedId.dg1, sod: storedId.sod, dg2: storedId.dg2 },
        (phase, detail) => {
          const stepId = mapPhaseToStep(phase);
          updateStep(stepId, 'active');
          addLog('info', `[${phase}] ${detail}`);

          let progress = 0.1;
          if (phase === 'registry' || phase === 'download') progress = 0.2;
          if (phase === 'inputs') progress = 0.35;
          if (phase === 'prove') progress = 0.6;
          Animated.timing(progressAnim, { toValue: progress, duration: 300, useNativeDriver: false }).start();
        },
        request.query,
        request.service,
      );

      updateStep('compute', 'completed');
      updateStep('upload', 'active');
      Animated.timing(progressAnim, { toValue: 0.75, duration: 300, useNativeDriver: false }).start();
      addLog('info', 'Uploading proof to aggregation server...');

      const result = await aggregateProofOnServer(request.aggregateUrl, inner, request);

      updateStep('upload', 'completed');
      updateStep('verify', 'active');
      Animated.timing(progressAnim, { toValue: 0.95, duration: 300, useNativeDriver: false }).start();
      addLog('info', 'Server accepted proof, finalizing...');

      await new Promise((r) => setTimeout(r, 500));
      updateStep('verify', 'completed');
      Animated.timing(progressAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();

      const durationMs = Date.now() - processStartRef.current;
      setTotalTime(durationMs);
      addLog('info', `Proof completed in ${(durationMs / 1000).toFixed(1)}s`);

      await saveSignature({
        id: generateSignatureId(),
        timestamp: Date.now(),
        serviceName: request.service?.name || 'Petition',
        serviceUrl: request.aggregateUrl,
        petitionId: request.petitionId,
        purpose: request.service?.purpose,
        disclosedFields: collectDisclosedFields(request.query),
        rules: [],
        success: true,
        nullifier: result.nullifier,
        durationMs,
        usedIdRef: selectedIdRef,
        usedIdLabel: `${storedId.issuingCountry} ${storedId.documentType === 'passport' ? 'Passport' : 'ID Card'}`,
      });

      setTimeout(() => {
        navigation.replace('SigningSuccess', {
          request,
          nullifier: result.nullifier,
          durationMs,
          proofName: result.name,
        });
      }, 800);
    } catch (err: any) {
      const message = err?.message || 'Proof generation failed';
      const stack = err?.stack || '';
      
      // Check if this is a duplicate signature error
      const isDuplicate = err instanceof DuplicateSignatureError || 
        err?.name === 'DuplicateSignatureError' ||
        message.toLowerCase().includes('already exists') ||
        message.toLowerCase().includes('duplicate');
      
      if (isDuplicate) {
        setIsDuplicateSignature(true);
        setError('You have already signed this petition');
        setErrorDetails('This ID has already been used to sign this petition. Each ID can only sign a petition once.');
        addLog('warn', 'Duplicate signature detected - ID already used for this petition');
      } else {
        setError(getUserFriendlyError(message));
        setErrorDetails(`${message}\n\n${stack}`);
        addLog('error', message);
      }

      setSteps((prev) =>
        prev.map((s) => (s.status === 'active' ? { ...s, status: 'error' } : s)),
      );

      const durationMs = Date.now() - processStartRef.current;
      setTotalTime(durationMs);

      // Don't save failed signature record for duplicates (it was already recorded before)
      if (!isDuplicate) {
        await saveSignature({
          id: generateSignatureId(),
          timestamp: Date.now(),
          serviceName: request.service?.name || 'Petition',
          serviceUrl: request.aggregateUrl,
          petitionId: request.petitionId,
          purpose: request.service?.purpose,
          disclosedFields: [],
          rules: [],
          success: false,
          durationMs,
          usedIdRef: selectedIdRef,
          usedIdLabel: storedId
            ? `${storedId.issuingCountry} ${storedId.documentType === 'passport' ? 'Passport' : 'ID Card'}`
            : 'Unknown',
        });
      }
    }
  }, [addLog, navigation, progressAnim, request, selectedIdRef, updateStep]);

  useEffect(() => {
    if (!proofStarted.current) {
      proofStarted.current = true;
      runProof();
    }
  }, [runProof]);

  const handleDevTap = () => {
    devTapCount.current += 1;
    if (devTapTimer.current) clearTimeout(devTapTimer.current);
    devTapTimer.current = setTimeout(() => {
      devTapCount.current = 0;
    }, 500);
    if (devTapCount.current >= 5) {
      setShowLogs(true);
      devTapCount.current = 0;
    }
  };

  const copyLogs = () => {
    const logText = logs
      .map((l) => `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    Clipboard.setString(logText);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  const copyError = () => {
    if (errorDetails) {
      Clipboard.setString(errorDetails);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    }
  };

  const handleCancel = () => {
    navigation.getParent()?.goBack();
  };

  const handleRetry = () => {
    setError(null);
    setErrorDetails(null);
    setIsDuplicateSignature(false);
    setSteps(STEPS.map((s) => ({ ...s, status: 'pending' })));
    setLogs([]);
    proofStarted.current = false;
    progressAnim.setValue(0);
    runProof();
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const completedSteps = steps.filter((s) => s.status === 'completed').length;
  const progressPercent = Math.round((completedSteps / steps.length) * 100);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.backgroundGradient}>
        <View style={styles.gradientCircle1} />
        <View style={styles.gradientCircle2} />
      </View>

      {showLogs ? (
        <View style={styles.logsContainer}>
          <View style={styles.logsHeader}>
            <Text style={styles.logsTitle}>Debug Logs</Text>
            <TouchableOpacity onPress={() => setShowLogs(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.logsScroll}>
            {logs.map((log, idx) => (
              <Text
                key={idx}
                style={[
                  styles.logLine,
                  log.level === 'error' && styles.logError,
                  log.level === 'warn' && styles.logWarn,
                ]}
              >
                {new Date(log.timestamp).toLocaleTimeString()} [{log.level}] {log.message}
              </Text>
            ))}
          </ScrollView>
          <View style={styles.logsActions}>
            <Button label="Copy Logs" onPress={copyLogs} variant="primary" />
            <Button label="Close" onPress={() => setShowLogs(false)} variant="subtle" />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={handleDevTap} activeOpacity={1}>
            <View style={styles.visualSection}>
              {!error ? (
                <>
                  <Animated.View style={[styles.spinnerOuter, { transform: [{ rotate: spin }] }]}>
                    <View style={styles.spinnerGradient} />
                  </Animated.View>
                  <Animated.View style={[styles.spinnerInner, { transform: [{ scale: pulseAnim }] }]}>
                    <Text style={styles.spinnerIcon}>🔐</Text>
                  </Animated.View>
                </>
              ) : (
                <View style={[styles.errorCircle, isDuplicateSignature && styles.duplicateCircle]}>
                  <Text style={styles.errorIcon}>{isDuplicateSignature ? '✓' : '⚠️'}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <Text style={styles.title}>
            {error ? (isDuplicateSignature ? 'Already Signed' : 'Proof Failed') : 'Generating Proof'}
          </Text>
          <Text style={styles.subtitle}>
            {error 
              ? (isDuplicateSignature ? 'You have already signed this petition' : 'Something went wrong') 
              : friendlyMessage}
          </Text>

          {!error && (
            <View style={styles.progressSection}>
              <View style={styles.progressBarContainer}>
                <Animated.View
                  style={[
                    styles.progressBarFill,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>{progressPercent}%</Text>
            </View>
          )}

          <View style={styles.stepsContainer}>
            {steps.map((step, idx) => (
              <StepIndicator key={step.id} step={step} isLast={idx === steps.length - 1} />
            ))}
          </View>

          {totalTime && !error && (
            <View style={styles.timeContainer}>
              <Text style={styles.timeLabel}>Total time</Text>
              <Text style={styles.timeValue}>{(totalTime / 1000).toFixed(1)}s</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorSection}>
              <View style={[styles.errorCard, isDuplicateSignature && styles.duplicateCard]}>
                <Text style={styles.errorTitle}>
                  {isDuplicateSignature ? 'Already Signed' : 'What happened?'}
                </Text>
                <Text style={styles.errorMessage}>{error}</Text>
                {isDuplicateSignature && (
                  <Text style={styles.duplicateHint}>
                    Each identity document can only sign a petition once to ensure fairness.
                  </Text>
                )}
                {!isDuplicateSignature && (
                  <TouchableOpacity onPress={copyError} style={styles.copyErrorButton}>
                    <Text style={styles.copyErrorText}>Copy error details</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.errorActions}>
                {isDuplicateSignature ? (
                  <Button label="Go Back" onPress={handleCancel} variant="primary" />
                ) : (
                  <>
                    <Button label="Try Again" onPress={handleRetry} variant="primary" />
                    <Button label="Cancel" onPress={handleCancel} variant="subtle" />
                  </>
                )}
              </View>
            </View>
          )}

          {!error && (
            <View style={styles.infoCard}>
              <Text style={styles.infoIcon}>💡</Text>
              <Text style={styles.infoText}>
                Keep the app open. This process uses advanced cryptography to protect your privacy.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {copiedToast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>Copied to clipboard</Text>
        </View>
      )}
    </View>
  );
}

function StepIndicator({ step, isLast }: { step: Step; isLast: boolean }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (step.status === 'active') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      scaleAnim.setValue(1);
    }
  }, [scaleAnim, step.status]);

  const duration =
    step.startTime && step.endTime ? ((step.endTime - step.startTime) / 1000).toFixed(1) : null;

  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIconContainer}>
        <Animated.View
          style={[
            styles.stepIconCircle,
            step.status === 'completed' && styles.stepIconCompleted,
            step.status === 'active' && styles.stepIconActive,
            step.status === 'error' && styles.stepIconError,
            step.status === 'active' && { transform: [{ scale: scaleAnim }] },
          ]}
        >
          {step.status === 'completed' ? (
            <Text style={styles.stepCheckmark}>✓</Text>
          ) : step.status === 'error' ? (
            <Text style={styles.stepCheckmark}>✕</Text>
          ) : (
            <Text style={styles.stepEmoji}>{step.icon}</Text>
          )}
        </Animated.View>
        {!isLast && (
          <View
            style={[
              styles.stepLine,
              (step.status === 'completed' || step.status === 'error') && styles.stepLineCompleted,
            ]}
          />
        )}
      </View>
      <View style={styles.stepContent}>
        <Text
          style={[
            styles.stepLabel,
            step.status === 'active' && styles.stepLabelActive,
            step.status === 'completed' && styles.stepLabelCompleted,
            step.status === 'error' && styles.stepLabelError,
          ]}
        >
          {step.label}
        </Text>
        {duration && <Text style={styles.stepDuration}>{duration}s</Text>}
      </View>
    </View>
  );
}

function getUserFriendlyError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection')) {
    return 'Network error. Please check your internet connection and try again.';
  }
  if (lower.includes('timeout')) {
    return 'The request timed out. The server might be busy, please try again.';
  }
  if (lower.includes('server') || lower.includes('500') || lower.includes('502')) {
    return 'Server error. Please try again in a few moments.';
  }
  if (lower.includes('certificate') || lower.includes('dsc')) {
    return 'Document verification failed. Your document may not be supported yet.';
  }
  return 'An unexpected error occurred. Please try again or contact support.';
}

function collectDisclosedFields(query?: Record<string, any> | null): string[] {
  if (!query) return [];
  const { FIELD_LABELS } = require('../../services/RequirementsValidator');
  return Object.entries(query)
    .filter(([, value]: any) => value?.disclose || value?.eq)
    .map(([key]) => FIELD_LABELS[key] || key);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  gradientCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(46, 108, 255, 0.15)',
  },
  gradientCircle2: {
    position: 'absolute',
    bottom: 100,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
    alignItems: 'center',
  },
  visualSection: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  spinnerOuter: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: colors.primary,
    borderRightColor: 'rgba(46, 108, 255, 0.3)',
  },
  spinnerGradient: {
    flex: 1,
  },
  spinnerInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(46, 108, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(46, 108, 255, 0.3)',
  },
  spinnerIcon: {
    fontSize: 40,
  },
  errorCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  duplicateCircle: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  errorIcon: {
    fontSize: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 32,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 32,
    gap: 12,
  },
  progressBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    width: 40,
    textAlign: 'right',
  },
  stepsContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.xl,
    padding: 20,
    marginBottom: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepIconContainer: {
    alignItems: 'center',
    marginRight: 16,
  },
  stepIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  stepIconCompleted: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  stepIconActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepIconError: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  stepCheckmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  stepEmoji: {
    fontSize: 18,
  },
  stepLine: {
    width: 2,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 4,
  },
  stepLineCompleted: {
    backgroundColor: colors.success,
  },
  stepContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    minHeight: 40,
  },
  stepLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '600',
  },
  stepLabelActive: {
    color: '#ffffff',
  },
  stepLabelCompleted: {
    color: colors.success,
  },
  stepLabelError: {
    color: colors.error,
  },
  stepDuration: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.lg,
    marginBottom: 24,
  },
  timeLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  timeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  errorSection: {
    width: '100%',
  },
  errorCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: borderRadius.xl,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  duplicateCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.2)',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 16,
  },
  duplicateHint: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(251, 191, 36, 0.9)',
    fontStyle: 'italic',
  },
  copyErrorButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.full,
  },
  copyErrorText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  errorActions: {
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.lg,
    padding: 16,
    width: '100%',
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  logsContainer: {
    flex: 1,
    padding: 16,
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  logsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  logsScroll: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: borderRadius.lg,
    padding: 12,
    marginBottom: 16,
  },
  logLine: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  logError: {
    color: '#ef4444',
  },
  logWarn: {
    color: '#f59e0b',
  },
  logsActions: {
    gap: 12,
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: borderRadius.full,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  toastText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
