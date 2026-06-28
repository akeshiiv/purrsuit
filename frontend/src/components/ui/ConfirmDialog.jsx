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
    <Modal open={open} onClose={close} title={isSecondStep ? secondTitle : title}>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{isSecondStep ? secondTitle : title}</h2>
          <p className="mt-2 text-sm text-slate-700">
            {isSecondStep ? secondMessage : message}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>Cancel</Button>
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
