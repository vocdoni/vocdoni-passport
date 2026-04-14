// Polyfills must be imported first
import 'react-native-get-random-values';
import 'text-encoding-polyfill';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { StatusBar, View, StyleSheet, BackHandler, Platform, Alert, Linking, ToastAndroid } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Buffer } from 'buffer';

import { TabNavigator } from './src/navigation/TabNavigator';
import { SigningNavigator } from './src/navigation/SigningNavigator';
import { WalletSetupNavigator } from './src/navigation/WalletSetupNavigator';
import { BootScreen } from './src/screens/BootScreen';
import { AuthLockScreen } from './src/screens/AuthLockScreen';
import { useAuth } from './src/hooks/useAuth';
import { WalletProvider, useWallet } from './src/contexts/WalletContext';
import { colors } from './src/components/common/styles';
import type { RootStackParamList } from './src/navigation/types';
import { resolveProofRequestPayload } from './src/utils/requestLinks';
import { rootNavigationRef, navigateToSigningRequest } from './src/navigation/rootNavigation';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer as any;
}

const RootStack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator({ needsWalletSetup }: { needsWalletSetup: boolean }) {
  return (
    <RootStack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={needsWalletSetup ? 'WalletSetup' : 'Main'}
    >
      <RootStack.Screen name="WalletSetup" component={WalletSetupNavigator} />
      <RootStack.Screen name="Main" component={TabNavigator} />
      <RootStack.Screen
        name="Signing"
        component={SigningNavigator}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </RootStack.Navigator>
  );
}

function AppContent() {
  const [bootReady, setBootReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const { status, biometricsAvailable, authenticate, refreshAuthState } = useAuth();
  const { status: walletStatus } = useWallet();
  const handledUrlRef = useRef<string | null>(null);
  const isProcessingUrlRef = useRef(false);

  useEffect(() => {
    if (bootReady && status === 'locked') {
      authenticate();
    }
  }, [bootReady, status, authenticate]);

  useEffect(() => {
    if (bootReady) {
      refreshAuthState();
    }
  }, [bootReady, refreshAuthState]);

  useEffect(() => {
    let mounted = true;

    Linking.getInitialURL()
      .then((url) => {
        if (mounted && url) {
          setPendingUrl(url);
        }
      })
      .catch(() => {});

    const subscription = Linking.addEventListener('url', (event) => {
      setPendingUrl(event.url);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!bootReady || !navigationReady || !pendingUrl || isProcessingUrlRef.current) {
      return;
    }

    if (status === 'checking' || status === 'locked' || walletStatus === 'checking' || walletStatus === 'no_wallet') {
      return;
    }

    const normalizedUrl = pendingUrl.trim();
    if (!normalizedUrl) {
      setPendingUrl(null);
      return;
    }

    if (handledUrlRef.current === normalizedUrl) {
      setPendingUrl(null);
      return;
    }

        isProcessingUrlRef.current = true;
    resolveProofRequestPayload(normalizedUrl)
      .then((payload) => {
        handledUrlRef.current = normalizedUrl;
        navigateToSigningRequest(payload);
      })
      .catch((error: any) => {
        Alert.alert('Invalid Link', error?.message || 'Could not open the request link.');
      })
      .finally(() => {
        isProcessingUrlRef.current = false;
        setPendingUrl((current) => current === normalizedUrl ? null : current);
      });
  }, [bootReady, navigationReady, pendingUrl, status, walletStatus]);

  // Handle Android back button
  useEffect(() => {
    if (Platform.OS !== 'android') {return;}

    let lastBackPress = 0;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (rootNavigationRef.isReady() && rootNavigationRef.canGoBack()) {
        rootNavigationRef.goBack();
        return true;
      }

      // At the root screen: require two quick back presses to exit
      const now = Date.now();
      if (now - lastBackPress < 2000) {
        return false; // second press within 2 s — exit
      }
      lastBackPress = now;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      return true; // swallow the first press
    });

    return () => backHandler.remove();
  }, []);

  const handleBootComplete = useCallback(() => {
    setBootReady(true);
  }, []);

  const handleUnlock = useCallback(async () => {
    await authenticate();
  }, [authenticate]);

  if (!bootReady) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <BootScreen onReady={handleBootComplete} />
      </>
    );
  }

  if (status === 'checking' || walletStatus === 'checking') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={styles.loading} />
      </>
    );
  }

  if (status === 'locked') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <AuthLockScreen onUnlock={handleUnlock} biometricsAvailable={biometricsAvailable} />
      </>
    );
  }

  const needsWalletSetup = walletStatus === 'no_wallet';

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <NavigationContainer ref={rootNavigationRef} theme={DarkTheme} onReady={() => setNavigationReady(true)}>
        <RootNavigator needsWalletSetup={needsWalletSetup} />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <WalletProvider>
        <AppContent />
      </WalletProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
