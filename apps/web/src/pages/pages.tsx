import { useTranslation } from 'react-i18next';
import type en from '../i18n/locales/en.json';

type PageKey = `pages.${keyof typeof en.pages}`;

/**
 * Placeholder screens. Each is replaced by its feature task
 * (LST-01, LV-02, APR-02, SUM-01, USR-01..03).
 */
function Placeholder({ titleKey }: { titleKey: PageKey }) {
  const { t } = useTranslation();
  return <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>;
}

export const ApprovalPage = () => <Placeholder titleKey="pages.approval" />;
export const EditUserPage = () => <Placeholder titleKey="pages.editUser" />;
