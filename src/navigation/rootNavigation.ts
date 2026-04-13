import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';
import type { ProofRequestPayload } from '../services/ServerClient';

export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToSigningRequest(request: ProofRequestPayload) {
  if (!rootNavigationRef.isReady()) {
    throw new Error('Signing flow is not available right now.');
  }

  rootNavigationRef.navigate('Signing', {
    screen: 'ServerCheck',
    params: { request },
  });
}
