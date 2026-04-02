import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  NativeModules,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Buffer } from 'buffer';

import 'text-encoding-polyfill';

import {
  aggregateProofOnServer,
  fetchProofRequestPayload,
  pingServerHealth,
  type ProofRequestPayload,
  type ServerHealthStatus,
} from './src/services/ServerClient';
import {
  generatePassportInnerProofPackage,
  preloadCoreProofAssets,
  preloadRequestProofAssets,
  type ProofResult,
} from './src/services/ProofGenerator';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer as any;
}

const { PassportReader, MrzScanner, ServerQrScanner } = NativeModules;
const APP_LOGO = require('./assets/logo.png');

type Screen = 'home' | 'request' | 'mrz' | 'nfc' | 'result';

interface MrzInfo {
  documentNumber: string;
  dateOfBirth: string;
  dateOfExpiry: string;
}

interface HealthState {
  status: 'idle' | 'checking' | 'ok' | 'error';
  message: string;
  server?: ServerHealthStatus;
}

interface WarmupState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
  logs: string[];
}

type TimelineStatus = 'pending' | 'active' | 'completed' | 'error';

interface TimelineStep {
  id: string;
  title: string;
  description: string;
  status: TimelineStatus;
  detail: string;
  durationMs?: number;
}

const PROOF_STEPS: Array<Pick<TimelineStep, 'id' | 'title' | 'description'>> = [
  {
    id: 'prepare',
    title: 'Prepare document',
    description: 'Parse DG1 and select the compatible zkPassport circuits.',
  },
  {
    id: 'registry',
    title: 'Load proof data',
    description: 'Fetch cached registry artifacts, verification keys, and certificates.',
  },
  {
    id: 'inputs',
    title: 'Build witness inputs',
    description: 'Derive the private inputs required by each zk circuit.',
  },
  {
    id: 'inner',
    title: 'Generate inner proofs',
    description: 'Produce the recursive inner proofs on the device.',
  },
  {
    id: 'aggregate',
    title: 'Aggregate on server',
    description: 'Send the proof bundle to the server for the final outer proof.',
  },
  {
    id: 'verify',
    title: 'Finalize result',
    description: 'Verify the server response and prepare the final receipt.',
  },
];

function createInitialTimeline(): TimelineStep[] {
  return PROOF_STEPS.map((step) => ({
    ...step,
    status: 'pending',
    detail: '',
  }));
}

function summarizeRequest(request?: ProofRequestPayload | null): string[] {
  if (!request) return [];
  const lines: string[] = [];
  if (request.service?.purpose) lines.push(request.service.purpose);
  if (request.petitionId) lines.push(`Petition ID: ${request.petitionId}`);
  if (request.service?.scope) lines.push(`Scope: ${request.service.scope}`);
  if (request.service?.mode) lines.push(`Mode: ${request.service.mode}`);
  return lines;
}

function collectDisclosures(request?: ProofRequestPayload | null): string[] {
  if (!request?.query) return [];
  return Object.entries(request.query)
    .filter(([, value]: any) => value?.disclose)
    .map(([key]) => friendlyFieldName(key));
}

function collectRules(request?: ProofRequestPayload | null): string[] {
  if (!request?.query) return [];
  const rules: string[] = [];
  const nationalityIn = request.query?.nationality?.in;
  const nationalityOut = request.query?.nationality?.out;
  const issuingCountryIn = request.query?.issuing_country?.in;
  const issuingCountryOut = request.query?.issuing_country?.out;
  const ageGte = request.query?.age?.gte;
  if (Array.isArray(nationalityIn) && nationalityIn.length) rules.push(`Allowed nationalities: ${nationalityIn.join(', ')}`);
  if (Array.isArray(nationalityOut) && nationalityOut.length) rules.push(`Excluded nationalities: ${nationalityOut.join(', ')}`);
  if (Array.isArray(issuingCountryIn) && issuingCountryIn.length) rules.push(`Allowed issuing countries: ${issuingCountryIn.join(', ')}`);
  if (Array.isArray(issuingCountryOut) && issuingCountryOut.length) rules.push(`Excluded issuing countries: ${issuingCountryOut.join(', ')}`);
  if (ageGte) rules.push(`Age must be at least ${ageGte}`);
  return rules;
}

function friendlyFieldName(value: string): string {
  switch (value) {
    case 'nationality':
      return 'Nationality';
    case 'issuing_country':
      return 'Issuing country';
    case 'name':
      return 'Name';
    case 'document_number':
      return 'Document number';
    case 'date_of_birth':
      return 'Date of birth';
    default:
      return value.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
}

function parseScannedRequestPayload(raw: string): ProofRequestPayload {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Empty QR payload');

  const tryJson = (s: string): any | null => {
    try { return JSON.parse(s); } catch { return null; }
  };

  let payload: any = tryJson(text);
  if (!payload) {
    try {
      const b64 =
        getQueryParam(text, 'payload') ||
        getQueryParam(text, 'request') ||
        getQueryParam(text, 'c');
      if (b64) {
        const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        payload = tryJson(Buffer.from(padded, 'base64').toString('utf8'));
      }
    } catch {}
  }

  if (!payload || typeof payload !== 'object') throw new Error('QR does not contain a valid request JSON payload');
  if (!payload.aggregateUrl || typeof payload.aggregateUrl !== 'string') throw new Error('QR payload missing aggregateUrl');
  return payload as ProofRequestPayload;
}

function getQueryParam(rawUrl: string, key: string): string | null {
  const text = String(rawUrl || '').trim();
  const queryIndex = text.indexOf('?');
  if (queryIndex < 0) return null;
  const fragmentIndex = text.indexOf('#', queryIndex);
  const query = text.slice(queryIndex + 1, fragmentIndex >= 0 ? fragmentIndex : undefined);
  for (const part of query.split('&')) {
    if (!part) continue;
    const eqIndex = part.indexOf('=');
    const rawKey = eqIndex >= 0 ? part.slice(0, eqIndex) : part;
    const rawValue = eqIndex >= 0 ? part.slice(eqIndex + 1) : '';
    const decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    if (decodedKey !== key) continue;
    return decodeURIComponent(rawValue.replace(/\+/g, ' '));
  }
  return null;
}

async function resolveRequestPayload(raw: string): Promise<ProofRequestPayload> {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('Empty request payload');
  }

  try {
    return parseScannedRequestPayload(text);
  } catch {}

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(text);
  } catch {
    throw new Error('Request is neither valid JSON nor a valid request URL');
  }

  const embeddedPayload =
    getQueryParam(parsedUrl.toString(), 'payload') ||
    getQueryParam(parsedUrl.toString(), 'request') ||
    getQueryParam(parsedUrl.toString(), 'c');

  if (embeddedPayload) {
    return parseScannedRequestPayload(text);
  }

  return fetchProofRequestPayload(parsedUrl.toString());
}

