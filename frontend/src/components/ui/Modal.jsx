import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ children, open, onClose, title, className = '' }) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(36,24,9,.55)] p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-label={title}
        aria-modal="true"
        className={`season-pop w-full max-w-md p-card-hero p-7 ${className}`}
        role="dialog"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
