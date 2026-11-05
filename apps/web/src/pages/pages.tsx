import { useTranslation } from 'react-i18next';

/**
 * Placeholder screens. Each is replaced by its feature task
 * (LST-01, LV-02, APR-02, SUM-01, USR-01..03, NFR-06).
 */
function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>;
}

export const LeavesPage = () => <Placeholder titleKey="pages.leaves" />;
export const NewLeavePage = () => <Placeholder titleKey="pages.newLeave" />;
export const ApprovalPage = () => <Placeholder titleKey="pages.approval" />;
export const SummaryPage = () => <Placeholder titleKey="pages.summary" />;
export const UsersPage = () => <Placeholder titleKey="pages.users" />;
export const EditUserPage = () => <Placeholder titleKey="pages.editUser" />;
export const AuditPage = () => <Placeholder titleKey="pages.audit" />;
export const ProfilePage = () => <Placeholder titleKey="pages.profile" />;
