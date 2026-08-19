import type { ReactNode } from 'react';

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="box confirm" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{children}</p>
        <div className="confirm-row">
          <button className="ghost-btn" onClick={onCancel}>Cancelar</button>
          <button onClick={onConfirm} style={danger ? { background: 'var(--err)' } : undefined}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
