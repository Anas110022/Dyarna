import { useI18n } from '@/src/i18n';
import { ComingSoon } from '@/src/components/ComingSoon';

export default function AccountScreen() {
  const { t } = useI18n();
  return <ComingSoon title={t('tabs.account')} />;
}
