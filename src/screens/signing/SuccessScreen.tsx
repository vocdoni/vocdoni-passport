import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/common';
import { colors, borderRadius } from '../../components/common/styles';
import type { SigningStackParamList, RootStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<SigningStackParamList, 'SigningSuccess'>;
type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<SigningStackParamList, 'SigningSuccess'>;

export function SigningSuccessScreen() {
  const navigation = useNavigation<NavigationProp>();
  const rootNavigation = useNavigation<RootNavigationProp>();
  const route = useRoute<RouteType>();
  const { request, durationMs } = route.params;

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(checkmarkScale, {
        toValue: 1,
        tension: 100,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, opacityAnim, checkmarkScale, contentOpacity]);

  const handleViewHistory = () => {
    rootNavigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'History' } }],
    });
  };

  const handleClose = () => {
    rootNavigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'IDs' } }],
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGradient}>
        <View style={styles.gradientCircle1} />
        <View style={styles.gradientCircle2} />
      </View>

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.successCircle,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Animated.Text
            style={[
              styles.checkmark,
              { transform: [{ scale: checkmarkScale }] },
            ]}
          >
            ✓
          </Animated.Text>
        </Animated.View>

        <Animated.View style={[styles.textContent, { opacity: contentOpacity }]}>
          <Text style={styles.title}>Verified!</Text>
          <Text style={styles.subtitle}>
            The server accepted your proof
          </Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>
              {request.service?.name || 'Petition'}
            </Text>
            <Text style={styles.infoText}>
              Your signature has been successfully submitted and verified.
            </Text>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Time</Text>
              <Text style={styles.statValue}>{(durationMs / 1000).toFixed(1)}s</Text>
            </View>
          </View>

          <View style={styles.historyHint}>
            <Text style={styles.historyHintText}>
              You can find the signature details in your history
            </Text>
            <TouchableOpacity onPress={handleViewHistory}>
              <Text style={styles.historyLink}>View History →</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View style={[styles.buttonContainer, { opacity: contentOpacity }]}>
          <Button label="Close" onPress={handleClose} variant="primary" />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  gradientCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(31, 146, 84, 0.2)',
  },
  gradientCircle2: {
    position: 'absolute',
    bottom: -50,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(46, 108, 255, 0.1)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: colors.success,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  checkmark: {
    fontSize: 56,
    color: '#fff',
    fontWeight: '700',
  },
  textContent: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 32,
  },
  infoCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: borderRadius.xl,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  statLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  historyHint: {
    alignItems: 'center',
    marginBottom: 32,
  },
  historyHintText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 8,
  },
  historyLink: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  buttonContainer: {
    width: '100%',
  },
});
