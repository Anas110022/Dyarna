import { useI18n } from '@/src/i18n';
import { ComingSoonScreen } from '@/src/components/ComingSoonScreen';

// TEMPORARY: full listing details screen ships in phase 4 (spec §4 screen 02).
export default function ListingDetailsScreen() {
  const { t } = useI18n();
  return <ComingSoonScreen title={t('stubs.listingDetails')} />;
}
