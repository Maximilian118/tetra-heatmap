import "./NotesButton.scss";

interface NotesButtonProps {
  onClick: () => void;
}

/* Map overlay button that opens the Notes tab in the sidebar */
const NotesButton = ({ onClick }: NotesButtonProps) => (
  <button className="notes-button" onClick={onClick} title="Open notes">
    Notes
  </button>
);

export default NotesButton;
