import { Download, X } from "lucide-react";
import "./ReportControls.scss";

interface ReportControlsProps {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}

/* Floating action buttons below the A4 report frame */
const ReportControls = ({ onCancel, onSave, saving }: ReportControlsProps) => (
  <div className="report-controls">
    <button className="report-controls__btn" onClick={onCancel} disabled={saving}>
      <X size={14} />
      Cancel
    </button>
    <button className="report-controls__btn report-controls__btn--accent" onClick={onSave} disabled={saving}>
      <Download size={14} />
      {saving ? "Saving..." : "Save PDF"}
    </button>
  </div>
);

export default ReportControls;
