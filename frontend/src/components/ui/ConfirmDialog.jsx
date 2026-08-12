import { useState } from 'react';
import Button from './Button.jsx';
import Modal from './Modal.jsx';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  secondTitle,
  secondMessage,
  secondConfirmLabel = 'Confirm anyway',
}) {
  const [step, setStep] = useState(0);
  const needsSecondStep = Boolean(secondTitle || secondMessage);
  const isSecondStep = needsSecondStep && step === 1;

  const close = () => {
    setStep(0);
    onClose();
  };

  return (
    <Modal className="max-w-[440px]" open={open} onClose={close} title={isSecondStep ? secondTitle : title}>
      <div className="space-y-5">
        <div>
          <h2 className="font-display text-[24px] font-extrabold text-ink">
            {isSecondStep ? secondTitle : title}
          </h2>
          <p className="mt-2 text-[13.5px] text-ink-muted">
            {isSecondStep ? secondMessage : message}
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="plain" onClick={close}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (needsSecondStep && step === 0) {
                setStep(1);
                return;
              }
              setStep(0);
              onConfirm();
            }}
          >
            {isSecondStep ? secondConfirmLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
