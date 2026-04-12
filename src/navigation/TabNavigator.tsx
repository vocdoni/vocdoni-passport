import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IDsScreen } from '../screens/ids/IDsScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { IDDetailsScreen } from '../screens/ids/IDDetailsScreen';
import { MrzScanScreen } from '../screens/ids/AddIDFlow/MrzScanScreen';
import { NfcReadScreen } from '../screens/ids/AddIDFlow/NfcReadScreen';
import { AddIDSuccessScreen } from '../screens/ids/AddIDFlow/SuccessScreen';
import { ExploreMrzScreen, ExploreNfcScreen, ExploreResultScreen } from '../screens/ids/ExploreIDFlow';
import { ScannerScreen } from '../screens/scanner/ScannerScreen';
import { HistoryScreen } from '../screens/history/HistoryScreen';
import { WalletScreen } from '../screens/wallet';

import { colors } from '../components/common/styles';
import type { TabParamList, IDsStackParamList, HistoryStackParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const IDsStack = createNativeStackNavigator<IDsStackParamList>();
const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();

function IDsStackNavigator() {
  return (
    <IDsStack.Navigator screenOptions={{ headerShown: false }}>
      <IDsStack.Screen name="IDsList" component={IDsScreen} />
      <IDsStack.Screen name="About" component={AboutScreen} />
      <IDsStack.Screen name="IDDetails" component={IDDetailsScreen} />
      <IDsStack.Screen name="AddIDMrz" component={MrzScanScreen} />
      <IDsStack.Screen name="AddIDNfc" component={NfcReadScreen} />
      <IDsStack.Screen name="AddIDSuccess" component={AddIDSuccessScreen} />
      {/* Debug/Development screens */}
      <IDsStack.Screen name="ExploreIDMrz" component={ExploreMrzScreen} />
      <IDsStack.Screen name="ExploreIDNfc" component={ExploreNfcScreen} />
      <IDsStack.Screen name="ExploreIDResult" component={ExploreResultScreen} />
    </IDsStack.Navigator>
  );
}

function HistoryStackNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={{ headerShown: false }}>
      <HistoryStack.Screen name="HistoryList" component={HistoryScreen} />
    </HistoryStack.Navigator>
  );
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 12);

  return (
    <View style={[styles.tabBar, { paddingBottom: bottomPadding }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        // Skip rendering Wallet tab (it's accessed via Tools menu)
        if (route.name === 'Wallet') {
          return null;
        }

        let icon = '🪪';
        let label = 'IDs';

        if (route.name === 'Scanner') {
          icon = '📷';
          label = 'Scan & Sign';
        } else if (route.name === 'History') {
          icon = '📜';
          label = 'History';
        }

        const isCenter = route.name === 'Scanner';

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            style={[styles.tabItem, isCenter && styles.tabItemCenter]}
            activeOpacity={0.7}
          >
            {isCenter ? (
              <View style={styles.centerWrapper}>
                <View style={[styles.centerButton, isFocused && styles.centerButtonFocused]}>
                  <Text style={styles.centerIcon}>{icon}</Text>
                </View>
                <Text style={[styles.centerLabel, isFocused && styles.tabLabelFocused]}>{label}</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.tabIcon, isFocused && styles.tabIconFocused]}>{icon}</Text>
                <Text style={[styles.tabLabel, isFocused && styles.tabLabelFocused]}>{label}</Text>
              </>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function renderCustomTabBar(props: BottomTabBarProps) {
  return <CustomTabBar {...props} />;
}

export function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={renderCustomTabBar}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="IDs" component={IDsStackNavigator} />
      <Tab.Screen name="Scanner" component={ScannerScreen} />
      <Tab.Screen name="History" component={HistoryStackNavigator} />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ tabBarButton: () => null }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabItemCenter: {
    marginTop: -20,
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 4,
    opacity: 0.5,
  },
  tabIconFocused: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabLabelFocused: {
    color: colors.primary,
  },
  centerWrapper: {
    alignItems: 'center',
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  centerButtonFocused: {
    backgroundColor: colors.primaryDark,
  },
  centerIcon: {
    fontSize: 26,
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
});
