import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { CATEGORY_LABEL_KEY } from '@/src/lib/listingTypes';
import {
  fetchListingsByOwner,
  fetchPublicProfile,
  fetchPublishedListingsCountByOwner,
  type ListingPreview,
  type PublicProfile,
} from '@/src/lib/listings';
import { supabase } from '@/src/lib/supabase';
import {
  fetchMyReview,
  fetchReviewStats,
  fetchReviewsForUser,
  hasConversationWith,
  submitReview,
  type Review,
  type ReviewStats,
} from '@/src/lib/reviews';
import { blockUser, isBlocked, unblockUser } from '@/src/lib/blocks';
import { submitReport, type ReportReason, type ReportTargetType } from '@/src/lib/reports';
import { ReportModal } from '@/src/components/ReportModal';
import { AuthPromptModal, useAuthPrompt } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';
import { PropertyCard } from '@/src/components/PropertyCard';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { FormInput } from '@/src/components/FormInput';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Real stars only — rounds a real average to the nearest whole star for
// display. Never rendered at all when averageRating is null (no reviews
// yet), so there is never a fake "0 stars" shown for someone unreviewed.
function StarRow({ rating, size = 14, theme }: { rating: number; size?: number; theme: ThemeColors }) {
  const rounded = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= rounded ? 'star' : 'star-outline'} size={size} color={theme.accentGold} />
      ))}
    </View>
  );
}

