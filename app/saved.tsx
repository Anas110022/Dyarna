import { useI18n } from '@/src/i18n';
import { ComingSoonScreen } from '@/src/components/ComingSoonScreen';

// TEMPORARY: saved/favorites list ships alongside listing details (spec §4 screen 05).
export default function SavedScreen() {
  const { t } = useI18n();
  return <ComingSoonScreen title={t('home.favorites')} />;
}
