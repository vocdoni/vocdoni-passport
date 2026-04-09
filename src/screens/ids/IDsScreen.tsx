import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  RefreshControl,
  Modal,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IDCard } from '../../components/IDCard';
import { Button, AppHeader } from '../../components/common';
import { colors, borderRadius } from '../../components/common/styles';
import { useIDs } from '../../hooks/useIDs';
import type { IDsStackParamList } from '../../navigation/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 80;

type NavigationProp = NativeStackNavigationProp<IDsStackParamList, 'IDsList'>;

export function IDsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { ids, loading, refresh, hasIDs } = useIDs();
  const [activeIndex, setActiveIndex] = useState(0);
  const [blurred, setBlurred] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleScroll = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + 20));
    setActiveIndex(Math.max(0, Math.min(index, ids.length - 1)));
  }, [ids.length]);

  const handleCardPress = useCallback((id: string) => {
    navigation.navigate('IDDetails', { id });
  }, [navigation]);

  const handleAddID = useCallback(() => {
    navigation.navigate('AddIDMrz');
  }, [navigation]);

  const handleExploreID = useCallback(() => {
    setShowOptionsMenu(false);
    navigation.navigate('ExploreIDMrz');
  }, [navigation]);

  const handleIdentity = useCallback(() => {
    setShowOptionsMenu(false);
    navigation.getParent()?.navigate('Wallet');
  }, [navigation]);

  if (!hasIDs && !loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <AppHeader />
        <View style={styles.emptyHeaderRow}>
          <TouchableOpacity style={styles.optionsButton} onPress={() => setShowOptionsMenu(true)}>
            <Text style={styles.optionsButtonText}>⋯</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        >
          <View style={styles.emptyContent}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>🪪</Text>
            </View>
            <Text style={styles.emptyTitle}>No IDs yet</Text>
            <Text style={styles.emptySubtitle}>
              Add your passport or ID card to sign petitions without scanning each time
            </Text>
            <Button label="Add your first ID" onPress={handleAddID} variant="primary" />
          </View>
        </ScrollView>

        <Modal
          visible={showOptionsMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowOptionsMenu(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowOptionsMenu(false)}
          >
            <View style={styles.menuContainer}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuIcon}>⋯</Text>
                <Text style={styles.menuTitle}>Options</Text>
              </View>

              <TouchableOpacity style={styles.menuItem} onPress={handleIdentity}>
                <Text style={styles.menuItemIcon}>🔐</Text>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemTitle}>Digital Identity</Text>
                  <Text style={styles.menuItemDesc}>
                    View your wallet address and recovery phrase
                  </Text>
                </View>
                <Text style={styles.menuItemArrow}>→</Text>
              </TouchableOpacity>

              {__DEV__ && (
                <TouchableOpacity style={styles.menuItem} onPress={handleExploreID}>
                  <Text style={styles.menuItemIcon}>🔬</Text>
                  <View style={styles.menuItemContent}>
                    <Text style={styles.menuItemTitle}>Explore ID</Text>
                    <Text style={styles.menuItemDesc}>
                      Scan and view all raw data from an ID chip
                    </Text>
                  </View>
                  <Text style={styles.menuItemArrow}>→</Text>
                </TouchableOpacity>
              )}

              <View style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuClose}
                onPress={() => setShowOptionsMenu(false)}
              >
                <Text style={styles.menuCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AppHeader />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>Your IDs</Text>
            <Text style={styles.idCount}>
              {ids.length} {ids.length === 1 ? 'document' : 'documents'} stored
            </Text>
          </View>
          <View style={styles.titleButtons}>
            <TouchableOpacity style={styles.optionsButton} onPress={() => setShowOptionsMenu(true)}>
              <Text style={styles.optionsButtonText}>⋯</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addButton} onPress={handleAddID}>
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.carouselContainer}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            decelerationRate="fast"
            snapToInterval={CARD_WIDTH + 20}
            snapToAlignment="center"
          >
            {ids.map((id, index) => (
              <View
                key={id.id}
                style={[
                  styles.cardWrapper,
                  index === ids.length - 1 && styles.cardWrapperLast,
                ]}
              >
                <IDCard
                  id={id}
                  blurred={blurred}
                  onPress={() => handleCardPress(id.id)}
                />
              </View>
            ))}
          </ScrollView>
        </View>

        {ids.length > 1 && (
          <View style={styles.pagination}>
            {ids.map((_, index) => (
              <View
                key={index}
                style={[styles.dot, index === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.blurToggle} onPress={() => setBlurred(!blurred)}>
          <Text style={styles.blurToggleIcon}>{blurred ? '👁️' : '🙈'}</Text>
          <Text style={styles.blurToggleText}>
            {blurred ? 'Show details' : 'Hide details'}
          </Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>🔒</Text>
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Secure Storage</Text>
            <Text style={styles.infoText}>
              Your ID data is encrypted and stored only on this device.
            </Text>
          </View>
        </View>

        <Text style={styles.hint}>Tap on a card to view details</Text>
      </ScrollView>

      <Modal
        visible={showOptionsMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowOptionsMenu(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuIcon}>⋯</Text>
              <Text style={styles.menuTitle}>Options</Text>
            </View>

            <TouchableOpacity style={styles.menuItem} onPress={handleIdentity}>
              <Text style={styles.menuItemIcon}>🔐</Text>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemTitle}>Digital Identity</Text>
                <Text style={styles.menuItemDesc}>
                  View your wallet address and recovery phrase
                </Text>
              </View>
              <Text style={styles.menuItemArrow}>→</Text>
            </TouchableOpacity>

            {__DEV__ && (
              <TouchableOpacity style={styles.menuItem} onPress={handleExploreID}>
                <Text style={styles.menuItemIcon}>🔬</Text>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemTitle}>Explore ID</Text>
                  <Text style={styles.menuItemDesc}>
                    Scan and view all raw data from an ID chip
                  </Text>
                </View>
                <Text style={styles.menuItemArrow}>→</Text>
              </TouchableOpacity>
            )}

            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuClose}
              onPress={() => setShowOptionsMenu(false)}
            >
              <Text style={styles.menuCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  idCount: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  titleButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsButtonText: {
    fontSize: 22,
    lineHeight: 22,
    color: colors.text,
    marginTop: -2,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  carouselContainer: {
    marginBottom: 16,
  },
  carousel: {
    paddingHorizontal: 40,
  },
  cardWrapper: {
    marginRight: 20,
  },
  cardWrapperLast: {
    marginRight: 40,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  blurToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    marginBottom: 20,
  },
  blurToggleIcon: {
    fontSize: 16,
  },
  blurToggleText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    padding: 14,
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    marginBottom: 16,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoIconText: {
    fontSize: 18,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryDark,
    marginBottom: 2,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
  },
  emptyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyContent: {
    alignItems: 'center',
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyIconText: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
  },
  emptySubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.infoLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    fontSize: 28,
    marginRight: 12,
    color: colors.text,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuItemIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  menuItemDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  menuItemArrow: {
    fontSize: 18,
    color: colors.textMuted,
    marginLeft: 8,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  menuClose: {
    padding: 16,
    alignItems: 'center',
  },
  menuCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});
