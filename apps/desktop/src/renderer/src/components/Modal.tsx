import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) =>
      !element.closest('[hidden], [inert]') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      getComputedStyle(element).display !== 'none' &&
      getComputedStyle(element).visibility !== 'hidden',
  );
}

export function Modal({
  titleId,
  onClose,
  busy = false,
  active = true,
  fallbackFocus,
  children,
}: {
  titleId: string;
  onClose(): void;
  busy?: boolean;
  active?: boolean;
  fallbackFocus?(): HTMLElement | null;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  const activeRef = useRef(active);
  onCloseRef.current = onClose;
  busyRef.current = busy;
  activeRef.current = active;

  useLayoutEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    const appRoot = document.getElementById('root');
    if (
      (!restoreFocusRef.current || !restoreFocusRef.current.isConnected) &&
      document.activeElement instanceof HTMLElement
    )
      restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const priorAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;
    const priorInert = appRoot?.hasAttribute('inert') ?? false;
    document.body.style.overflow = 'hidden';
    appRoot?.setAttribute('aria-hidden', 'true');
    appRoot?.setAttribute('inert', '');
    if (dialog) getFocusable(dialog).at(0)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (!dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) onCloseRef.current();
      } else if (event.key === 'Tab') {
        const focusable = getFocusable(dialog);
        if (focusable.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (!dialog.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (appRoot) {
        if (priorAriaHidden === null) appRoot.removeAttribute('aria-hidden');
        else appRoot.setAttribute('aria-hidden', priorAriaHidden);
        if (!priorInert) appRoot.removeAttribute('inert');
      }
      if (activeRef.current) {
        const restoreTarget = restoreFocusRef.current;
        if (restoreTarget?.isConnected) restoreTarget.focus();
        else fallbackFocus?.()?.focus();
        restoreFocusRef.current = null;
      }
    };
  }, [active]);

  if (!active) return null;

  return createPortal(
    <div
      className="modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busyRef.current)
          onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
