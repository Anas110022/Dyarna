import { useI18n } from '@/src/i18n';
import { ComingSoonScreen } from '@/src/components/ComingSoonScreen';

// TEMPORARY: search/list view ships in phase 4 (spec §4 screen 03).
export default function SearchScreen() {
  const { t } = useI18n();
  return <ComingSoonScreen title={t('stubs.searchResults')} />;
}
