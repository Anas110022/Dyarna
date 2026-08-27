import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';
import { AddCircleIcon, HouseSearchIcon, ShieldCheckIcon } from '@/src/components/OnboardingIcons';

const HAS_SEEN_INTRO_KEY = 'dyarna.hasSeenIntro';

type Slide = {
  key: string;
  dark: boolean;
  Icon: (props: { size?: number }) => React.JSX.Element;
  titleKey: string;
  bodyKey?: string;
};

const SLIDES: Slide[] = [
  { key: '1', dark: false, Icon: HouseSearchIcon, titleKey: 'onboarding.slide1Title', bodyKey: 'onboarding.slide1Body' },
  { key: '2', dark: false, Icon: ShieldCheckIcon, titleKey: 'onboarding.slide2Title' },
  { key: '3', dark: true, Icon: AddCircleIcon, titleKey: 'onboarding.slide3Title', bodyKey: 'onboarding.slide3Body' },
];

export default function IntroScreen() {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const finishIntro = useCallback(async () => {
    await AsyncStorage.setItem(HAS_SEEN_INTRO_KEY, 'true');
    router.replace('/(auth)/login');
  }, []);

  const goNext = useCallback(() => {
    if (index === SLIDES.length - 1) {
      finishIntro();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }, [index, finishIntro]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)));
    },
    [width]
  );

  const current = SLIDES[index];

  return (
    <View style={[styles.container, current.dark && styles.containerDark]}>
      <View style={styles.skipRow}>
        <Pressable onPress={finishIntro} hitSlop={12}>
          <Text style={[styles.skip, current.dark && styles.skipDark]}>{t('onboarding.skip')}</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.iconWrap, item.dark && styles.iconWrapDark]}>
              <item.Icon size={72} />
            </View>
            <Text style={[styles.title, item.dark && styles.titleDark]}>{t(item.titleKey)}</Text>
            {item.bodyKey && <Text style={[styles.body, item.dark && styles.bodyDark]}>{t(item.bodyKey)}</Text>}
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.key}
              style={[
                styles.dot,
                current.dark && styles.dotDark,
                i === index && (current.dark ? styles.dotActiveDark : styles.dotActive),
              ]}
            />
          ))}
        </View>
        <Pressable style={[styles.button, current.dark && styles.buttonDark]} onPress={goNext}>
          <Text style={[styles.buttonText, current.dark && styles.buttonTextDark]}>
            {index === SLIDES.length - 1 ? t('onboarding.start') : t('onboarding.next')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ivory,
  },
  containerDark: {
    backgroundColor: colors.pine,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  skip: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  skipDark: {
    color: 'rgba(247,244,236,0.55)',
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.ivory2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  iconWrapDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 19,
    color: colors.pine,
    textAlign: 'center',
    lineHeight: 27,
    marginBottom: spacing.sm,
  },
  titleDark: {
    color: colors.goldSoft,
  },
  body: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 260,
  },
  bodyDark: {
    color: 'rgba(247,244,236,0.65)',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.ivory2,
  },
  dotDark: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 20,
    borderRadius: 3,
    backgroundColor: colors.pine,
  },
  dotActiveDark: {
    width: 20,
    borderRadius: 3,
    backgroundColor: colors.gold,
  },
  button: {
    backgroundColor: colors.pine,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  buttonDark: {
    backgroundColor: colors.gold,
  },
  buttonText: {
    fontFamily: fonts.headingBold,
    fontSize: 14,
    color: colors.goldSoft,
  },
  buttonTextDark: {
    color: colors.pine,
  },
});
