import { useState } from "react";
import { fetchSettings, saveSettings } from "../../../utils/api";
import "./MapboxSetup.scss";

/* Full-page setup screen shown on first load when no Mapbox token is configured */
const MapboxSetup = () => {
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Save the token by merging it into the existing settings, then reload */
  const handleApply = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Please enter a Mapbox access token");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const current = await fetchSettings();
      await saveSettings({ ...current, mapboxToken: trimmed });
      window.location.reload();
    } catch {
      setError("Failed to save — check server connection");
      setSaving(false);
    }
  };

  return (
    <div className="mapbox-setup">
      <div className="mapbox-setup__card">
        <h2 className="mapbox-setup__title">MapBox Access Token Required</h2>
        <p className="mapbox-setup__text">
          This application uses MapBox GL to render maps. To get started,
          create a free access token and paste it below.
        </p>
        <a
          className="mapbox-setup__link"
          href="https://account.mapbox.com/access-tokens/"
          target="_blank"
          rel="noopener noreferrer"
        >
          account.mapbox.com/access-tokens
        </a>

        <input
          className="mapbox-setup__input"
          type="text"
          placeholder="pk.eyJ1..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />

        {error && <span className="mapbox-setup__error">{error}</span>}

        <button
          className="mapbox-setup__btn"
          onClick={handleApply}
          disabled={saving}
        >
          {saving ? "Applying..." : "Apply"}
        </button>
      </div>
    </div>
  );
};

export default MapboxSetup;
