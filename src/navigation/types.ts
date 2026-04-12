import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { ProofRequestPayload } from '../services/ServerClient';

export type TabParamList = {
  IDs: NavigatorScreenParams<IDsStackParamList> | undefined;
  Scanner: undefined;
  History: NavigatorScreenParams<HistoryStackParamList> | undefined;
  Wallet: undefined;
};

export type WalletStackParamList = {
  WalletSetupChoice: undefined;
  WalletCreate: undefined;
  WalletRestore: undefined;
  WalletSetupComplete: undefined;
};

export type IDsStackParamList = {
  IDsList: undefined;
  About: undefined;
  IDDetails: { id: string };
  AddIDMrz: undefined;
  AddIDNfc: { documentNumber: string; dateOfBirth: string; dateOfExpiry: string };
  AddIDSuccess: { id: string };
  // Debug/Development screens
  ExploreIDMrz: undefined;
  ExploreIDNfc: { documentNumber: string; dateOfBirth: string; dateOfExpiry: string };
  ExploreIDResult: {
    dg1: string;
    sod: string;
    dg2?: string;
    dg7?: string;
    dg11?: string;
    dg12?: string;
    dg13?: string;
    dg14?: string;
    dg15?: string;
  };
};

export type ScannerStackParamList = {
  ScannerMain: undefined;
};

export type HistoryStackParamList = {
  HistoryList: undefined;
  HistoryDetails: { id: string };
};

export type SigningStackParamList = {
  ServerCheck: { request: ProofRequestPayload };
  PetitionDetails: { request: ProofRequestPayload };
  SelectID: { request: ProofRequestPayload };
  DisclosureReview: { request: ProofRequestPayload; selectedIdRef: string };
  ProofProgress: { request: ProofRequestPayload; selectedIdRef: string };
  SigningSuccess: {
    request: ProofRequestPayload;
    nullifier?: string;
    durationMs: number;
    proofName?: string;
  };
};

export type RootStackParamList = {
  Boot: undefined;
  WalletSetup: NavigatorScreenParams<WalletStackParamList>;
  Main: NavigatorScreenParams<TabParamList>;
  Signing: NavigatorScreenParams<SigningStackParamList>;
  AuthLock: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<TabParamList, T>,
    RootStackScreenProps<keyof RootStackParamList>
  >;

export type IDsStackScreenProps<T extends keyof IDsStackParamList> =
  NativeStackScreenProps<IDsStackParamList, T>;

export type SigningStackScreenProps<T extends keyof SigningStackParamList> =
  NativeStackScreenProps<SigningStackParamList, T>;

export type HistoryStackScreenProps<T extends keyof HistoryStackParamList> =
  NativeStackScreenProps<HistoryStackParamList, T>;

export type WalletStackScreenProps<T extends keyof WalletStackParamList> =
  NativeStackScreenProps<WalletStackParamList, T>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
