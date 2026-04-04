import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  WalletSetupChoiceScreen,
  WalletCreateScreen,
  WalletRestoreScreen,
  WalletSetupCompleteScreen,
} from '../screens/wallet';
import type { WalletStackParamList } from './types';

const WalletStack = createNativeStackNavigator<WalletStackParamList>();

export function WalletSetupNavigator() {
  return (
    <WalletStack.Navigator screenOptions={{ headerShown: false }}>
      <WalletStack.Screen name="WalletSetupChoice" component={WalletSetupChoiceScreen} />
      <WalletStack.Screen name="WalletCreate" component={WalletCreateScreen} />
      <WalletStack.Screen name="WalletRestore" component={WalletRestoreScreen} />
      <WalletStack.Screen name="WalletSetupComplete" component={WalletSetupCompleteScreen} />
    </WalletStack.Navigator>
  );
}
