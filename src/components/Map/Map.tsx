import { useState } from "react";
import ReactMapGL, { type ViewStateChangeEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./Map.scss";

/* Default viewport centred on Melbourne Albert Park */
const INITIAL_VIEW = {
  longitude: 144.968,
  latitude: -37.8497,
  zoom: 14,
};

/* Reads the MapBox token from Vite env */
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

/* Full-viewport MapBox map ready to receive heatmap layers */
const Map = () => {
  const [viewState, setViewState] = useState(INITIAL_VIEW);

  /* Sync viewport state on user interaction */
  const handleMove = (evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState);
  };

  return (
    <div className="map-container">
      <ReactMapGL
        {...viewState}
        onMove={handleMove}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export default Map;
