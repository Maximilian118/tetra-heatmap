import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Upload, Trash2, XCircle } from "lucide-react";
import type { Reading, KmlFileMeta } from "../../../../utils/api";
import { fetchKmlFiles, fetchKmlContent, uploadKml, deleteKml } from "../../../../utils/api";
import { parseKml, computeKmlCenter, computeReadingsCenter, type KmlData } from "../../../../utils/kml";
import type { LayerType } from "../MapPresets/MapPresets";
import { generateUUID } from "../../../../utils/uuid";
import "./KmlPicker.scss";

interface KmlPickerProps {
  readings: Reading[];
  onKmlLoad: (data: KmlData) => void;
  onKmlClear: () => void;
  activeKmlId: string | null;
  onActiveKmlIdChange: (id: string | null) => void;
  onLayerTypeChange: (type: LayerType) => void;
}

/* Format an ISO timestamp into a readable locale string */
const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString();

/* KML file browser — search, upload, select, and manage persisted KML files */
const KmlPicker = ({ readings, onKmlLoad, onKmlClear, activeKmlId, onActiveKmlIdChange, onLayerTypeChange }: KmlPickerProps) => {
  const [kmlFiles, setKmlFiles] = useState<KmlFileMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Fetch the KML file list from the server, sorted by proximity to readings center */
  const refreshList = useCallback(async () => {
    const center = computeReadingsCenter(readings);
    const files = await fetchKmlFiles(center?.lat, center?.lng);
    setKmlFiles(files);
  }, [readings]);

  /* Load the file list on mount and when readings change */
  useEffect(() => {
    refreshList();
  }, [refreshList]);

  /* Handle selecting a KML file from the list */
  const handleSelect = async (file: KmlFileMeta) => {
    if (loading) return;
    setLoading(true);
    try {
      const content = await fetchKmlContent(file.id);
      const kmlData = parseKml(content, file.filename);
      if (kmlData.folders.length > 0) {
        onKmlLoad(kmlData);
        onActiveKmlIdChange(file.id);
        onLayerTypeChange("kml");
      }
    } catch (err) {
      console.error("Failed to load KML file:", err);
    } finally {
      setLoading(false);
    }
  };

  /* Read a single file as text via FileReader */
  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

  /* Handle uploading one or more KML files */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setUploading(fileArray.length);

    /* Upload all files concurrently */
    const results = await Promise.allSettled(
      fileArray.map(async (file) => {
        const content = await readFileAsText(file);
        const center = computeKmlCenter(content);
        const id = generateUUID();
        await uploadKml(id, file.name, center.lat, center.lng, content);
        return { id, name: file.name, content };
      })
    );

    /* Log any failures */
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`Failed to upload KML file "${fileArray[i].name}":`, r.reason);
      }
    });

    /* Refresh list and auto-select the last successfully uploaded file */
    await refreshList();
    const lastSuccess = [...results].reverse().find((r) => r.status === "fulfilled");
    if (lastSuccess && lastSuccess.status === "fulfilled") {
      const { id, name, content } = lastSuccess.value;
      const kmlData = parseKml(content, name);
      if (kmlData.folders.length > 0) {
        onKmlLoad(kmlData);
        onActiveKmlIdChange(id);
        onLayerTypeChange("kml");
      }
    }

    setUploading(0);

    /* Reset the input so the same files can be re-selected */
    e.target.value = "";
  };

  /* Handle deleting a KML file */
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteKml(id);

      /* If the deleted file was active, clear the KML overlay */
      if (activeKmlId === id) {
        onKmlClear();
        onActiveKmlIdChange(null);
      }

      await refreshList();
    } catch (err) {
      console.error("Failed to delete KML file:", err);
    }
  };

  /* Handle clearing the active KML selection — revert to heatmap layer */
  const handleClear = () => {
    onKmlClear();
    onActiveKmlIdChange(null);
    onLayerTypeChange("heatmap");
  };

  /* Filter the file list by search query */
  const filteredFiles = searchQuery
    ? kmlFiles.filter((f) => f.filename.toLowerCase().includes(searchQuery.toLowerCase()))
    : kmlFiles;

  return (
    <div className="kml-picker">
      <span className="kml-picker__label">KML Files</span>

      {/* Search input */}
      <div className="kml-picker__search-wrapper">
        <Search size={14} className="kml-picker__search-icon" />
        <input
          type="text"
          className="kml-picker__search"
          placeholder="Search KML files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Upload button */}
      <button
        className="kml-picker__upload-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading > 0}
      >
        <Upload size={14} />
        {uploading > 0 ? `Uploading ${uploading}...` : "Upload KML"}
      </button>

      {/* Hidden file input for KML upload (multiple allowed) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".kml"
        multiple
        className="kml-picker__file-input"
        onChange={handleFileUpload}
      />

      {/* Scrollable file list */}
      <div className="kml-picker__list">
        {filteredFiles.length === 0 ? (
          <span className="kml-picker__empty">
            {kmlFiles.length === 0 ? "No KML files uploaded yet" : "No files match your search"}
          </span>
        ) : (
          filteredFiles.map((file) => (
            <div
              key={file.id}
              className={`kml-picker__item ${activeKmlId === file.id ? "kml-picker__item--active" : ""}`}
              onClick={() => handleSelect(file)}
            >
              <div className="kml-picker__item-info">
                <span className="kml-picker__filename">{file.filename}</span>
                <span className="kml-picker__date">{formatDate(file.uploaded_at)}</span>
              </div>
              <button
                className="kml-picker__delete-btn"
                onClick={(e) => handleDelete(e, file.id)}
                aria-label="Delete KML file"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Clear selection button — only visible when a KML is active */}
      {activeKmlId && (
        <button className="kml-picker__clear-btn" onClick={handleClear}>
          <XCircle size={14} />
          Clear Selection
        </button>
      )}
    </div>
  );
};

export default KmlPicker;
