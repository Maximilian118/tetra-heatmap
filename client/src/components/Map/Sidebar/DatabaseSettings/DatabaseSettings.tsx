import { useState, useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import {
  fetchSettings,
  saveSettings,
  testDbConnection,
  type Settings,
} from "../../../../utils/api";
import "./DatabaseSettings.scss";

/* Default form values before settings are loaded from the server */
const DEFAULTS: Settings = {
  mapboxToken: "",
  dbHost: "",
  dbPort: 3306,
  dbUser: "",
  dbPassword: "",
  dbName: "tetraflexlogdb",
  syncIntervalMs: 60000,
  syncBatchSize: 10000,
  retentionDays: 5,
};

/* Props for the reusable form field helper */
interface SettingsFieldProps {
  label: string;
  description?: string;
  type?: "text" | "number" | "password";
  value: string | number;
  onChange: (value: string) => void;
}

/* A single labeled input field with an optional description for the settings form */
const SettingsField = ({
  label,
  description,
  type = "text",
  value,
  onChange,
}: SettingsFieldProps) => (
  <div className="db-settings__field">
    <label className="db-settings__field-label">{label}</label>
    <input
      className="db-settings__field-input"
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    {description && <span className="db-settings__field-desc">{description}</span>}
  </div>
);

/* Handle exposed to parent via ref so the Apply button can live in the sidebar footer */
export interface DatabaseSettingsHandle {
  apply: () => void;
}

interface DatabaseSettingsProps {
  onStateChange: (state: { saving: boolean; statusMessage: string | null }) => void;
}

/* Database connection and sync settings panel with connection status indicator */
const DatabaseSettings = forwardRef<DatabaseSettingsHandle, DatabaseSettingsProps>(
  ({ onStateChange }, ref) => {
    const [settings, setSettings] = useState<Settings>(DEFAULTS);
    const [connected, setConnected] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const savedTokenRef = useRef("");

    /* Load current settings and test connection on mount */
    useEffect(() => {
      fetchSettings()
        .then((data) => {
          setSettings(data);
          savedTokenRef.current = data.mapboxToken;
          setLoading(false);
        })
        .catch((err) => {
          console.error("Failed to load settings:", err);
          setLoading(false);
        });

      testDbConnection()
        .then((result) => setConnected(result.connected))
        .catch((err) => {
          console.error("Failed to test DB connection:", err);
          setConnected(false);
        });
    }, []);

    /* Report saving and status message changes to the parent */
    useEffect(() => {
      onStateChange({ saving, statusMessage });
    }, [saving, statusMessage, onStateChange]);

    /* Update a single field in the settings state */
    const updateField = <K extends keyof Settings>(
      key: K,
      value: Settings[K]
    ) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    };

    /* Save settings, test connection, and update status indicator.
       Reloads the page if the Mapbox token changed so the map picks it up. */
    const handleApply = async () => {
      setSaving(true);
      setStatusMessage(null);
      try {
        const result = await saveSettings(settings);
        if (!result.success && result.errors) {
          setStatusMessage(result.errors.join(", "));
          setSaving(false);
          return;
        }

        /* Reload so the map re-initialises with the new token */
        if (settings.mapboxToken !== savedTokenRef.current) {
          window.location.reload();
          return;
        }

        setConnected(result.connected);
        setStatusMessage(
          result.connected
            ? "Settings saved — connection successful"
            : `Settings saved — ${result.connectionError ?? "connection failed"}`
        );
      } catch {
        setStatusMessage("Failed to save — check server connection");
      } finally {
        setSaving(false);
      }
    };

    /* Expose the apply action to the parent via ref */
    useImperativeHandle(ref, () => ({ apply: handleApply }));

    if (loading) {
      return <div className="db-settings__loading">Loading...</div>;
    }

    /* Determine the connection status label and style modifier */
    const isConnected = connected === true;
    const statusLabel = isConnected ? "CONNECTED" : "DISCONNECTED";
    const statusModifier = isConnected ? "connected" : "disconnected";

    return (
      <div className="db-settings">
        {/* Connection section */}
        <div className="db-settings__section">
          <span className={`db-settings__status db-settings__status--${statusModifier}`}>
            {statusLabel}
          </span>
          <span className="db-settings__subtitle">TetraFlex Logserver Version 8.x</span>
          <SettingsField
            label="Host"
            value={settings.dbHost}
            onChange={(v) => updateField("dbHost", v)}
          />
          <SettingsField
            label="Port"
            type="number"
            value={settings.dbPort}
            onChange={(v) => updateField("dbPort", Number(v))}
          />
          <SettingsField
            label="Username"
            value={settings.dbUser}
            onChange={(v) => updateField("dbUser", v)}
          />
          <SettingsField
            label="Password"
            type="password"
            value={settings.dbPassword}
            onChange={(v) => updateField("dbPassword", v)}
          />
          <SettingsField
            label="Database"
            value={settings.dbName}
            onChange={(v) => updateField("dbName", v)}
          />
        </div>

        {/* Sync section */}
        <div className="db-settings__section">
          <span className="db-settings__label">Sync</span>
          <SettingsField
            label="Poll Interval (ms)"
            description="How often to sync new data"
            type="number"
            value={settings.syncIntervalMs}
            onChange={(v) => updateField("syncIntervalMs", Number(v))}
          />
          <SettingsField
            label="Batch Size"
            description="Max rows per sync batch"
            type="number"
            value={settings.syncBatchSize}
            onChange={(v) => updateField("syncBatchSize", Number(v))}
          />
          <SettingsField
            label="Retention (days)"
            description="Days of data to keep in cache"
            type="number"
            value={settings.retentionDays}
            onChange={(v) => updateField("retentionDays", Number(v))}
          />
        </div>

        {/* MapBox section */}
        <div className="db-settings__section">
          <span className="db-settings__label">MapBox</span>
          <SettingsField
            label="Access Token"
            description="Create one at account.mapbox.com/access-tokens"
            value={settings.mapboxToken}
            onChange={(v) => updateField("mapboxToken", v)}
          />
        </div>
      </div>
    );
  }
);

export default DatabaseSettings;
