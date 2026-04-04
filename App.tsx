import React, { useCallback, useEffect, useState, useRef } from 'react';
import { StatusBar, View, StyleSheet, Platform, BackHandler } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Buffer } from 'buffer';

import 'text-encoding-polyfill';

import { TabNavigator } from './src/navigation/TabNavigator';
import { SigningNavigator } from './src/navigation/SigningNavigator';
import { BootScreen } from './src/screens/BootScreen';
import { AuthLockScreen } from './src/screens/AuthLockScreen';
import { useAuth } from './src/hooks/useAuth';
import { colors } from './src/components/common/styles';
import type { RootStackParamList } from './src/navigation/types';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer as any;
}

const RootStack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
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

export default function App() {
  const [bootReady, setBootReady] = useState(false);
  const { status, biometricsAvailable, authenticate, refreshAuthState } = useAuth();
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
    if (Platform.OS !== 'android') return;

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
      <GestureHandlerRootView style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <BootScreen onReady={handleBootComplete} />
      </GestureHandlerRootView>
    );
  }

  if (status === 'checking') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <View style={styles.loading} />
      </GestureHandlerRootView>
    );
  }

  if (status === 'locked') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <AuthLockScreen onUnlock={handleUnlock} biometricsAvailable={biometricsAvailable} />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
      </NavigationContainer>
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
