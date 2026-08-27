import { useI18n } from '@/src/i18n';
import { ComingSoonScreen } from '@/src/components/ComingSoonScreen';

// TEMPORARY: 4-step post-listing wizard ships in phase 5 (spec §4 screen 04).
export default function PostListingScreen() {
  const { t } = useI18n();
  return <ComingSoonScreen title={t('stubs.postListing')} />;
}
