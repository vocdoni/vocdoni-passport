import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/common';
import { Spinner } from '../../components/common/Spinner';
import { colors, commonStyles } from '../../components/common/styles';
import { pingServerHealth } from '../../services/ServerClient';
import type { SigningStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<SigningStackParamList, 'ServerCheck'>;
type RouteType = RouteProp<SigningStackParamList, 'ServerCheck'>;

export function ServerCheckScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const { request } = route.params;

  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkServer = useCallback(async () => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    setStatus('checking');
    setErrorMessage('');
    try {
      await pingServerHealth(request.aggregateUrl);
      setStatus('ok');
      navigationTimeoutRef.current = setTimeout(() => {
        navigation.replace('PetitionDetails', { request });
      }, 500);
    } catch (error: any) {
      setStatus('error');
      setErrorMessage(error?.message || 'Could not connect to the server.');
    }
  }, [navigation, request]);

  useEffect(() => {
    checkServer();
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, [checkServer]);

  const handleCancel = () => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    navigation.getParent()?.goBack();
  };

  return (
    <View style={[commonStyles.safeArea, styles.container]}>
      <TouchableOpacity style={styles.closeButton} onPress={handleCancel}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        {status === 'checking' && (
          <>
            <Spinner size="large" />
            <Text style={styles.title}>Connecting to server...</Text>
            <Text style={styles.subtitle}>{getDomain(request.aggregateUrl)}</Text>
          </>
        )}

        {status === 'ok' && (
          <>
            <View style={styles.successBadge}>
              <Text style={styles.successIcon}>✓</Text>
            </View>
            <Text style={styles.title}>Server connected</Text>
            <Text style={styles.subtitle}>Loading petition details...</Text>
          </>
        )}

        {status === 'error' && (
          <>
            <View style={styles.errorBadge}>
              <Text style={styles.errorIcon}>!</Text>
            </View>
            <Text style={styles.title}>Server Unavailable</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Text style={styles.subtitle}>{getDomain(request.aggregateUrl)}</Text>
            <View style={styles.buttons}>
              <Button label="Retry" onPress={checkServer} variant="primary" />
              <Button label="Cancel" onPress={handleCancel} variant="subtle" />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  closeButtonText: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '600',
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginTop: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  successBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIcon: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  errorBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIcon: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  buttons: {
    marginTop: 24,
    width: '100%',
  },
});
