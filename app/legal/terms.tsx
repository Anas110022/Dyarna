import { useI18n } from '@/src/i18n';
import { LegalScreen } from '@/src/components/LegalScreen';
import { TERMS } from '@/src/content/legal';

export default function TermsScreen() {
  const { locale } = useI18n();
  return <LegalScreen document={TERMS[locale]} />;
}
