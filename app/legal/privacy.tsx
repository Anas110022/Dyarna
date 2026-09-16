import { useI18n } from '@/src/i18n';
import { LegalScreen } from '@/src/components/LegalScreen';
import { PRIVACY } from '@/src/content/legal';

export default function PrivacyScreen() {
  const { locale } = useI18n();
  return <LegalScreen document={PRIVACY[locale]} />;
}
