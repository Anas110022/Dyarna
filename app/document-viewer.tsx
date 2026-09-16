import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { useI18n } from '@/src/i18n';
import { colors, fonts, spacing } from '@/src/theme';
import { supabase } from '@/src/lib/supabase';

// Signed URL lives 5 minutes — plenty for a single in-app view, same TTL
// the admin review queue already uses for the identical bucket.
const SIGNED_URL_TTL_SECONDS = 300;

type PdfState = 'loading' | 'ready' | 'error';

// Full-screen, real, unmodified preview of the exact file that will be (or
// already was) uploaded — never a separate/lower-quality copy. Images use
// a native pinch-to-zoom ScrollView (no cropping, "contain" only, so the
// entire document is always visible before zooming in); a PDF renders via
// an embedded WebView (WKWebView's built-in PDF renderer) pointed at a
// real signed URL to the file already uploaded in the private
// verification-docs bucket — using the *existing* "users can read their
// own folder" storage RLS policy, no security change.
//
// This used to be a component rendered inside React Native's own <Modal>.
// On a physical device the close button never received a single tap when
// a PDF was open — proven with instrumented touch logging (a capture-
// phase handler on the modal's outermost View, which fires on ANY touch
// anywhere in the screen before any child even gets a look, never fired
// at all while a WebView was present). That means the touch was being
// claimed before it ever reached React Native's own touch system —
// beneath anything zIndex/pointerEvents/layout can fix. RN's <Modal>
// hosts its content in a separately-presented view controller that has
// known friction with embedded native content like WebView; a real
// Expo Router screen (this file) instead runs in the same
// react-native-screens-managed surface as the rest of the app, which
// integrates properly with native child components. `presentation:
// 'fullScreenModal'` below still gives the same native full-screen modal
// *appearance* — only the underlying host changed, not the UX.
export default function DocumentViewerScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{
    uri?: string;
    isPdf?: string;
    pdfStoragePath?: string;
    fileName?: string;
  }>();
  const uri = params.uri ?? null;
  const isPdf = params.isPdf === '1';
  const pdfStoragePath = params.pdfStoragePath ?? null;
  const fileName = params.fileName ?? null;

  const [pdfState, setPdfState] = useState<PdfState>('loading');
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [loadStalled, setLoadStalled] = useState(false);
  // The image needs an explicit pixel size (a ScrollView's contentContainerStyle
  // sizes itself to content, not to the viewport). Measuring the actual content
  // box below the header keeps this correct regardless of the header's real
  // height and on rotation (onLayout re-fires).
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null);
  const onContentLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContentSize({ width, height });
  };

  useEffect(() => {
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;

    // Deferred so every setState call below happens on a later macrotask,
    // never synchronously during this effect's own execution.
    const timer = setTimeout(async () => {
      if (cancelled) return;
      if (!pdfStoragePath) {
        setPdfState('error');
        setSignedUrl(null);
        return;
      }
      setPdfState('loading');
      setSignedUrl(null);
      setLoadStalled(false);
      const { data, error } = await supabase.storage.from('verification-docs').createSignedUrl(pdfStoragePath, SIGNED_URL_TTL_SECONDS);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setPdfState('error');
        return;
      }
      setSignedUrl(data.signedUrl);
      // pdfState moves to 'ready' once the WebView itself reports
      // onLoadEnd — the signed URL resolving only means we can start
      // requesting the file, not that it has actually rendered yet.
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isPdf, pdfStoragePath, retryKey]);

  // Safety net: WebView's onLoadEnd/onError should always fire once a
  // signed URL is handed to it, but never leave the user stuck on the
  // loading spinner forever if some edge case (a stalled network request,
  // a WKWebView that never calls back) means neither one does.
  useEffect(() => {
    if (!isPdf || !signedUrl || pdfState !== 'loading') {
      return;
    }
    const timer = setTimeout(() => setLoadStalled(true), 15000);
    return () => clearTimeout(timer);
  }, [isPdf, signedUrl, pdfState, retryKey]);

  const effectivePdfState: PdfState = loadStalled && pdfState === 'loading' ? 'error' : pdfState;

  const close = () => {
    if (router.canGoBack()) router.back();
  };

  if (!uri) {
    close();
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ presentation: 'fullScreenModal', animation: 'none', headerShown: false, gestureEnabled: false }} />
      <View style={styles.container}>
        {/* A normal flex row, not an absolutely-positioned overlay — it
            reserves its own space at the top, so its rectangle never
            overlaps the WebView/image content below. */}
        <SafeAreaView edges={['top']} style={styles.header}>
          <Pressable style={styles.closeButton} onPress={close} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
        </SafeAreaView>

        <View style={styles.content} onLayout={onContentLayout}>
          {isPdf ? (
            signedUrl && effectivePdfState !== 'error' ? (
              <WebView
                key={signedUrl}
                source={{ uri: signedUrl }}
                style={styles.webview}
                onLoadEnd={() => setPdfState('ready')}
                onError={() => setPdfState('error')}
                onHttpError={() => setPdfState('error')}
                originWhitelist={['https://*']}
                allowsLinkPreview={false}
                allowsBackForwardNavigationGestures={false}
                dataDetectorTypes="none"
              />
            ) : null
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              maximumZoomScale={5}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              {contentSize && (
                <Image source={{ uri }} style={{ width: contentSize.width, height: contentSize.height }} resizeMode="contain" />
              )}
            </ScrollView>
          )}

          {isPdf && effectivePdfState !== 'ready' && (
            <View style={styles.pdfNotice} pointerEvents={effectivePdfState === 'error' ? 'box-none' : 'none'}>
              {effectivePdfState === 'loading' && (
                <>
                  <ActivityIndicator color={colors.white} />
                  <Text style={styles.pdfNoticeText}>{t('documentViewer.openingPdf')}</Text>
                </>
              )}
              {effectivePdfState === 'error' && (
                <>
                  <Ionicons name="alert-circle-outline" size={32} color={colors.white} />
                  <Text style={styles.pdfNoticeText}>
                    {pdfStoragePath ? t('documentViewer.pdfOpenError') : t('documentViewer.pdfNotReady')}
                  </Text>
                  {!!pdfStoragePath && (
                    <Pressable style={styles.pdfRetryButton} onPress={() => setRetryKey((k) => k + 1)}>
                      <Text style={styles.pdfRetryButtonText}>{t('documentViewer.retry')}</Text>
                    </Pressable>
                  )}
                </>
              )}
              {!!fileName && (
                <Text style={styles.pdfFileName} numberOfLines={1}>
                  {fileName}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pine },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: colors.pine,
  },
  closeButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  content: { flex: 1 },
  webview: { flex: 1, backgroundColor: colors.pine },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  pdfNotice: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  pdfNoticeText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.white, textAlign: 'center' },
  pdfFileName: { fontFamily: fonts.bodyRegular, fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  pdfRetryButton: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pdfRetryButtonText: { fontFamily: fonts.headingBold, fontSize: 13, color: colors.white },
});
