import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ServerCheckScreen } from '../screens/signing/ServerCheckScreen';
import { PetitionDetailsScreen } from '../screens/signing/PetitionDetailsScreen';
import { SelectIDScreen } from '../screens/signing/SelectIDScreen';
import { DisclosureScreen } from '../screens/signing/DisclosureScreen';
import { ProofProgressScreen } from '../screens/signing/ProofProgressScreen';
import { SigningSuccessScreen } from '../screens/signing/SuccessScreen';

import type { SigningStackParamList } from './types';

const Stack = createNativeStackNavigator<SigningStackParamList>();

export function SigningNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="ServerCheck" component={ServerCheckScreen} />
      <Stack.Screen name="PetitionDetails" component={PetitionDetailsScreen} />
      <Stack.Screen name="SelectID" component={SelectIDScreen} />
      <Stack.Screen name="DisclosureReview" component={DisclosureScreen} />
      <Stack.Screen name="ProofProgress" component={ProofProgressScreen} />
      <Stack.Screen name="SigningSuccess" component={SigningSuccessScreen} />
    </Stack.Navigator>
  );
}
