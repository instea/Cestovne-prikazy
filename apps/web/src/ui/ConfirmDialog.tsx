import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal confirmation (LV-03 delete, USR-04 deactivate), rendered in a portal
 * on `document.body`:
 * - focus starts on Cancel; Tab / Shift+Tab cycle only through the dialog's
 *   enabled controls, and everything else on the page is `inert` while it
 *   is open (user decision 2026-11-11);
 * - on close, focus returns to the element focused before it opened (the
 *   triggering button), if that is still on the page;
 * - Esc and a backdrop click cancel, not while `pending`; while `pending`
 *   both buttons are disabled and Confirm shows a spinner;
 * - `error` (translated) is shown in red inside the dialog.
 */
export function ConfirmDialog({
  role = 'dialog',
  title,
  children,
  error = null,
  confirmLabel,
  cancelLabel,
  confirmFirst = false,
  pending,
  spinnerTestId,
  onConfirm,
  onCancel,
}: {
  role?: 'dialog' | 'alertdialog';
  title: ReactNode;
  /** Body text; it is the dialog's accessible description. */
  children: ReactNode;
  error?: string | null;
  confirmLabel: string;
  cancelLabel: string;
  /** Button order: Confirm before Cancel (default: Cancel first). */
  confirmFirst?: boolean;
  pending: boolean;
  spinnerTestId?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(pending);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    pendingRef.current = pending;
    onCancelRef.current = onCancel;
  });

  // Inert background, initial focus, focus return.
  useEffect(() => {
    const dialog = dialogRef.current;
    const container = dialog?.closest<HTMLElement>('[data-dialog-root]');
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const madeInert: HTMLElement[] = [];
    for (const element of Array.from(document.body.children)) {
      if (
        element instanceof HTMLElement &&
        element !== container &&
        !element.hasAttribute('inert')
      ) {
        element.setAttribute('inert', '');
        madeInert.push(element);
      }
    }
    cancelRef.current?.focus();
    return () => {
      for (const element of madeInert) element.removeAttribute('inert');
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  // Esc = Cancel; Tab / Shift+Tab stay inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (e.key === 'Escape') {
        if (!pendingRef.current) onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      e.preventDefault();
      if (!first || !last) {
        // Everything disabled (pending): keep focus on the dialog itself.
        dialog.focus();
        return;
      }
      const index = focusable.indexOf(active as HTMLElement);
      if (e.shiftKey) {
        (index <= 0 ? last : focusable[index - 1]!).focus();
      } else {
        (index === -1 || active === last
          ? first
          : focusable[index + 1]!
        ).focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const cancelButton = (
    <button
      ref={cancelRef}
      type="button"
      className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={pending}
      onClick={onCancel}
    >
      {cancelLabel}
    </button>
  );
  const confirmButton = (
    <button
      type="button"
      className="flex items-center gap-2 rounded bg-red-700 px-3 py-1 text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={pending}
      aria-busy={pending}
      onClick={onConfirm}
    >
      {pending && (
        <span
          aria-hidden="true"
          data-testid={spinnerTestId}
          className="h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-white"
        />
      )}
      {confirmLabel}
    </button>
  );

  // Portal: a dialog must not live inside a table row, and it is the one
  // body child left non-inert.
  return createPortal(
    <div
      data-dialog-root=""
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        data-testid="dialog-backdrop"
        className="absolute inset-0 bg-slate-900/40"
        onClick={() => {
          if (!pending) onCancel();
        }}
      />
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="relative w-full max-w-md space-y-4 rounded bg-white p-6 text-left shadow-lg focus:outline-none"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p id={bodyId}>{children}</p>
        {error && <p className="text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          {confirmFirst ? confirmButton : cancelButton}
          {confirmFirst ? cancelButton : confirmButton}
        </div>
      </div>
    </div>,
    document.body,
  );
}
