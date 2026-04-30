import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { getPool } from "../db/remote.js";
import { getServerTzOffsetHours } from "../services/sync.js";

const router = Router();

/* Fetch comprehensive LogServer statistics from the remote TetraFlex database */
router.get("/stats", async (_req, res) => {
  const pool = getPool();

  if (!pool) {
    res.status(503).json({ error: "Database not connected" });
    return;
  }

  try {
    /* Run all queries in parallel for speed */
    const [
      [serverStatusRows],
      [dbVersionRows],
      [mysqlVersionRows],
      [hostnameRows],
      [systemLoadRows],
      [dbSizeRows],
      [nodeRows],
      [orgCountRows],
      [indiSubRows],
      [groupSubRows],
      [registeredMsRows],
      [groupCallRows],
      [indiCallRows],
      [pttRows],
      [sdsRows],
      [lastGroupCallRows],
      [lastIndiCallRows],
      [lastSdsRows],
      [lastRegRows],
      [serverConfigRows],
      [dongleRows],
      [alarmRows],
    ] = await Promise.all([
      pool.query<RowDataPacket[]>("SELECT ServerVersion, StartupTime, UpdateTime FROM serverstatus LIMIT 1"),
      pool.query<RowDataPacket[]>("SELECT Version FROM databaseversion LIMIT 1"),
      pool.query<RowDataPacket[]>("SELECT VERSION() AS version"),
      pool.query<RowDataPacket[]>("SELECT @@hostname AS hostname"),
      pool.query<RowDataPacket[]>("SELECT CpuLoadTotal, MemUsageKB, MemUsagePeakKB, AvailableMemMB, DiskSpaceFreeMB, DiskSpaceTotalMB FROM systemload LIMIT 1"),
      pool.query<RowDataPacket[]>("SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb FROM information_schema.tables WHERE table_schema = 'tetraflexlogdb'"),
      pool.query<RowDataPacket[]>("SELECT NodeNo, Description FROM nodestatus GROUP BY NodeNo, Description"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM organization"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM subscriber WHERE GroupSubscriber = 0 AND MarkedForDeletion = 0"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM subscriber WHERE GroupSubscriber = 1 AND MarkedForDeletion = 0"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM mslocation"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM groupcall"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM individualcall"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM groupptt"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM sdsdata"),
      pool.query<RowDataPacket[]>("SELECT MAX(CallEnd) AS ts FROM groupcall"),
      pool.query<RowDataPacket[]>("SELECT MAX(CallEnd) AS ts FROM individualcall"),
      pool.query<RowDataPacket[]>("SELECT MAX(Timestamp) AS ts FROM sdsdata"),
      pool.query<RowDataPacket[]>("SELECT MAX(Timestamp) AS ts FROM mslocation"),
      pool.query<RowDataPacket[]>("SELECT InfoLog, SdsLog, LogAll, VoiceLogMax FROM serverconfig LIMIT 1"),
      pool.query<RowDataPacket[]>("SELECT Serial, ApplDateLimit FROM dongleconfig LIMIT 1"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM nodealarmeventlog WHERE TimeLast > DATE_SUB(NOW(), INTERVAL 24 HOUR)"),
    ]);

    /* Parse dongle date limit from YYYYMMDD integer to ISO date string */
    const dongle = dongleRows[0];
    const rawDate = dongle?.ApplDateLimit ?? 0;
    const dateStr = String(rawDate);
    const expiryDate = dateStr.length === 8
      ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
      : null;

    /* Format timestamp fields as ISO strings (or null) */
    const toIso = (val: unknown): string | null =>
      val instanceof Date ? val.toISOString() : val ? String(val) : null;

    const ss = serverStatusRows[0];
    const sl = systemLoadRows[0];
    const sc = serverConfigRows[0];

    res.json({
      server: {
        version: ss?.ServerVersion ?? null,
        dbVersion: dbVersionRows[0]?.Version ?? null,
        mysqlVersion: mysqlVersionRows[0]?.version ?? null,
        hostname: hostnameRows[0]?.hostname ?? null,
        startupTime: toIso(ss?.StartupTime),
        timezone: getServerTzOffsetHours(),
      },
      system: {
        cpuLoad: sl?.CpuLoadTotal ?? null,
        memUsageMB: sl ? Math.round(sl.MemUsageKB / 1024) : null,
        memPeakMB: sl ? Math.round(sl.MemUsagePeakKB / 1024) : null,
        memAvailableMB: sl?.AvailableMemMB ?? null,
        diskFreeMB: sl?.DiskSpaceFreeMB ?? null,
        diskTotalMB: sl?.DiskSpaceTotalMB ?? null,
        dbSizeMB: dbSizeRows[0]?.size_mb ?? null,
      },
      network: {
        nodes: nodeRows.map((n: RowDataPacket) => ({
          nodeNo: n.NodeNo,
          description: n.Description?.trim() ?? "",
        })),
        organizationCount: orgCountRows[0]?.cnt ?? 0,
        individualSubscribers: indiSubRows[0]?.cnt ?? 0,
        groupSubscribers: groupSubRows[0]?.cnt ?? 0,
        registeredMs: registeredMsRows[0]?.cnt ?? 0,
      },
      activity: {
        groupCalls: groupCallRows[0]?.cnt ?? 0,
        individualCalls: indiCallRows[0]?.cnt ?? 0,
        pttEvents: pttRows[0]?.cnt ?? 0,
        sdsMessages: sdsRows[0]?.cnt ?? 0,
        lastGroupCall: toIso(lastGroupCallRows[0]?.ts),
        lastIndividualCall: toIso(lastIndiCallRows[0]?.ts),
        lastSds: toIso(lastSdsRows[0]?.ts),
        lastRegistration: toIso(lastRegRows[0]?.ts),
      },
      logging: {
        infoLog: sc?.InfoLog === 1,
        sdsLog: sc?.SdsLog === 1,
        logAll: sc?.LogAll === 1,
        voiceLogMax: sc?.VoiceLogMax ?? 0,
      },
      license: {
        serial: dongle?.Serial ?? null,
        expiryDate,
      },
      alarms: {
        last24h: alarmRows[0]?.cnt ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
