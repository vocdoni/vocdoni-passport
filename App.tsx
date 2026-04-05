// Polyfills must be imported first
import 'react-native-get-random-values';
import 'text-encoding-polyfill';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { StatusBar, View, StyleSheet, Platform, BackHandler } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
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
  const { status, biometricsAvailable, authenticate, refreshAuthState } = useAuth();
  const { status: walletStatus } = useWallet();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

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

  // Handle Android back button - navigate back instead of exiting app
  useEffect(() => {
    if (Platform.OS !== 'android') {return;}

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigationRef.current?.canGoBack()) {
        navigationRef.current.goBack();
        return true; // Prevent default (exit app)
      }
      return false; // Allow default behavior (exit app) when at root
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
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <BootScreen onReady={handleBootComplete} />
      </>
    );
  }

  if (status === 'checking' || walletStatus === 'checking') {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <View style={styles.loading} />
      </>
    );
  }

  if (status === 'locked') {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <AuthLockScreen onUnlock={handleUnlock} biometricsAvailable={biometricsAvailable} />
      </>
    );
  }

  const needsWalletSetup = walletStatus === 'no_wallet';

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <NavigationContainer ref={navigationRef}>
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
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
