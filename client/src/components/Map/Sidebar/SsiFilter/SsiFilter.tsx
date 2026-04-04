import "./SsiFilter.scss";

interface SsiFilterProps {
  onToggleRegister: () => void;
}

/* Sidebar section for opening the SSI Register overlay */
const SsiFilter = ({ onToggleRegister }: SsiFilterProps) => {
  return (
    <div className="ssi-filter">
      <span className="ssi-filter__label">Filter</span>
      <span className="ssi-filter__count">All ISSI's</span>
      <button className="ssi-filter__btn" onClick={onToggleRegister}>
        SSI Register
      </button>
    </div>
  );
};

export default SsiFilter;
