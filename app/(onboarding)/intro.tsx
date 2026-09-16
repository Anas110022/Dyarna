import { useRef } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';

const HAS_SEEN_INTRO_KEY = 'dyarna.hasSeenIntro';
const { width } = Dimensions.get('window');

type Slide = {
  key: string;
  theme: 'light' | 'dark';
  icon: keyof typeof Ionicons.glyphMap;
  badgeIcon?: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  bodyKey?: string;
  ctaKey: string;
};

const SLIDES: Slide[] = [
  {
    key: 'search',
    theme: 'light',
    icon: 'home-outline',
    badgeIcon: 'checkmark-circle',
    titleKey: 'onboarding.slide1Title',
    bodyKey: 'onboarding.slide1Body',
    ctaKey: 'onboarding.next',
  },
  {
    key: 'trust',
    theme: 'light',
    icon: 'shield-checkmark-outline',
    titleKey: 'onboarding.slide2Title',
    ctaKey: 'onboarding.next',
  },
  {
    key: 'post',
    theme: 'dark',
    icon: 'add-circle-outline',
    titleKey: 'onboarding.slide3Title',
    bodyKey: 'onboarding.slide3Body',
    ctaKey: 'onboarding.start',
  },
];

export default function IntroScreen() {
  const { t } = useI18n();
  const listRef = useRef<FlatList<Slide>>(null);

  const finishIntro = async () => {
    await AsyncStorage.setItem(HAS_SEEN_INTRO_KEY, 'true');
    // Guest Mode: land in the real, guest-browsable marketplace — signing
    // in is prompted later by whichever gated action the user attempts.
    router.replace('/(tabs)');
  };

  const goToSlide = (index: number) => {
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  const renderSlide = ({ item, index }: ListRenderItemInfo<Slide>) => {
    const isDark = item.theme === 'dark';
    const isLast = index === SLIDES.length - 1;

    return (
      <SafeAreaView
        edges={['top', 'bottom']}
        style={[styles.slide, { width, backgroundColor: isDark ? colors.pine : colors.ivory }]}
      >
        <Pressable style={styles.skip} onPress={finishIntro} hitSlop={12}>
          <Text style={[styles.skipText, { color: isDark ? colors.goldSoft : colors.inkSoft }]}>
            {t('onboarding.skip')}
          </Text>
        </Pressable>

        <View style={styles.body}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.ivory2 },
            ]}
          >
            <Ionicons name={item.icon} size={72} color={isDark ? colors.goldSoft : colors.pine} />
            {item.badgeIcon && (
              <View style={[styles.badge, { backgroundColor: isDark ? colors.pine : colors.ivory2 }]}>
                <Ionicons name={item.badgeIcon} size={20} color={colors.gold} />
              </View>
            )}
          </View>

          <Text style={[styles.title, { color: isDark ? colors.goldSoft : colors.pine }]}>
            {t(item.titleKey)}
          </Text>

          {item.bodyKey && (
            <Text style={[styles.subtitle, { color: isDark ? 'rgba(247,244,236,0.65)' : colors.inkSoft }]}>
              {t(item.bodyKey)}
            </Text>
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((s, i) => (
              <View
                key={s.key}
                style={[
                  i === index ? styles.dotActive : styles.dotInactive,
                  {
                    backgroundColor:
                      i === index
                        ? isDark
                          ? colors.gold
                          : colors.pine
                        : isDark
                          ? 'rgba(255,255,255,0.25)'
                          : colors.ivory2,
                  },
                ]}
              />
            ))}
          </View>

          <Pressable style={styles.button} onPress={() => (isLast ? finishIntro() : goToSlide(index + 1))}>
            <Text style={styles.buttonText}>{t(item.ctaKey)}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  };

  return (
    <FlatList
      ref={listRef}
      data={SLIDES}
      renderItem={renderSlide}
      keyExtractor={(item) => item.key}
      horizontal
      pagingEnabled
      bounces={false}
      showsHorizontalScrollIndicator={false}
      getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
    />
  );
}

const styles = StyleSheet.create({
  slide: {
    height: '100%',
    justifyContent: 'space-between',
  },
  skip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  skipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  iconCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  badge: {
    position: 'absolute',
    top: 4,
    end: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: spacing.md,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 260,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dotActive: {
    width: 20,
    height: 5,
    borderRadius: radii.sm,
  },
  dotInactive: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  button: {
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: fonts.headingBold,
    fontSize: 14,
    color: colors.pine,
  },
});
