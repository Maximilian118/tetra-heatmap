import type { ChangeEvent } from "react";
import riedelLogo from "../../../assets/riedel-logo.webp";
import "./ReportBanner.scss";

interface ReportBannerProps {
  title: string;
  onTitleChange: (title: string) => void;
}

/* Red Riedel banner — logo top-right, editable title large below */
const ReportBanner = ({ title, onTitleChange }: ReportBannerProps) => {
  /* Update the title when the user types in the input */
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onTitleChange(e.target.value);
  };

  return (
    <div className="report-banner">
      <div className="report-banner__top">
        <img className="report-banner__logo" src={riedelLogo} alt="Riedel" />
      </div>
      <input
        className="report-banner__title"
        value={title}
        onChange={handleChange}
        placeholder="Report Title"
        spellCheck={false}
      />
    </div>
  );
};

export default ReportBanner;
