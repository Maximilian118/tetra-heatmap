import "./ToggleSwitch.scss";

/* Props for the reusable toggle switch */
interface ToggleSwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/* A labelled toggle switch — a checkbox visually styled as a sliding pill */
const ToggleSwitch = ({ label, hint, checked, onChange }: ToggleSwitchProps) => (
  <div className="toggle-switch">
    <label className="toggle-switch__row">
      <span className="toggle-switch__label">{label}</span>
      <input
        className="toggle-switch__input"
        type="checkbox"
        checked={checked}
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
