import type { CreateLeaveBody, LeaveDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import {
  type LeaveDateField,
  leaveDateFieldError,
  LEAVE_TYPES,
  LeaveType,
  newLeaveRuleError,
} from '@leaves/shared/leaves';
import { leaveWorkDays } from '@leaves/shared/workdays';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { ApiError } from '../api/errors';
import { currentLanguage } from '../i18n';
import { formatNumber, translateErrorCode } from '../i18n/format';
import { LEAVES_ROOT_KEY } from '../layout/query-keys';
import { showSuccessToast } from '../ui/toast-store';

const inputClass =
  'rounded border border-slate-300 bg-white px-2 py-1 text-slate-800 aria-invalid:border-red-600';
const readOnlyClass =
  'rounded border border-slate-200 bg-slate-100 px-2 py-1 text-slate-600';

/** Server codes shown as their own message; anything else is "Could not save". */
const FORM_ERROR_CODES = new Set<string>([
  ErrorCode.VALIDATION_FAILED,
  ErrorCode.LEAVE_END_BEFORE_START,
  ErrorCode.LEAVE_TOO_LONG,
  ErrorCode.LEAVE_HALF_DAY_MULTIPLE_DAYS,
]);

/** "Today" = the browser-local calendar date (LV-02). */
const localToday = () => format(new Date(), 'yyyy-MM-dd');

interface FormValues {
  type: LeaveType;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
}

/**
 * Client checks of the form, with the shared LV-01 rules and precedence:
 * per-field (empty → "Required", malformed / outside 2000–2100 →
 * VALIDATION_FAILED), then the cross-field rule once both dates are valid.
 */
function validate(values: FormValues) {
  const field = (name: LeaveDateField): 'required' | 'invalid' | null => {
    if (values[name] === '') return 'required';
    return leaveDateFieldError(name, values[name]) === null ? null : 'invalid';
  };
  const fields = { startDate: field('startDate'), endDate: field('endDate') };
  const datesValid = fields.startDate === null && fields.endDate === null;
  const rule = datesValid ? newLeaveRuleError(values) : null;
  return { fields, rule, datesValid };
}

/**
 * LV-02 `/leaves/new`: type, dates and half-day with a live work-day
 * preview (WD-01; the server count is authoritative). Submits only valid
 * input; on success goes back to `/leaves`.
 */
export function NewLeavePage() {
  const { t } = useTranslation();
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lang = currentLanguage();
  const [values, setValues] = useState<FormValues>(() => {
    const today = localToday();
    return {
      type: LeaveType.ANNUAL,
      startDate: today,
      endDate: today,
      isHalfDay: false,
    };
  });
  // End follows Start until the user changes End.
  const [endEdited, setEndEdited] = useState(false);
  // Blocks a second submit before React re-renders with `isPending`.
  const submitting = useRef(false);

  const create = useMutation({
    mutationFn: (body: CreateLeaveBody) =>
      api<LeaveDto>('/leaves', { method: 'POST', body }),
    // The form shows the error itself, no extra toast.
    meta: { inlineError: true },
    onSuccess: () => {
      // List (all + `?state=PENDING` badge) and summary refresh together.
      void queryClient.invalidateQueries({ queryKey: LEAVES_ROOT_KEY });
      showSuccessToast(() => t('leaves.form.created'));
      void navigate('/leaves');
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  const { fields, rule, datesValid } = validate(values);
  const invalid = !datesValid || rule !== null;
  // Preview only for valid dates; End < Start counts 0 (old parity).
  const workDays = datesValid ? leaveWorkDays(values) : null;

  const update = (changes: Partial<FormValues>) => {
    setValues((prev) => ({ ...prev, ...changes }));
    if (create.isError) create.reset();
  };

  const fieldMessage = (name: LeaveDateField) => {
    const error = fields[name];
    if (error === 'required') return t('validation.required');
    if (error === 'invalid') return t('errors.VALIDATION_FAILED');
    return null;
  };

  const serverMessage = (error: unknown) =>
    error instanceof ApiError && FORM_ERROR_CODES.has(error.code)
      ? translateErrorCode(error.code)
      : t('leaves.form.saveError');

  function dateInput(name: LeaveDateField, onChange: (value: string) => void) {
    const inputId = `${id}-${name}`;
    const message = fieldMessage(name);
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId}>{t(`leaves.form.${name}`)}</label>
        <input
          id={inputId}
          type="date"
          className={inputClass}
          value={values[name]}
          aria-invalid={message !== null}
          aria-describedby={message ? `${inputId}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {message && (
          <span id={`${inputId}-error`} className="text-sm text-red-700">
            {message}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('leaves.form.title')}</h1>
      <form
        className="flex max-w-md flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid || submitting.current) return;
          submitting.current = true;
          create.mutate({
            type: values.type,
            startDate: values.startDate,
            endDate: values.endDate,
            isHalfDay: values.isHalfDay,
          });
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-type`}>{t('leaves.form.type')}</label>
          <select
            id={`${id}-type`}
            className={inputClass}
            value={values.type}
            onChange={(e) => update({ type: e.target.value as LeaveType })}
          >
            {LEAVE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`leaveType.${type}`)}
              </option>
            ))}
          </select>
        </div>
        {dateInput('startDate', (startDate) =>
          update(endEdited ? { startDate } : { startDate, endDate: startDate }),
        )}
        {dateInput('endDate', (endDate) => {
          setEndEdited(true);
          update({ endDate });
        })}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-workDays`}>
            {t('leaves.form.numWorkDays')}
          </label>
          <input
            id={`${id}-workDays`}
            className={readOnlyClass}
            value={workDays === null ? '' : formatNumber(workDays, lang)}
            readOnly
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.isHalfDay}
            onChange={(e) => update({ isHalfDay: e.target.checked })}
          />
          {t('leaves.form.isHalfDay')}
        </label>
        {rule && (
          <p className="rounded bg-red-100 p-3 text-red-700">
            {translateErrorCode(rule)}
          </p>
        )}
        {create.isError && (
          <p role="alert" className="rounded bg-red-100 p-3 text-red-700">
            {serverMessage(create.error)}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded bg-slate-800 px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={invalid || create.isPending}
          >
            {create.isPending
              ? t('leaves.form.saving')
              : t('leaves.form.submit')}
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1"
            onClick={() => void navigate('/leaves')}
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
