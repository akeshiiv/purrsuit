import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ children, open, onClose, title }) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-label={title}
        aria-modal="true"
        className="w-full max-w-md rounded bg-white p-4 shadow-lg"
        role="dialog"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
