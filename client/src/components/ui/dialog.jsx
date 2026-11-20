import { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils.js';
import { Button } from './button.jsx';

export function ConfirmDialog({ open, title, description, confirmLabel = 'Continue', cancelLabel = 'Cancel', onConfirm, onCancel }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn(
        'max-w-md rounded-[var(--dd-radius-lg)] border border-[var(--dd-border)] bg-[var(--dd-surface)] p-0 shadow-[var(--dd-shadow-card)] backdrop:bg-[var(--dd-primary)]/40',
        'open:animate-in'
      )}
      onCancel={(e) => {
        e.preventDefault();
        onCancel?.();
      }}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div className="p-6">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-[var(--dd-text)]">
          {title}
        </h2>
        {description && (
          <p id="confirm-dialog-desc" className="mt-2 text-sm text-[var(--dd-text-muted)]">
            {description}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm?.();
              ref.current?.close();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}