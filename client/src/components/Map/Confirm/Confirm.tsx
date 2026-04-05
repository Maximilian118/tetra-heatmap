import "./Confirm.scss";

interface ConfirmProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  detail?: string;
  confirmLabel?: string;
  variant?: "sidebar" | "overlay";
  confirmColor?: "red" | "blue";
}

/* Full-area overlay asking the user to confirm a destructive or significant action */
const Confirm = ({
  title,
  message,
  onConfirm,
  onCancel,
  detail,
  confirmLabel = "Confirm",
  variant = "sidebar",
  confirmColor = "red",
}: ConfirmProps) => {
  const rootClass =
    variant === "overlay"
      ? "confirm-overlay confirm-overlay--overlay"
      : "confirm-overlay";

  const confirmBtnClass =
    "confirm-overlay__btn confirm-overlay__btn--confirm" +
    (confirmColor === "blue" ? " confirm-overlay__btn--confirm-blue" : "");

  return (
    <div className={rootClass}>
      <h3 className="confirm-overlay__title">{title}</h3>
      <p className="confirm-overlay__message">{message}</p>

      {detail && <span className="confirm-overlay__detail">{detail}</span>}

      <div className="confirm-overlay__actions">
        <button className="confirm-overlay__btn confirm-overlay__btn--cancel" onClick={onCancel}>
          Cancel
        </button>
        <button className={confirmBtnClass} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
};

export default Confirm;
