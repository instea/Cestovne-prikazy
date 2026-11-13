import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { isLanguage, LANGUAGES, setLanguage } from '.';

/** NFR-13 switcher: "Language" select; options in their own language. */
export function LanguageSelect({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor={id}>{t('nav.language')}</label>
      <select
        id={id}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"
        value={i18n.language}
        onChange={(e) => {
          if (isLanguage(e.target.value)) void setLanguage(e.target.value);
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {t(`language.${l}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
