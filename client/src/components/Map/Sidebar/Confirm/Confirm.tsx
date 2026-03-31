import "./Confirm.scss";

interface ConfirmProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  detail?: string;
  confirmLabel?: string;
}

/* Full-sidebar overlay asking the user to confirm a destructive action */
const Confirm = ({ title, message, onConfirm, onCancel, detail, confirmLabel = "Confirm" }: ConfirmProps) => (
  <div className="confirm-overlay">
    <h3 className="confirm-overlay__title">{title}</h3>
    <p className="confirm-overlay__message">{message}</p>

    {detail && <span className="confirm-overlay__detail">{detail}</span>}

    <div className="confirm-overlay__actions">
      <button className="confirm-overlay__btn confirm-overlay__btn--cancel" onClick={onCancel}>
        Cancel
      </button>
      <button className="confirm-overlay__btn confirm-overlay__btn--confirm" onClick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  </div>
);

export default Confirm;
