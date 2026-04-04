import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView } from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../components/common';
import { colors, borderRadius } from '../../../components/common/styles';
import { getIDById, type StoredID } from '../../../storage/idStorage';
import type { IDsStackParamList } from '../../../navigation/types';

type NavigationProp = NativeStackNavigationProp<IDsStackParamList, 'AddIDSuccess'>;
type RouteType = RouteProp<IDsStackParamList, 'AddIDSuccess'>;

const COUNTRY_FLAGS: Record<string, string> = {
  ESP: '🇪🇸', DEU: '🇩🇪', FRA: '🇫🇷', ITA: '🇮🇹', GBR: '🇬🇧', USA: '🇺🇸',
  PRT: '🇵🇹', NLD: '🇳🇱', BEL: '🇧🇪', AUT: '🇦🇹', CHE: '🇨🇭', POL: '🇵🇱',
};

export function AddIDSuccessScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const insets = useSafeAreaInsets();
  const [id, setId] = useState<StoredID | null>(null);
  
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;
  const checkAnim = React.useRef(new Animated.Value(0)).current;
  const cardAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadID();
    
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
      Animated.spring(checkAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const loadID = async () => {
    const data = await getIDById(route.params.id);
    setId(data);
  };

  const handleViewIDs = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'IDsList' }],
      }),
    );
  };

  const flag = id ? (COUNTRY_FLAGS[id.issuingCountry] || '🏳️') : '🪪';
  const docType = id?.documentType === 'passport' ? 'Passport' : 'ID Card';
  const fullName = id ? `${id.firstName} ${id.lastName}`.trim() : '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Animated.View 
            style={[
              styles.successBadge, 
              { 
                opacity: opacityAnim, 
                transform: [{ scale: scaleAnim }] 
              }
            ]}
          >
            <Animated.Text 
              style={[
                styles.successIcon,
                { transform: [{ scale: checkAnim }] }
              ]}
            >
              ✓
            </Animated.Text>
          </Animated.View>
          
          <Animated.View style={{ opacity: opacityAnim }}>
            <Text style={styles.title}>ID Added Successfully</Text>
            <Text style={styles.subtitle}>
              Your document has been securely stored on this device
            </Text>
          </Animated.View>

          {id && (
            <Animated.View 
              style={[
                styles.cardPreview,
                { 
                  opacity: cardAnim,
                  transform: [{ 
                    translateY: cardAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    })
                  }]
                }
              ]}
            >
              <View style={styles.previewCard}>
                <Text style={styles.previewFlag}>{flag}</Text>
                <View style={styles.previewInfo}>
                  <Text style={styles.previewCountry}>
                    {id.issuingCountry} {docType}
                  </Text>
                  <Text style={styles.previewName} numberOfLines={1}>
                    {fullName}
                  </Text>
                </View>
                <View style={styles.previewBadge}>
                  <Text style={styles.previewBadgeText}>✓</Text>
                </View>
              </View>
            </Animated.View>
          )}

          <Animated.View style={[styles.infoBox, { opacity: cardAnim }]}>
            <Text style={styles.infoIcon}>💡</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>What's next?</Text>
              <Text style={styles.infoText}>
                You can now sign petitions using this ID without scanning the NFC chip each time.
              </Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.buttons, { opacity: cardAnim }]}>
            <Button label="View My IDs" onPress={handleViewIDs} variant="primary" />
          </Animated.View>
        </View>
      </ScrollView>

      <View style={[styles.stepIndicator, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={[styles.step, styles.stepCompleted]}>
          <Text style={styles.stepCheck}>✓</Text>
        </View>
        <View style={[styles.stepLine, styles.stepLineActive]} />
        <View style={[styles.step, styles.stepCompleted]}>
          <Text style={styles.stepCheck}>✓</Text>
        </View>
        <View style={[styles.stepLine, styles.stepLineActive]} />
        <View style={[styles.step, styles.stepCompleted]}>
          <Text style={styles.stepCheck}>✓</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  content: {
    alignItems: 'center',
  },
  successBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: colors.success,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  successIcon: {
    color: '#fff',
    fontSize: 44,
    fontWeight: '700',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  cardPreview: {
    width: '100%',
    marginBottom: 24,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 16,
    shadowColor: colors.cardShadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewFlag: {
    fontSize: 36,
    marginRight: 14,
  },
  previewInfo: {
    flex: 1,
  },
  previewCountry: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  previewName: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  previewBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#f0f5ff',
    borderRadius: borderRadius.lg,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#d4e2ff',
    width: '100%',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryDark,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  buttons: {
    width: '100%',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  step: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCompleted: {
    backgroundColor: colors.success,
  },
  stepCheck: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 6,
  },
  stepLineActive: {
    backgroundColor: colors.success,
  },
});
