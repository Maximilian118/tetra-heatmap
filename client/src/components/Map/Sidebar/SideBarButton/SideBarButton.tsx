import type { LucideIcon } from "lucide-react";
import "./SideBarButton.scss";

interface SideBarButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "accent";
}

/* Reusable full-width sidebar action button with optional accent variant */
const SideBarButton = ({ icon: Icon, label, onClick, disabled, variant = "default" }: SideBarButtonProps) => (
  <button
    className={`sidebar-btn${variant === "accent" ? " sidebar-btn--accent" : ""}`}
    onClick={onClick}
    disabled={disabled}
  >
    <Icon size={14} />
    {label}
  </button>
);

export default SideBarButton;
