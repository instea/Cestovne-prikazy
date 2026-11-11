import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface MultiSelectOption<T extends string | number> {
  id: T;
  label: string;
}

interface MultiSelectProps<T extends string | number> {
  /** Placeholder, shown on the button when nothing is selected. */
  label: string;
  options: MultiSelectOption<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
  disabled?: boolean;
  /** Label of a selected value missing from `options` (default: the value). */
  missingLabel?: (value: T) => string;
}

/**
 * LST-02 multiselect dropdown: the button shows the placeholder, or the
 * placeholder with the selected count ("Month (2)"); the panel has
 * "Check all" / "Uncheck all" and one checkbox per option. A selected value
 * missing from `options` stays selected and listed (no silent drop), labelled
 * by `missingLabel`.
 */
export function MultiSelect<T extends string | number>({
  label,
  options,
  selected,
  onChange,
  disabled = false,
  missingLabel = String,
}: MultiSelectProps<T>) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const known = new Set<T>(options.map((o) => o.id));
  const listed = [
    ...options,
    ...selected
      .filter((value) => !known.has(value))
      .map((value) => ({ id: value, label: missingLabel(value) })),
  ];
  const isSelected = new Set<T>(selected);
  const toggle = (value: T) =>
    onChange(
      isSelected.has(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="rounded border border-slate-300 bg-white px-3 py-1 text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {selected.length === 0
          ? label
          : t('leaves.filter.selectedCount', { label, count: selected.length })}
      </button>
      {open && !disabled && (
        <div
          id={`${id}-panel`}
          role="group"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-80 min-w-48 overflow-y-auto rounded border border-slate-300 bg-white p-2 shadow-lg"
        >
          <div className="mb-2 flex gap-2 border-b pb-2 text-sm">
            <button
              type="button"
              className="rounded px-2 py-0.5 hover:bg-slate-100"
              onClick={() =>
                onChange([
                  ...selected,
                  ...options
                    .map((o) => o.id)
                    .filter((value) => !isSelected.has(value)),
                ])
              }
            >
              {t('leaves.filter.checkAll')}
            </button>
            <button
              type="button"
              className="rounded px-2 py-0.5 hover:bg-slate-100"
              onClick={() => onChange([])}
            >
              {t('leaves.filter.uncheckAll')}
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {listed.map((option) => (
              <li key={String(option.id)}>
                <label className="flex cursor-pointer items-center gap-2 px-1 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={isSelected.has(option.id)}
                    onChange={() => toggle(option.id)}
                  />
                  {option.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
