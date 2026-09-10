import "./ToggleSwitch.scss";

/* Props for the reusable toggle switch */
interface ToggleSwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/* A labelled toggle switch — a checkbox visually styled as a sliding pill.
   When disabled, the row is greyed out and the switch cannot be changed. */
const ToggleSwitch = ({ label, hint, checked, disabled, onChange }: ToggleSwitchProps) => (
  <div className="toggle-switch">
    <label className={`toggle-switch__row ${disabled ? "toggle-switch__row--locked" : ""}`}>
      <span className="toggle-switch__label">{label}</span>
      <input
        className="toggle-switch__input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-switch__track">
        <span className="toggle-switch__thumb" />
      </span>
    </label>
    {hint && <span className="toggle-switch__hint">{hint}</span>}
  </div>
);

export default ToggleSwitch;
