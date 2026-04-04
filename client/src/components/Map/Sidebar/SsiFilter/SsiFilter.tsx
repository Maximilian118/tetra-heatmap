import "./SsiFilter.scss";

interface SsiFilterProps {
  onToggleRegister: () => void;
  selectedSsis: Set<number>;
}

/* Build the filter summary text based on the current SSI selection */
const formatFilterSummary = (selected: Set<number>): string => {
  if (selected.size === 0) return "All readings";
  if (selected.size === 1) {
    const ssi = selected.values().next().value;
    return `Readings from ISSI ${ssi}`;
  }
  return `Readings from ${selected.size} ISSI's`;
};

/* Sidebar section for opening the SSI Register overlay */
const SsiFilter = ({ onToggleRegister, selectedSsis }: SsiFilterProps) => {
  return (
    <div className="ssi-filter">
      <span className="ssi-filter__label">Filter</span>
      <span className="ssi-filter__count">{formatFilterSummary(selectedSsis)}</span>
      <button className="ssi-filter__btn" onClick={onToggleRegister}>
        SSI Register
      </button>
    </div>
  );
};

export default SsiFilter;