function mapGeneratorPhaseToIndex(step: string): number {
  switch (step) {
    case 'parse':
    case 'circuits':
      return 0;
    case 'registry':
    case 'download':
      return 1;
    case 'inputs':
      return 2;
    case 'prove':
      return 3;
    case 'outer':
      return 4;
    default:
      return 0;
  }
}

function formatSeconds(durationMs?: number | null): string {
  if (durationMs == null) return '0.0s';
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function buildSupportReport(params: {
  requestConfig: ProofRequestPayload | null;
  submitResult: ProofResult | null;
  submitErr: string;
  steps: TimelineStep[];
  totalDurationMs: number | null;
  logs: string[];
}): string {
  return [
    'Vocdoni Passport support report',
    `Time: ${new Date().toISOString()}`,
    `Aggregate URL: ${params.requestConfig?.aggregateUrl || 'n/a'}`,
    `Service: ${params.requestConfig?.service?.name || 'n/a'}`,
    `Petition ID: ${params.requestConfig?.petitionId || 'n/a'}`,
    `Success: ${params.submitResult ? 'true' : 'false'}`,
    `Error: ${params.submitErr || 'none'}`,
    `Proof: ${params.submitResult?.name || 'n/a'}`,
    `Nullifier: ${params.submitResult?.nullifier || 'n/a'}`,
    `Total duration: ${formatSeconds(params.totalDurationMs)}`,
    'Step timings:',
    ...params.steps.map((step) => `- ${step.title}: ${step.status} (${formatSeconds(step.durationMs)}) ${step.detail}`),
    'Logs:',
    ...params.logs,
  ].join('\n');
}

function HomeScreen({
  go,
  onScanRequest,
  onLoadRequestLink,
  requestConfig,
  onClearRequest,
}: {
  go: (screen: Screen) => void;
  onScanRequest: () => void;
  onLoadRequestLink: (value: string) => Promise<void>;
  requestConfig: ProofRequestPayload | null;
  onClearRequest: () => void;
}) {
  const [requestLink, setRequestLink] = useState('');
  const [loadingLink, setLoadingLink] = useState(false);

  const pasteRequestLink = useCallback(async () => {
    try {
      const value = await Clipboard.getString();
      setRequestLink(value || '');
    } catch (error: any) {
      Alert.alert('Paste failed', error?.message || 'Could not read the clipboard.');
    }
  }, []);

  const loadRequestLink = useCallback(async () => {
    setLoadingLink(true);
    try {
      await onLoadRequestLink(requestLink);
      setRequestLink('');
    } catch (error: any) {
      Alert.alert('Request link failed', error?.message || 'Could not load the request link.');
    } finally {
      setLoadingLink(false);
    }
  }, [onLoadRequestLink, requestLink]);

  return (
    <ScrollView contentContainerStyle={st.screenPad} showsVerticalScrollIndicator={false}>
      <View style={st.brandHeader}>
        <View style={st.logoBadge}>
          <Image source={APP_LOGO} style={st.logoImage} resizeMode="contain" />
        </View>
        <Text style={st.pageTitle}>Vocdoni Passport</Text>
        <Text style={st.pageSubtitle}>Scan a request, read the document, send the proof.</Text>
      </View>

      <Card title="Device readiness">
        <StatusRow ok={!!PassportReader} label="NFC document reader" />
        <StatusRow ok={!!MrzScanner} label="MRZ camera scanner" />
        <StatusRow ok={!!ServerQrScanner} label="Server QR scanner" />
      </Card>

      {requestConfig ? (
        <Card title="Request ready">
          <Text style={st.sectionLead}>{requestConfig.service?.name || 'Vocdoni Passport'}</Text>
          {summarizeRequest(requestConfig).map((line, index) => (
            <Text key={index} style={st.body}>• {line}</Text>
          ))}
          <Text style={st.mutedText}>Server: {requestConfig.aggregateUrl}</Text>
          <View style={st.buttonRow}>
            <Btn label="Review request" onPress={() => go('request')} primary />
            <Btn label="Replace QR" onPress={onScanRequest} />
          </View>
          <Btn label="Clear request" onPress={onClearRequest} subtle />
        </Card>
      ) : (
        <Card title="Start">
          <Text style={st.body}>Scan a server QR or paste a request link.</Text>
          <Btn label="Scan server QR" onPress={onScanRequest} primary />
          <Text style={[st.mutedText, st.sectionGap]}>Or use a request link.</Text>
          <TextInput
            value={requestLink}
            onChangeText={setRequestLink}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://server.example/api/request-config?..."
            placeholderTextColor="#94a3b8"
            style={st.linkInput}
          />
          <View style={st.buttonRow}>
            <Btn label="Paste link" onPress={pasteRequestLink} />
            <Btn
              label={loadingLink ? 'Loading link...' : 'Load request link'}
              onPress={loadRequestLink}
              primary
              disabled={loadingLink || !requestLink.trim()}
            />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

function BootScreen({
  warmup,
  onContinue,
}: {
  warmup: WarmupState;
  onContinue: () => void;
}) {
  const canContinue = warmup.status === 'ready' || warmup.status === 'error';
  return (
    <ScrollView contentContainerStyle={st.screenPad} showsVerticalScrollIndicator={false}>
      <View style={st.brandHeader}>
        <View style={st.logoBadge}>
          <Image source={APP_LOGO} style={st.logoImage} resizeMode="contain" />
        </View>
        <Text style={st.pageTitle}>Preparing app</Text>
        <Text style={st.pageSubtitle}>Caching proof data for faster use.</Text>
      </View>

      <Card title="Loading">
        <View style={st.statusLine}>
          {warmup.status === 'loading' ? <Spinner small /> : <StepStateDot status={warmup.status === 'ready' ? 'completed' : warmup.status === 'error' ? 'error' : 'pending'} />}
          <Text style={st.body}>{warmup.message}</Text>
        </View>
        <PulseBar active={warmup.status === 'loading'} />
        {warmup.logs.map((line, index) => (
          <Text key={index} style={st.mutedText}>• {line}</Text>
        ))}
        {warmup.status === 'error' ? (
          <Text style={[st.body, st.err]}>Warmup failed. You can still continue.</Text>
        ) : null}
      </Card>

      <Btn
        label={warmup.status === 'loading' ? 'Preparing device...' : 'Continue'}
        onPress={onContinue}
        primary
        disabled={!canContinue}
      />
    </ScrollView>
  );
}

function RequestReviewScreen({
  requestConfig,
  go,
}: {
  requestConfig: ProofRequestPayload;
  go: (screen: Screen) => void;
}) {
  const [health, setHealth] = useState<HealthState>({
    status: 'checking',
    message: 'Checking the aggregation server...',
  });
  const [warmup, setWarmup] = useState<WarmupState>({
    status: 'loading',
    message: 'Preloading request-specific proof assets...',
    logs: [],
  });

  const disclosures = useMemo(() => collectDisclosures(requestConfig), [requestConfig]);
  const rules = useMemo(() => collectRules(requestConfig), [requestConfig]);

  const runHealthCheck = useCallback(async () => {
    setHealth({ status: 'checking', message: 'Checking the aggregation server...' });
    try {
      const result = await pingServerHealth(requestConfig.aggregateUrl);
      setHealth({
        status: 'ok',
        message: `Server reachable at ${result.url}`,
        server: result,
      });
    } catch (error: any) {
      setHealth({
        status: 'error',
        message: error?.message || 'The server did not respond to the health check.',
      });
    }
  }, [requestConfig.aggregateUrl]);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  useEffect(() => {
    let cancelled = false;
    setWarmup({
      status: 'loading',
      message: 'Preloading request-specific proof assets...',
      logs: [],
    });
    preloadRequestProofAssets(requestConfig.query, (_step, detail) => {
      if (cancelled) return;
      setWarmup((previous) => ({
        status: 'loading',
        message: detail,
        logs: [...previous.logs, detail].slice(-4),
      }));
    })
      .then(() => {
        if (cancelled) return;
        setWarmup((previous) => ({
          status: 'ready',
          message: 'Request proof assets are cached on this device.',
          logs: previous.logs,
        }));
      })
      .catch((error: any) => {
        if (cancelled) return;
        setWarmup((previous) => ({
          status: 'error',
          message: error?.message || 'Could not preload request proof assets.',
          logs: previous.logs,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [requestConfig.query]);

  return (
    <ScrollView contentContainerStyle={st.screenPad} showsVerticalScrollIndicator={false}>
      <Back onPress={() => go('home')} />
      <View style={st.pageHeader}>
        <Text style={st.pageTitle}>{requestConfig.service?.name || 'Vocdoni Passport'}</Text>
        <Text style={st.pageSubtitle}>Check the request, then continue.</Text>
      </View>

      <Card title="Server">
        {health.status === 'checking' && (
          <View style={st.statusLine}>
            <Spinner small />
            <Text style={st.body}>{health.message}</Text>
          </View>
        )}
        {health.status === 'ok' && (
          <>
            <Pill label="Reachable" tone="success" />
            <Text style={st.body}>Server reachable.</Text>
            {health.server?.service ? <Text style={st.mutedText}>Service: {health.server.service}</Text> : null}
          </>
        )}
        {health.status === 'error' && (
          <>
            <Pill label="Unreachable" tone="danger" />
            <Text style={[st.body, st.err]}>{health.message}</Text>
            <Btn label="Retry health check" onPress={runHealthCheck} />
            <Btn label="Cancel and go home" onPress={() => go('home')} subtle />
          </>
        )}
        <Text selectable style={st.monoBlock}>{requestConfig.aggregateUrl}</Text>
      </Card>

      <Card title="Preparation">
        {warmup.status === 'loading' ? (
          <View style={st.statusLine}>
            <Spinner small />
            <Text style={st.body}>{warmup.message}</Text>
          </View>
        ) : warmup.status === 'ready' ? (
          <>
            <Pill label="Ready" tone="success" />
            <Text style={st.body}>Proof assets ready.</Text>
          </>
        ) : (
          <>
            <Pill label="Partial" tone="danger" />
            <Text style={[st.body, st.err]}>{warmup.message}</Text>
          </>
        )}
        {warmup.logs.map((line, index) => (
          <Text key={index} style={st.mutedText}>• {line}</Text>
        ))}
      </Card>

      <Card title="Request">
        <Text style={st.sectionLead}>{requestConfig.service?.purpose || 'Identity proof request'}</Text>
        {requestConfig.petitionId ? <Text style={st.body}>Petition ID: {requestConfig.petitionId}</Text> : null}
        {requestConfig.service?.scope ? <Text style={st.body}>Scope: {requestConfig.service.scope}</Text> : null}
        {requestConfig.service?.mode ? <Text style={st.body}>Mode: {requestConfig.service.mode}</Text> : null}
        {requestConfig.service?.domain ? <Text style={st.body}>Domain: {requestConfig.service.domain}</Text> : null}
      </Card>

      <Card title="Disclosed fields">
        {disclosures.length > 0 ? (
          <View style={st.chipWrap}>
            {disclosures.map((field) => <Chip key={field} label={field} />)}
          </View>
        ) : (
          <Text style={st.body}>No fields will be disclosed.</Text>
        )}
      </Card>

      {rules.length > 0 && (
        <Card title="Rules">
          {rules.map((line, index) => (
            <Text key={index} style={st.body}>• {line}</Text>
          ))}
        </Card>
      )}

      <Btn
        label={health.status === 'ok' ? 'Continue to document scan' : 'Waiting for server'}
        onPress={() => go('mrz')}
        primary
        disabled={health.status !== 'ok'}
      />
    </ScrollView>
  );
}

function MrzScreen({
  go,
  onMrz,
  requestConfig,
}: {
  go: (screen: Screen) => void;
  onMrz: (mrz: MrzInfo) => void;
  requestConfig: ProofRequestPayload | null;
}) {
  const [showManual, setShowManual] = useState(false);
  const [message, setMessage] = useState('');
  const [doc, setDoc] = useState('');
  const [dob, setDob] = useState('');
  const [exp, setExp] = useState('');

  const startCameraScan = useCallback(async () => {
    if (!MrzScanner) {
      setMessage('Camera scanner not available');
      setShowManual(true);
      return;
    }
    try {
      const result = await MrzScanner.scan();
      onMrz({
        documentNumber: result.documentNumber.padEnd(9, '<'),
        dateOfBirth: result.dateOfBirth,
        dateOfExpiry: result.dateOfExpiry,
      });
      go('nfc');
    } catch (error: any) {
      setMessage(error?.message || 'Camera scan failed');
      setShowManual(true);
    }
  }, [go, onMrz]);

  const submitManual = useCallback(() => {
    const d = doc.trim().toUpperCase();
    const b = dob.trim();
    const e = exp.trim();
    if (!d) {
      Alert.alert('Missing', 'Enter the document number.');
      return;
    }
    if (!/^\d{6}$/.test(b)) {
      Alert.alert('Invalid', 'Birth date must use YYMMDD.');
      return;
    }
    if (!/^\d{6}$/.test(e)) {
      Alert.alert('Invalid', 'Expiry date must use YYMMDD.');
      return;
    }
    onMrz({
      documentNumber: d.padEnd(9, '<'),
      dateOfBirth: b,
      dateOfExpiry: e,
    });
    go('nfc');
  }, [doc, dob, exp, go, onMrz]);

  return (
    <ScrollView contentContainerStyle={st.screenPad} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Back onPress={() => go('request')} />
      <View style={st.pageHeader}>
        <Text style={st.pageTitle}>Scan the MRZ</Text>
        <Text style={st.pageSubtitle}>Use the camera first. Manual entry is the fallback.</Text>
      </View>

      {requestConfig && (
        <Card title="Request">
          <Text style={st.sectionLead}>{requestConfig.service?.name || 'Vocdoni Passport'}</Text>
          {summarizeRequest(requestConfig).map((line, index) => (
            <Text key={index} style={st.body}>• {line}</Text>
          ))}
        </Card>
      )}

      {!showManual && (
        <Card title="Camera scan">
          <Text style={st.body}>The camera will confirm the MRZ three times before continuing.</Text>
          <Btn label="Open camera scanner" onPress={startCameraScan} primary />
          <Btn label="Enter MRZ manually" onPress={() => setShowManual(true)} />
        </Card>
      )}

      {message ? (
        <Card title="Scanner message">
          <Text style={[st.body, st.err]}>{message}</Text>
        </Card>
      ) : null}

      {showManual && (
        <Card title="Manual MRZ entry">
          <Text style={st.mutedText}>Use the values printed on the data page of the passport or ID card.</Text>
          <Label text="Document number" />
          <TextInput
            style={st.input}
            value={doc}
            onChangeText={setDoc}
            placeholder="AB1234567"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
          />
          <Label text="Date of birth (YYMMDD)" />
          <TextInput
            style={st.input}
            value={dob}
            onChangeText={setDob}
            placeholder="900115"
            keyboardType="numeric"
            maxLength={6}
          />
          <Label text="Date of expiry (YYMMDD)" />
          <TextInput
            style={st.input}
            value={exp}
            onChangeText={setExp}
            placeholder="300115"
            keyboardType="numeric"
            maxLength={6}
          />
          <Btn label="Continue to NFC" onPress={submitManual} primary />
          {MrzScanner ? <Btn label="Use camera instead" onPress={() => { setShowManual(false); setMessage(''); }} /> : null}
        </Card>
      )}
    </ScrollView>
  );
}

function NfcScreen({
  go,
  mrz,
  onData,
}: {
  go: (screen: Screen) => void;
  mrz: MrzInfo;
  onData: (data: any) => void;
}) {
  const [status, setStatus] = useState('Preparing NFC reader…');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const scanAttemptRef = useRef(0);

  const startScan = useCallback(async () => {
    if (!PassportReader) {
      setError('NFC module not loaded');
      return;
    }
    const attempt = scanAttemptRef.current + 1;
    scanAttemptRef.current = attempt;
    setScanning(true);
    setError('');
    setStatus('Hold the phone against the NFC chip and keep it still until the read completes.');
    try {
      const result = await PassportReader.scan({
        documentNumber: mrz.documentNumber,
        dateOfBirth: mrz.dateOfBirth,
        dateOfExpiry: mrz.dateOfExpiry,
      });
      if (scanAttemptRef.current !== attempt) return;
      onData(result);
      go('result');
    } catch (err: any) {
      if (scanAttemptRef.current !== attempt) return;
      const message = err?.message || '';
      if (String(err?.code || '').includes('CANCELLED') || message === 'Scan cancelled') {
        return;
      }
      setError(
        message.includes('BAC failed') || message.includes('MUTUAL AUTH')
          ? 'Authentication failed. Check the MRZ values and try again.'
          : message.includes('Tag was lost') || message.includes('transceive')
            ? 'The connection was lost. Hold the phone steady and try again.'
            : message.includes('NFC_OFF')
              ? 'NFC is disabled. Enable it in the phone settings and retry.'
              : message || 'NFC read failed.',
      );
      setScanning(false);
    }
  }, [go, mrz, onData]);

  const retryScan = useCallback(async () => {
    scanAttemptRef.current += 1;
    setScanning(false);
    setError('');
    setStatus('Restarting NFC reader...');
    try {
      if (typeof PassportReader?.cancelCurrentScan === 'function') {
        await PassportReader.cancelCurrentScan();
      }
    } catch {}
    startScan();
  }, [startScan]);

  useEffect(() => {
    startScan();
  }, [startScan]);

  return (
    <ScrollView contentContainerStyle={st.screenPad} showsVerticalScrollIndicator={false}>
      <Back onPress={() => go('mrz')} />
      <View style={st.pageHeader}>
        <Text style={st.pageTitle}>Read the NFC chip</Text>
        <Text style={st.pageSubtitle}>Keep the phone on the document until it finishes.</Text>
      </View>

      <Card title="MRZ values">
        <Text style={st.body}>Document: {mrz.documentNumber.replace(/</g, '')}</Text>
        <Text style={st.body}>Birth: {mrz.dateOfBirth}</Text>
        <Text style={st.body}>Expiry: {mrz.dateOfExpiry}</Text>
      </Card>

      <Card title="NFC status">
        {scanning ? <Spinner /> : null}
        <Text style={st.body}>{status}</Text>
        <PulseBar active={scanning} />
        <Btn label="Retry scan" onPress={retryScan} />
      </Card>

      {error ? (
        <Card title="Read failed">
          <Text style={[st.body, st.err]}>{error}</Text>
          <Btn label="Retry NFC read" onPress={startScan} primary />
          <Btn label="Change MRZ values" onPress={() => go('mrz')} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

function ResultScreen({
  data,
  go,
  requestConfig,
}: {
  data: any;
  go: (screen: Screen) => void;
  requestConfig: ProofRequestPayload | null;
}) {
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [submitErr, setSubmitErr] = useState('');
  const [submitResult, setSubmitResult] = useState<ProofResult | null>(null);
  const [timeline, setTimeline] = useState<TimelineStep[]>(() => createInitialTimeline());
  const [totalDurationMs, setTotalDurationMs] = useState<number | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const autoSubmitStarted = useRef(false);
  const processStartRef = useRef<number | null>(null);
  const currentStepRef = useRef<number | null>(null);
  const startedAtRef = useRef<Record<number, number>>({});

  const appendLog = useCallback((message: string) => {
    const base = processStartRef.current ?? Date.now();
    const elapsed = ((Date.now() - base) / 1000).toFixed(1);
    setLogs((previous) => [...previous, `[+${elapsed}s] ${message}`]);
  }, []);

  const activateStep = useCallback((index: number, detail: string) => {
    const now = Date.now();
    setTimeline((previous) => {
      const next = previous.map((step) => ({ ...step }));
      const current = currentStepRef.current;
      if (current !== null && current !== index && next[current].status === 'active') {
        const startedAt = startedAtRef.current[current] ?? now;
        next[current].status = 'completed';
        next[current].durationMs = now - startedAt;
      }
      if (current !== index) {
        startedAtRef.current[index] = now;
      }
      currentStepRef.current = index;
      next[index].status = 'active';
      next[index].detail = detail;
      return next;
    });
  }, []);

  const updateProgressStep = useCallback((rawIndex: number, detail: string) => {
    const current = currentStepRef.current;
    const nextIndex = current !== null && rawIndex < current ? current : rawIndex;
    activateStep(nextIndex, detail);
    return nextIndex;
  }, [activateStep]);

  const finishFlow = useCallback((status: 'completed' | 'error', detail: string) => {
    const now = Date.now();
    setTimeline((previous) => {
      const next = previous.map((step) => ({ ...step }));
      const current = currentStepRef.current;
      if (current !== null) {
        const startedAt = startedAtRef.current[current] ?? now;
        next[current].status = status;
        next[current].durationMs = now - startedAt;
        next[current].detail = detail;
      }
      return next;
    });
    currentStepRef.current = null;
    if (processStartRef.current != null) {
      setTotalDurationMs(now - processStartRef.current);
    }
  }, []);

  const runSubmit = useCallback(async () => {
    if (!requestConfig?.aggregateUrl) {
      Alert.alert('Missing request', 'Load a valid server request before reading the document.');
      return;
    }

    setSubmitBusy(true);
    setSubmitErr('');
    setSubmitResult(null);
    setSubmitStatus('Preparing document...');
    setTimeline(createInitialTimeline());
    setLogs([]);
    setTotalDurationMs(null);
    processStartRef.current = Date.now();
    currentStepRef.current = null;
    startedAtRef.current = {};
    appendLog('Proof flow started');
    activateStep(0, 'Reading DG1 and selecting the compatible circuits');

    try {
      const inner = await generatePassportInnerProofPackage(
        { dg1: data.dg1, sod: data.sod, dg2: data.dg2 },
        (step, detail) => {
          const text = detail || step;
          const index = updateProgressStep(mapGeneratorPhaseToIndex(step), text);
          setSubmitStatus(text);
          appendLog(`${PROOF_STEPS[index].title}: ${text}`);
        },
        requestConfig.query,
        requestConfig.service,
      );

      activateStep(4, 'Uploading inner proofs and waiting for the aggregation server');
      setSubmitStatus('Sending the inner proof bundle to the aggregation server...');
      appendLog('Aggregate on server: uploading inner proof bundle');

      const result = await aggregateProofOnServer(requestConfig.aggregateUrl, inner, requestConfig);
      setSubmitResult(result);
      activateStep(5, 'Server accepted the final outer proof');
      setSubmitStatus('Success. The final proof was accepted by the server.');
      appendLog(`Finalize result: proof ${result.name} accepted by server`);
      finishFlow('completed', 'Server accepted the final proof');
    } catch (error: any) {
      const message = error?.message || 'Proof generation failed';
      setSubmitErr(message);
      setSubmitStatus('Proof flow failed');
      appendLog(`Error: ${message}`);
      finishFlow('error', message);
    } finally {
      setSubmitBusy(false);
    }
  }, [activateStep, appendLog, data.dg1, data.dg2, data.sod, finishFlow, requestConfig, updateProgressStep]);

  useEffect(() => {
    if (!requestConfig?.aggregateUrl) return;
    if (autoSubmitStarted.current) return;
    autoSubmitStarted.current = true;
    runSubmit();
  }, [requestConfig?.aggregateUrl, runSubmit]);

  const supportReport = useMemo(() => buildSupportReport({
    requestConfig,
    submitResult,
    submitErr,
    steps: timeline,
    totalDurationMs,
    logs,
  }), [logs, requestConfig, submitErr, submitResult, timeline, totalDurationMs]);

  const isSuccess = !!submitResult && submitErr === '';

  return (
    <ScrollView contentContainerStyle={st.screenPad} showsVerticalScrollIndicator={false}>
      <Back onPress={() => go('home')} />
      <View style={st.pageHeader}>
        <Text style={st.pageTitle}>{isSuccess ? 'Success' : 'Creating your proof'}</Text>
        <Text style={st.pageSubtitle}>
          {isSuccess ? 'The proof was accepted.' : 'Please keep the app open.'}
        </Text>
      </View>

      {requestConfig && (
        <Card title="Request">
          <Text style={st.sectionLead}>{requestConfig.service?.name || 'Vocdoni Passport'}</Text>
          <Text style={st.body}>{requestConfig.service?.purpose || 'Proof request'}</Text>
          <Text style={st.mutedText}>{requestConfig.aggregateUrl}</Text>
        </Card>
      )}

      {isSuccess ? (
        <Card title="SUCCESS" dark>
          <View style={st.successHeader}>
            <View style={st.successBadge}><Text style={st.successBadgeText}>✓</Text></View>
            <View style={st.successMeta}>
              <Text style={st.successTitle}>Proof delivered successfully</Text>
              <Text style={st.successSubtitle}>The final zk proof was accepted and verified by the server.</Text>
            </View>
          </View>
          <View style={st.successGrid}>
            <Metric label="Final proof" value={submitResult?.name || 'n/a'} />
            <Metric label="Version" value={submitResult?.version || 'n/a'} />
            <Metric label="Total time" value={formatSeconds(totalDurationMs)} />
            <Metric label="Verified" value={submitResult?.metadata?.proof_verified || 'true'} />
          </View>
          {submitResult?.nullifier ? (
            <>
              <Text style={st.labelOnDark}>Nullifier</Text>
              <Text selectable style={st.monoOnDark}>{submitResult.nullifier}</Text>
              <Btn
                label="Copy nullifier"
                onPress={() => {
                  Clipboard.setString(submitResult.nullifier || '');
                  Alert.alert('Copied', 'Nullifier copied to clipboard.');
                }}
                primary
              />
            </>
          ) : null}
        </Card>
      ) : null}

      <Card title="Proof progress">
        <Text style={st.sectionLead}>
          {submitBusy ? 'This can take about a minute.' : 'Summary'}
        </Text>
        <PulseBar active={submitBusy} />
        {timeline.map((step, index) => (
          <TimelineRow key={step.id} step={step} index={index + 1} />
        ))}
        <View style={st.totalRow}>
          <Text style={st.totalLabel}>Total</Text>
          <Text style={st.totalValue}>{formatSeconds(totalDurationMs)}</Text>
        </View>
        {submitStatus ? <Text style={st.mutedText}>{submitStatus}</Text> : null}
      </Card>

      {submitErr ? (
        <Card title="Something went wrong">
          <Pill label="Failed" tone="danger" />
          <Text selectable style={[st.body, st.err]}>{submitErr}</Text>
          <Btn label="Retry proof flow" onPress={runSubmit} primary />
          <Btn label="Cancel and go home" onPress={() => go('home')} subtle />
        </Card>
      ) : null}

      <Card title="Technical details">
        <Text style={st.body}>Open this only if you need to report a problem.</Text>
        <Btn
          label={showDiagnostics ? 'Hide technical details' : 'Show technical details'}
          onPress={() => setShowDiagnostics((value) => !value)}
        />
        {showDiagnostics ? (
          <>
            <Text selectable style={st.monoBlock}>{supportReport}</Text>
            <Btn
              label="Copy support report"
              onPress={() => {
                Clipboard.setString(supportReport);
                Alert.alert('Copied', 'Support report copied to clipboard.');
              }}
              primary
            />
          </>
        ) : null}
      </Card>

      <Btn label="Start another proof" onPress={() => go('home')} primary />
    </ScrollView>
  );
}

function TimelineRow({ step, index }: { step: TimelineStep; index: number }) {
  return (
    <View style={[
      st.timelineRow,
      step.status === 'active' ? st.timelineRowActive : null,
      step.status === 'completed' ? st.timelineRowCompleted : null,
      step.status === 'error' ? st.timelineRowError : null,
    ]}>
      <View style={st.timelineLeading}>
        <Text style={st.timelineIndex}>{index}</Text>
        <StepStateDot status={step.status} />
      </View>
      <View style={st.timelineContent}>
        <View style={st.timelineHeader}>
          <Text style={st.timelineTitle}>{step.title}</Text>
          <Text style={st.timelineDuration}>{step.durationMs != null ? formatSeconds(step.durationMs) : '...'}</Text>
        </View>
        <Text style={st.timelineDescription}>{step.detail || step.description}</Text>
      </View>
    </View>
  );
}

function StepStateDot({ status }: { status: TimelineStatus }) {
  if (status === 'active') {
    return <PulsingDot />;
  }
  return (
    <View style={[
      st.dotBase,
      status === 'completed' ? st.dotCompleted : null,
      status === 'error' ? st.dotError : null,
      status === 'pending' ? st.dotPending : null,
    ]}>
      <Text style={st.dotText}>
        {status === 'completed' ? '✓' : status === 'error' ? '!' : ''}
      </Text>
    </View>
  );
}

function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [scale]);

  return (
    <Animated.View style={[st.dotBase, st.dotActive, { transform: [{ scale }] }]}>
      <View style={st.dotInner} />
    </Animated.View>
  );
}

function PulseBar({ active }: { active: boolean }) {
  const opacity = useRef(new Animated.Value(active ? 1 : 0.55)).current;
  useEffect(() => {
    if (!active) {
      opacity.setValue(0.55);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 900, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, opacity]);

  return (
    <Animated.View style={[st.pulseRail, { opacity }]}>
      <View style={st.pulseFill} />
    </Animated.View>
  );
}

function Card({
  title,
  children,
  dark,
}: {
  title?: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <View style={[st.card, dark ? st.cardDark : null]}>
      {title ? <Text style={[st.cardTitle, dark ? st.cardTitleDark : null]}>{title}</Text> : null}
      {children}
    </View>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return <Text style={st.body}>{ok ? '✓' : '•'} {label}</Text>;
}

function Btn({
  label,
  onPress,
  primary,
  disabled,
  subtle,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  subtle?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        st.btn,
        primary ? st.btnPrimary : subtle ? st.btnSubtle : st.btnSecondary,
        disabled ? st.btnDisabled : null,
      ]}
      onPress={onPress}
      activeOpacity={0.84}
      disabled={disabled}
    >
      <Text style={[
        st.btnText,
        primary ? st.btnPrimaryText : subtle ? st.btnSubtleText : st.btnSecondaryText,
        disabled ? st.btnDisabledText : null,
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Back({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <Text style={st.backLink}>← Back</Text>
    </TouchableOpacity>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={st.label}>{text}</Text>;
}

function Spinner({ small }: { small?: boolean }) {
  return <ActivityIndicator size={small ? 'small' : 'large'} color="#2e6cff" style={small ? undefined : { marginVertical: 12 }} />;
}

function Chip({ label }: { label: string }) {
  return (
    <View style={st.chip}>
      <Text style={st.chipText}>{label}</Text>
    </View>
  );
}

function Pill({ label, tone }: { label: string; tone: 'success' | 'danger' }) {
  return (
    <View style={[st.pill, tone === 'success' ? st.pillSuccess : st.pillDanger]}>
      <Text style={[st.pillText, tone === 'success' ? st.pillSuccessText : st.pillDangerText]}>{label}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.metricCard}>
      <Text style={st.metricLabel}>{label}</Text>
      <Text style={st.metricValue}>{value}</Text>
    </View>
  );
}

export default function App() {
  const [bootReady, setBootReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  const [mrz, setMrz] = useState<MrzInfo | null>(null);
  const [passportData, setPassportData] = useState<any>(null);
  const [requestConfig, setRequestConfig] = useState<ProofRequestPayload | null>(null);
  const [bootWarmup, setBootWarmup] = useState<WarmupState>({
    status: 'loading',
    message: 'Preparing startup assets...',
    logs: [],
  });

  useEffect(() => {
    let cancelled = false;
    preloadCoreProofAssets((_step, detail) => {
      if (cancelled) return;
      setBootWarmup((previous) => ({
        status: 'loading',
        message: detail,
        logs: [...previous.logs, detail].slice(-5),
      }));
    })
      .then(() => {
        if (cancelled) return;
        setBootWarmup((previous) => ({
          status: 'ready',
          message: 'Device proof assets are ready.',
          logs: previous.logs,
        }));
      })
      .catch((error: any) => {
        if (cancelled) return;
        setBootWarmup((previous) => ({
          status: 'error',
          message: error?.message || 'Startup preparation failed.',
          logs: previous.logs,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scanRequest = useCallback(async () => {
    if (!ServerQrScanner) {
      Alert.alert('Unavailable', 'The QR scanner module is not loaded.');
      return;
    }
    try {
      const result = await ServerQrScanner.scan();
      const parsed = await resolveRequestPayload(result?.payload || '');
      setRequestConfig(parsed);
      setScreen('request');
    } catch (error: any) {
      Alert.alert('QR scan failed', error?.message || 'Could not scan the server request.');
    }
  }, []);

  const loadRequestLink = useCallback(async (raw: string) => {
    const parsed = await resolveRequestPayload(raw);
    setRequestConfig(parsed);
    setScreen('request');
  }, []);

  return (
    <SafeAreaView style={st.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#f3f6fb" />
      {!bootReady && (
        <BootScreen
          warmup={bootWarmup}
          onContinue={() => setBootReady(true)}
        />
      )}
      {bootReady && screen === 'home' && (
        <HomeScreen
          go={setScreen}
          onScanRequest={scanRequest}
          onLoadRequestLink={loadRequestLink}
          requestConfig={requestConfig}
          onClearRequest={() => setRequestConfig(null)}
        />
      )}
      {bootReady && screen === 'request' && requestConfig && (
        <RequestReviewScreen requestConfig={requestConfig} go={setScreen} />
      )}
      {bootReady && screen === 'mrz' && (
        <MrzScreen go={setScreen} onMrz={setMrz} requestConfig={requestConfig} />
      )}
      {bootReady && screen === 'nfc' && mrz && (
        <NfcScreen go={setScreen} mrz={mrz} onData={setPassportData} />
      )}
      {bootReady && screen === 'result' && passportData && (
        <ResultScreen data={passportData} go={setScreen} requestConfig={requestConfig} />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f3f6fb',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  },
  screenPad: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 56,
  },
  brandHeader: {
    marginBottom: 16,
  },
  heroCard: {
    backgroundColor: '#0d111c',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
  },
  requestHero: {
    backgroundColor: '#0d111c',
    borderRadius: 24,
    padding: 22,
    marginTop: 6,
    marginBottom: 16,
  },
  logoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  logoBadgeCompact: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  logoImage: {
    width: 132,
    height: 54,
  },
  logoImageCompact: {
    width: 108,
    height: 44,
  },
  heroEyebrow: {
    color: '#7ea4ff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: '#cbd3e6',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  pageHeader: {
    marginTop: 8,
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: '#0f172a',
  },
  pageSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#51607a',
    marginTop: 6,
  },
  backLink: {
    color: '#2e6cff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#0b1220',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardDark: {
    backgroundColor: '#111827',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  cardTitleDark: {
    color: '#f8fafc',
  },
  sectionLead: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#10203a',
    marginBottom: 8,
  },
  sectionGap: {
    marginTop: 14,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#30435f',
    marginBottom: 4,
  },
  mutedText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6b7b93',
    marginTop: 6,
  },
  linkInput: {
    marginTop: 12,
    marginBottom: 2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7e1f1',
    backgroundColor: '#f8fbff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#10203a',
    fontSize: 14,
  },
  err: {
    color: '#b42318',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  btn: {
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  btnPrimary: {
    backgroundColor: '#2e6cff',
  },
  btnSecondary: {
    backgroundColor: '#ecf2ff',
    borderWidth: 1,
    borderColor: '#d4e2ff',
  },
  btnSubtle: {
    backgroundColor: '#f7f9fd',
    borderWidth: 1,
    borderColor: '#e1e8f5',
  },
  btnDisabled: {
    opacity: 0.52,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  btnPrimaryText: {
    color: '#ffffff',
  },
  btnSecondaryText: {
    color: '#214fb6',
  },
  btnSubtleText: {
    color: '#5c6f8f',
  },
  btnDisabledText: {
    color: '#8da0bd',
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#eef4ff',
    borderWidth: 1,
    borderColor: '#cfe0ff',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#214fb6',
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  pillSuccess: {
    backgroundColor: '#e8fbef',
  },
  pillDanger: {
    backgroundColor: '#feefef',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  pillSuccessText: {
    color: '#067647',
  },
  pillDangerText: {
    color: '#b42318',
  },
  monoBlock: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    color: '#d8e0ef',
    fontSize: 11,
    lineHeight: 17,
    fontFamily: 'monospace',
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  successBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1b7f46',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  successBadgeText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
  },
  successMeta: {
    flex: 1,
  },
  successTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
  },
  successSubtitle: {
    color: '#c7d0e2',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  successGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 16,
    backgroundColor: '#182235',
    padding: 12,
  },
  metricLabel: {
    color: '#8fa4c9',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  labelOnDark: {
    color: '#9cb0d2',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: 4,
    marginBottom: 6,
  },
  monoOnDark: {
    color: '#f8fafc',
    backgroundColor: '#182235',
    borderRadius: 14,
    padding: 12,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 17,
  },
  pulseRail: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#dde7fb',
    overflow: 'hidden',
    marginBottom: 14,
  },
  pulseFill: {
    width: '58%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2e6cff',
  },
  timelineRow: {
    flexDirection: 'row',
    borderRadius: 18,
    backgroundColor: '#f7f9fd',
    borderWidth: 1,
    borderColor: '#e4ebf8',
    padding: 14,
    marginBottom: 10,
  },
  timelineRowActive: {
    borderColor: '#9cbcff',
    backgroundColor: '#eef4ff',
  },
  timelineRowCompleted: {
    borderColor: '#b6e2c6',
    backgroundColor: '#effaf3',
  },
  timelineRowError: {
    borderColor: '#f5b8b2',
    backgroundColor: '#fff4f3',
  },
  timelineLeading: {
    width: 38,
    alignItems: 'center',
    marginRight: 10,
  },
  timelineIndex: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8797b3',
    marginBottom: 8,
  },
  timelineContent: {
    flex: 1,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timelineTitle: {
    flex: 1,
    color: '#10203a',
    fontSize: 16,
    fontWeight: '700',
  },
  timelineDuration: {
    color: '#5677b6',
    fontSize: 12,
    fontWeight: '700',
  },
  timelineDescription: {
    color: '#5e6f8c',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  dotBase: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dotPending: {
    backgroundColor: '#ffffff',
    borderColor: '#d4ddec',
  },
  dotActive: {
    backgroundColor: '#2e6cff',
    borderColor: '#2e6cff',
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  dotCompleted: {
    backgroundColor: '#1f9254',
    borderColor: '#1f9254',
  },
  dotError: {
    backgroundColor: '#d92d20',
    borderColor: '#d92d20',
  },
  dotText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e4ebf8',
  },
  totalLabel: {
    color: '#10203a',
    fontSize: 16,
    fontWeight: '800',
  },
  totalValue: {
    color: '#2e6cff',
    fontSize: 16,
    fontWeight: '800',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d8e2f1',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#f9fbff',
    color: '#0f172a',
    marginBottom: 8,
  },
});