export default function ProfileScreen() {
  const { id, intent } = useLocalSearchParams<{ id: string; intent?: string }>();
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [listingCount, setListingCount] = useState(0);
  const [listings, setListings] = useState<ListingPreview[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats>({ reviewCount: 0, averageRating: null });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [eligibleToReview, setEligibleToReview] = useState(false);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [draftRating, setDraftRating] = useState(0);
  const [draftBody, setDraftBody] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState(false);

  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const { authPromptVisible, authPromptIntent, showAuthPrompt, hideAuthPrompt } = useAuthPrompt();

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Refetches every time this screen is focused — so publishing a new
  // listing and coming back here shows the real, updated count and list
  // immediately, without an app restart. Same pattern as the Home map.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      async function load() {
        setLoading(true);
        const [{ data: profileData }, { count }, { data: ownerListings }, { data: authData }, { data: stats }, { data: reviewList }] =
          await Promise.all([
            fetchPublicProfile(id),
            fetchPublishedListingsCountByOwner(id),
            fetchListingsByOwner(id),
            supabase.auth.getUser(),
            fetchReviewStats(id),
            fetchReviewsForUser(id),
          ]);
        if (cancelled) return;
        setProfile(profileData);
        setNotFound(!profileData);
        setListingCount(count);
        setListings(ownerListings);
        setReviewStats(stats);
        setReviews(reviewList);

        const uid = authData.user?.id ?? null;
        setCurrentUserId(uid);
        if (uid && uid !== id) {
          const [eligible, { data: mine }, blocked] = await Promise.all([
            hasConversationWith(uid, id),
            fetchMyReview(uid, id),
            isBlocked(uid, id),
          ]);
          if (cancelled) return;
          setEligibleToReview(eligible);
          setBlockedByMe(blocked);
          if (mine) {
            setDraftRating(mine.rating);
            setDraftBody(mine.body);
          } else {
            setDraftRating(0);
            setDraftBody('');
          }
        } else {
          setEligibleToReview(false);
          setBlockedByMe(false);
        }
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  const openReviewModal = () => {
    setReviewError(false);
    setReviewModalOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!currentUserId || !id || draftRating < 1 || !draftBody.trim() || submittingReview) return;
    setSubmittingReview(true);
    setReviewError(false);
    const { error } = await submitReview(currentUserId, id, draftRating, draftBody.trim());
    setSubmittingReview(false);
    if (error) {
      setReviewError(true);
      return;
    }
    setReviewModalOpen(false);
    const [{ data: stats }, { data: reviewList }] = await Promise.all([fetchReviewStats(id), fetchReviewsForUser(id)]);
    setReviewStats(stats);
    setReviews(reviewList);
  };

  const openReportUser = () => {
    setActionSheetOpen(false);
    if (!currentUserId) {
      showAuthPrompt('report-user');
      return;
    }
    setReportError(null);
    setReportTarget({ type: 'profile', id });
    setReportModalOpen(true);
  };

  const openReportReview = (reviewId: string) => {
    if (!currentUserId) {
      showAuthPrompt('report-review');
      return;
    }
    setReportError(null);
    setReportTarget({ type: 'review', id: reviewId });
    setReportModalOpen(true);
  };

  const handleSubmitReport = async (reason: ReportReason, details: string) => {
    if (!currentUserId || !reportTarget || submittingReport) return;
    setSubmittingReport(true);
    setReportError(null);
    const { error } = await submitReport(currentUserId, reportTarget.type, reportTarget.id, reason, details || null);
    setSubmittingReport(false);
    if (error) {
      setReportError(error === 'already_reported' ? t('report.alreadyReported') : t('report.error'));
      return;
    }
    setReportModalOpen(false);
    Alert.alert(t('report.submitted'));
  };

  const confirmBlock = () => {
    setActionSheetOpen(false);
    if (!currentUserId) {
      showAuthPrompt('block');
      return;
    }
    Alert.alert(t('profileScreen.blockConfirmTitle'), t('profileScreen.blockConfirmBody'), [
      { text: t('profileScreen.cancel'), style: 'cancel' },
      { text: t('profileScreen.blockConfirmCta'), style: 'destructive', onPress: handleBlock },
    ]);
  };

  const handleBlock = async () => {
    if (!currentUserId || !id || blocking) return;
    setBlocking(true);
    const { error } = await blockUser(currentUserId, id);
    setBlocking(false);
    if (error) {
      Alert.alert(t('profileScreen.blockError'));
      return;
    }
    // A blocked user's listings/new messages are gone the moment the block
    // exists — nothing left worth looking at on their profile.
    router.back();
  };

  const handleUnblock = async () => {
    if (!currentUserId || !id || blocking) return;
    setActionSheetOpen(false);
    setBlocking(true);
    const { error } = await unblockUser(currentUserId, id);
    setBlocking(false);
    if (error) {
      Alert.alert(t('profileScreen.unblockError'));
      return;
    }
    setBlockedByMe(false);
  };

  // Guest Mode return-to-origin — see the matching effect in
  // app/listing/[id].tsx for the full rationale. 'block' re-shows the
  // native confirm dialog rather than blocking silently: a destructive
  // action still gets its explicit final tap.
  const resumedIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!intent || !currentUserId || loading) return;
    if (resumedIntentRef.current === intent) return;
    resumedIntentRef.current = intent;
    // Deferred a tick — see the matching effect in app/listing/[id].tsx.
    const timeout = setTimeout(() => {
      if (intent === 'report-user') openReportUser();
      else if (intent === 'block') confirmBlock();
    }, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers are recreated every render; only the resume trigger should re-run this
  }, [intent, currentUserId, loading]);

  if (loading) {
    return <LoadingState />;
  }

  if (notFound || !profile) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        message={t('profileScreen.notFound')}
        actionLabel={t('postListing.back')}
        onAction={() => router.back()}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <AppHeader
        title={t('profileScreen.title')}
        rightElement={
          currentUserId !== id ? (
            <Pressable style={styles.headerAction} onPress={() => setActionSheetOpen(true)} hitSlop={12}>
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.headingText} />
            </Pressable>
          ) : undefined
        }
      />

      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.profileCard}>
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={32} color={theme.mutedText} />
                </View>
              )}
              <Text style={styles.profileName}>{profile.fullName ?? t('listingDetail.unknownOwner')}</Text>
              {profile.isVerified && (
                <View style={styles.verifiedRow}>
                  <Ionicons name="shield-checkmark" size={13} color={theme.accentGold} />
                  <Text style={styles.verifiedText}>{t('listingDetail.verifiedAccount')}</Text>
                </View>
              )}

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{groupThousands(listingCount)}</Text>
                  <Text style={styles.statLabel}>{t('profileScreen.publishedListings')}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  {reviewStats.averageRating != null ? (
                    <>
                      <StarRow rating={reviewStats.averageRating} size={16} theme={theme} />
                      <Text style={styles.statLabel}>
                        {reviewStats.averageRating.toFixed(1)} · {t('profileScreen.reviewCount').replace('{count}', groupThousands(reviewStats.reviewCount))}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.statLabelMuted}>{t('profileScreen.noRatingYet')}</Text>
                  )}
                </View>
              </View>

              {eligibleToReview && (
                <Pressable style={styles.addReviewButton} onPress={openReviewModal}>
                  <Ionicons name="star-outline" size={14} color={theme.headingText} />
                  <Text style={styles.addReviewButtonText}>
                    {draftRating > 0 ? t('profileScreen.editReview') : t('profileScreen.addReview')}
                  </Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.sectionTitle}>{t('profileScreen.reviews')}</Text>
            {reviews.length === 0 ? (
              <View style={styles.reviewsEmpty}>
                <Text style={styles.emptyStateText}>{t('profileScreen.noReviews')}</Text>
              </View>
            ) : (
              <View style={styles.reviewsList}>
                {reviews.map((review) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      {review.reviewerAvatarUrl ? (
                        <Image source={{ uri: review.reviewerAvatarUrl }} style={styles.reviewAvatar} />
                      ) : (
                        <View style={[styles.reviewAvatar, styles.avatarPlaceholder]}>
                          <Ionicons name="person" size={14} color={theme.mutedText} />
                        </View>
                      )}
                      <View style={styles.reviewHeaderInfo}>
                        <Text style={styles.reviewerName} numberOfLines={1}>
                          {review.reviewerName ?? t('listingDetail.unknownOwner')}
                        </Text>
                        <StarRow rating={review.rating} size={11} theme={theme} />
                      </View>
                      {currentUserId !== review.reviewerId && (
                        <Pressable onPress={() => openReportReview(review.id)} hitSlop={8}>
                          <Ionicons name="flag-outline" size={14} color={theme.mutedText} />
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.reviewBody}>{review.body}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionTitle}>{t('profileScreen.theirListings')}</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="home-outline" message={t('profileScreen.noListings')} />}
        renderItem={({ item }) => (
          <PropertyCard
            photoUrl={item.photoUrl}
            title={item.title}
            categoryLabel={t(CATEGORY_LABEL_KEY[item.category])}
            locationLabel={[item.area, item.city].filter(Boolean).join('، ')}
            priceLabel={`$${groupThousands(item.priceUsd)}`}
            onPress={() => router.push(`/listing/${item.id}`)}
          />
        )}
      />

      <Modal
        visible={reviewModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewModalOpen(false)}
      >
        <Pressable style={styles.reviewModalOverlay} onPress={() => setReviewModalOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.reviewModalKeyboardWrapper}>
            <Pressable style={styles.reviewModalSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.reviewModalHandle} />
              <View style={styles.reviewModalHeader}>
                <Text style={styles.reviewModalTitle}>
                  {reviews.some((r) => r.reviewerId === currentUserId) ? t('profileScreen.editReview') : t('profileScreen.addReview')}
                </Text>
                <Pressable onPress={() => setReviewModalOpen(false)} hitSlop={10} style={styles.reviewModalCloseButton}>
                  <Ionicons name="close" size={18} color={theme.mutedText} />
                </Pressable>
              </View>

              <View style={styles.starPicker}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setDraftRating(n)} hitSlop={6}>
                    <Ionicons name={n <= draftRating ? 'star' : 'star-outline'} size={32} color={theme.accentGold} />
                  </Pressable>
                ))}
              </View>

              <FormInput
                value={draftBody}
                onChangeText={setDraftBody}
                placeholder={t('profileScreen.reviewPlaceholder')}
                multiline
                textAlign="right"
                containerStyle={styles.reviewInputWrap}
              />

              {reviewError && <Text style={styles.reviewErrorText}>{t('profileScreen.reviewSubmitError')}</Text>}

              <PrimaryButton
                label={t('profileScreen.submitReview')}
                onPress={handleSubmitReview}
                loading={submittingReview}
                disabled={draftRating < 1 || !draftBody.trim()}
              />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={actionSheetOpen} transparent animationType="fade" onRequestClose={() => setActionSheetOpen(false)}>
        <Pressable style={styles.actionSheetOverlay} onPress={() => setActionSheetOpen(false)}>
          <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
            <Pressable style={styles.actionRow} onPress={openReportUser}>
              <Ionicons name="flag-outline" size={18} color={theme.bodyText} />
              <Text style={styles.actionRowText}>{t('profileScreen.reportUser')}</Text>
            </Pressable>
            <View style={styles.actionDivider} />
            {blockedByMe ? (
              <Pressable style={styles.actionRow} onPress={handleUnblock}>
                <Ionicons name="checkmark-circle-outline" size={18} color={theme.bodyText} />
                <Text style={styles.actionRowText}>{t('profileScreen.unblockUser')}</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.actionRow} onPress={confirmBlock}>
                <Ionicons name="ban-outline" size={18} color={theme.danger} />
                <Text style={[styles.actionRowText, styles.actionRowTextDanger]}>{t('profileScreen.blockUser')}</Text>
              </Pressable>
            )}
            <View style={styles.actionDivider} />
            <Pressable style={styles.actionRow} onPress={() => setActionSheetOpen(false)}>
              <Text style={styles.actionCancelText}>{t('profileScreen.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ReportModal
        visible={reportModalOpen}
        title={reportTarget?.type === 'review' ? t('report.reviewTitle') : t('report.userTitle')}
        onClose={() => setReportModalOpen(false)}
        onSubmit={handleSubmitReport}
        submitting={submittingReport}
        errorText={reportError}
      />

      <AuthPromptModal visible={authPromptVisible} onClose={hideAuthPrompt} intent={authPromptIntent} />
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    listContent: { padding: spacing.lg, paddingTop: 0 },

    profileCard: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.xl,
      marginBottom: spacing.lg,
    },
    avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.surfaceAlt, marginBottom: spacing.md },
    avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    profileName: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText },
    verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    verifiedText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.mutedText },
    statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
    statBox: { flex: 1, alignItems: 'center' },
    statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: theme.border },
    statValue: { fontFamily: fonts.headingBlack, fontSize: fontSizes.screenTitle, color: theme.headingText },
    statLabel: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: 4 },
    statLabelMuted: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },

    addReviewButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'stretch',
      justifyContent: 'center',
      marginTop: spacing.lg,
      borderWidth: 1,
      borderColor: theme.headingText,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
    },
    addReviewButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText },

    sectionTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText, marginBottom: spacing.md },

    emptyStateText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.mutedText },

    reviewsEmpty: { paddingVertical: spacing.lg, marginBottom: spacing.lg },
    reviewsList: { gap: spacing.sm, marginBottom: spacing.lg },
    reviewCard: {
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
    reviewAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.surfaceAlt },
    reviewHeaderInfo: { flex: 1, gap: 2 },
    reviewerName: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    reviewBody: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, lineHeight: 18 },

    reviewModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(11,43,33,0.4)',
      justifyContent: 'flex-end',
    },
    reviewModalKeyboardWrapper: { width: '100%' },
    reviewModalSheet: {
      backgroundColor: theme.background,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
    },
    reviewModalHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.surfaceAlt,
      marginBottom: spacing.sm,
    },
    reviewModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    reviewModalTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.sectionTitle, color: theme.headingText },
    reviewModalCloseButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    starPicker: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg },
    reviewInputWrap: { marginBottom: spacing.sm },
    reviewErrorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.danger, marginBottom: spacing.sm },

    actionSheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(11,43,33,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    actionSheet: {
      width: '100%',
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      overflow: 'hidden',
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
    },
    actionRowText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body, color: theme.bodyText },
    actionRowTextDanger: { color: theme.danger },
    actionDivider: { height: 1, backgroundColor: theme.border },
    actionCancelText: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.mutedText },
  });
}
