import { useState, useEffect } from "react";
import {
  X,
  Server,
  Cpu,
  Network,
  Activity,
  ScrollText,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { fetchStats, type LogserverStats as Stats } from "../../../utils/api";
import { formatTzLabel } from "../../../utils/format";
import "./LogserverStats.scss";

interface LogserverStatsProps {
  onClose: () => void;
}

/* Format a number with locale-aware thousands separators */
const fmtNum = (n: number): string => n.toLocaleString();

/* Format megabytes as a human-readable size string (MB or GB) */
const fmtSize = (mb: number): string =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${fmtNum(Math.round(mb))} MB`;

/* Format a duration in milliseconds as a compact human-readable string */
const fmtDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
};

/* Format an ISO timestamp into a local-friendly short date/time */
const fmtTimestamp = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/* Compute disk/memory usage percentage */
const pct = (used: number, total: number): number =>
  total > 0 ? Math.round((used / total) * 100) : 0;

/* Single key/value row */
const Row = ({ label, value }: { label: string; value: string | number }) => (
  <div className="ls-stats__row">
    <span className="ls-stats__label">{label}</span>
    <span className="ls-stats__value">{value}</span>
  </div>
);

/* On/off badge for boolean config values */
const Badge = ({ on }: { on: boolean }) => (
  <span className={`ls-stats__badge ${on ? "ls-stats__badge--on" : "ls-stats__badge--off"}`}>
    {on ? "On" : "Off"}
  </span>
);

/* Progress bar showing used/total with percentage */
const UsageBar = ({ used, total, label }: { used: number; total: number; label: string }) => {
  const percent = pct(used, total);
  return (
    <div className="ls-stats__usage">
      <div className="ls-stats__usage-header">
        <span className="ls-stats__label">{label}</span>
        <span className="ls-stats__value">
          {fmtSize(used)} / {fmtSize(total)} ({percent}%)
        </span>
      </div>
      <div className="ls-stats__bar">
        <div
          className={`ls-stats__bar-fill ${percent > 90 ? "ls-stats__bar-fill--warn" : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

/* Full-screen overlay displaying comprehensive LogServer statistics */
const LogserverStats = ({ onClose }: LogserverStatsProps) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Fetch stats from the API on mount */
  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  /* Compute uptime from startup time */
  const uptimeStr =
    stats?.server.startupTime
      ? fmtDuration(Date.now() - new Date(stats.server.startupTime).getTime())
      : "—";

  return (
    <div className="ls-stats">
      <div className="ls-stats__header">
        <h3 className="ls-stats__title">Logserver Stats</h3>
        <button className="ls-stats__close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="ls-stats__body">
        {error && <p className="ls-stats__error">{error}</p>}

        {!stats && !error && <p className="ls-stats__loading">Loading...</p>}

        {stats && (
          <>
            {/* ── Server ─────────────────────────────── */}
            <section className="ls-stats__section">
              <h4 className="ls-stats__section-title">
                <Server size={14} /> Server
              </h4>
              <Row label="Version" value={stats.server.version ?? "—"} />
              <Row label="DB Version" value={stats.server.dbVersion ?? "—"} />
              <Row label="MySQL" value={stats.server.mysqlVersion ?? "—"} />
              <Row label="Hostname" value={stats.server.hostname ?? "—"} />
              <Row label="Uptime" value={uptimeStr} />
              <Row label="Timezone" value={formatTzLabel(stats.server.timezone)} />
            </section>

            {/* ── System Resources ────────────────────── */}
            <section className="ls-stats__section">
              <h4 className="ls-stats__section-title">
                <Cpu size={14} /> System
              </h4>
              <Row label="CPU Load" value={stats.system.cpuLoad !== null ? `${stats.system.cpuLoad}%` : "—"} />
              {stats.system.memUsageMB !== null && stats.system.memAvailableMB !== null && (
                <UsageBar
                  used={stats.system.memUsageMB}
                  total={stats.system.memUsageMB + stats.system.memAvailableMB}
                  label="Memory"
                />
              )}
              {stats.system.memPeakMB !== null && (
                <Row label="Memory Peak" value={fmtSize(stats.system.memPeakMB)} />
              )}
              {stats.system.diskFreeMB !== null && stats.system.diskTotalMB !== null && (
                <UsageBar
                  used={stats.system.diskTotalMB - stats.system.diskFreeMB}
                  total={stats.system.diskTotalMB}
                  label="Disk"
                />
              )}
              {stats.system.dbSizeMB !== null && (
                <Row label="Database Size" value={fmtSize(stats.system.dbSizeMB)} />
              )}
            </section>

            {/* ── Network ────────────────────────────── */}
            <section className="ls-stats__section">
              <h4 className="ls-stats__section-title">
                <Network size={14} /> Network
              </h4>
              <Row label="Nodes" value={stats.network.nodes.length} />
              {stats.network.nodes.map((n) => (
                <div key={`${n.nodeNo}-${n.description}`} className="ls-stats__row ls-stats__row--indent">
                  <span className="ls-stats__label">Node {n.nodeNo}</span>
                  <span className="ls-stats__value">{n.description}</span>
                </div>
              ))}
              <Row label="Organizations" value={fmtNum(stats.network.organizationCount)} />
              <Row label="Individual Subscribers" value={fmtNum(stats.network.individualSubscribers)} />
              <Row label="Group Subscribers" value={fmtNum(stats.network.groupSubscribers)} />
              <Row label="Registered MSs" value={fmtNum(stats.network.registeredMs)} />
            </section>

            {/* ── Activity ───────────────────────────── */}
            <section className="ls-stats__section">
              <h4 className="ls-stats__section-title">
                <Activity size={14} /> Activity
              </h4>
              <Row label="Group Calls" value={fmtNum(stats.activity.groupCalls)} />
              <Row label="Individual Calls" value={fmtNum(stats.activity.individualCalls)} />
              <Row label="PTT Events" value={fmtNum(stats.activity.pttEvents)} />
              <Row label="SDS Messages" value={fmtNum(stats.activity.sdsMessages)} />
              <Row label="Last Group Call" value={fmtTimestamp(stats.activity.lastGroupCall)} />
              <Row label="Last Individual Call" value={fmtTimestamp(stats.activity.lastIndividualCall)} />
              <Row label="Last SDS" value={fmtTimestamp(stats.activity.lastSds)} />
              <Row label="Last Registration" value={fmtTimestamp(stats.activity.lastRegistration)} />
            </section>

            {/* ── Logging ────────────────────────────── */}
            <section className="ls-stats__section">
              <h4 className="ls-stats__section-title">
                <ScrollText size={14} /> Logging
              </h4>
              <div className="ls-stats__row">
                <span className="ls-stats__label">Info Log</span>
                <Badge on={stats.logging.infoLog} />
              </div>
              <div className="ls-stats__row">
                <span className="ls-stats__label">SDS Log</span>
                <Badge on={stats.logging.sdsLog} />
              </div>
              <div className="ls-stats__row">
                <span className="ls-stats__label">Log All</span>
                <Badge on={stats.logging.logAll} />
              </div>
              <Row label="Voice Log Max" value={stats.logging.voiceLogMax} />
            </section>

            {/* ── License ────────────────────────────── */}
            <section className="ls-stats__section">
              <h4 className="ls-stats__section-title">
                <KeyRound size={14} /> License
              </h4>
              <Row label="Dongle Serial" value={stats.license.serial ?? "—"} />
              <Row label="Expiry" value={stats.license.expiryDate ?? "—"} />
            </section>

            {/* ── Alarms ─────────────────────────────── */}
            <section className="ls-stats__section">
              <h4 className="ls-stats__section-title">
                <AlertTriangle size={14} /> Alarms
              </h4>
              <Row label="Last 24 Hours" value={fmtNum(stats.alarms.last24h)} />
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default LogserverStats;
