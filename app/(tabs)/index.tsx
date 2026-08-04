import { useI18n } from '@/src/i18n';
import { ComingSoon } from '@/src/components/ComingSoon';

export default function ListingsScreen() {
  const { t } = useI18n();
  return <ComingSoon title={t('tabs.listings')} />;
}
