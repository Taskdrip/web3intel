import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  CreateMiningConfigurationBody,
  CreateMiningConfigurationResponse,
  CreateMiningPairingCodeBody,
  CreateMiningPairingCodeResponse,
  DisconnectMiningDeviceParams,
  DisconnectMiningDeviceResponse,
  GetAdminMiningOverviewResponse,
  GetMiningDashboardResponse,
  GetMiningDeviceStatisticsParams,
  GetMiningDeviceStatisticsResponse,
  GetMiningEngineStatusResponse,
  HeartbeatMiningDeviceParams,
  HeartbeatMiningDeviceResponse,
  ListMiningConfigurationsResponse,
  PairMiningDeviceBody,
  PairMiningDeviceResponse,
  RevokeMiningConsentResponse,
  RevokeMiningDeviceParams,
  RevokeMiningDeviceResponse,
  ReportMiningTelemetryBody,
  ReportMiningTelemetryParams,
  ReportMiningTelemetryResponse,
  SuspendAdminMiningDeviceParams,
  SuspendAdminMiningDeviceResponse,
  UpdateAdminMiningEngineBody,
  UpdateAdminMiningEngineResponse,
} from "@workspace/api-zod";
import {
  db,
  miningConfigurationsTable,
  miningConsentsTable,
  miningDevicesTable,
  miningPairingCodesTable,
  miningSettingsTable,
  miningStatisticsTable,
} from "@workspace/db";
import { requireActiveUser, requireAdmin } from "../middlewares/authorization";

const router: IRouter = Router();
const CONSENT_VERSION = "mining-consent-v1";
const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const DEVICE_HEARTBEAT_FRESH_MS = 2 * 60 * 1000;
const pairingAttempts = new Map<string, { count: number; resetAt: number }>();

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const walletAddressPattern = new RegExp(
  `^(?:[48][${base58Alphabet}]{94}|4[${base58Alphabet}]{105})$`,
);
const osValues = new Set(["windows_10_11", "linux_ubuntu_debian", "linux_other"]);
const profileLimits: Record<string, number> = {
  eco: 25,
  balanced: 50,
  performance: 75,
};

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function sanitizeDeviceName(value: string): string {
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80);
}

function validPoolHost(value: string): boolean {
  const host = value.trim();
  if (!host || host.length > 253 || /[:/\\@\s]/.test(host)) return false;
  if (host.toLowerCase() === "localhost") return true;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    return host.split(".").every((part) => Number(part) <= 255);
  }
  return host.split(".").every((label) =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}

async function getOrCreateSettings() {
  await db.insert(miningSettingsTable)
    .values({ id: 1 })
    .onConflictDoNothing();
  const [settings] = await db.select().from(miningSettingsTable)
    .where(eq(miningSettingsTable.id, 1))
    .limit(1);
  return settings ?? { id: 1, engineEnabled: true, moneroEnabled: true, updatedBy: null, updatedAt: new Date() };
}

function engineStatus(settings: {
  engineEnabled: boolean;
  moneroEnabled: boolean;
}) {
  return {
    engineEnabled: settings.engineEnabled,
    moneroEnabled: settings.moneroEnabled,
    coin: "monero" as const,
    algorithm: "RandomX" as const,
  };
}

function mapConfiguration(row: typeof miningConfigurationsTable.$inferSelect) {
  return {
    id: row.id,
    deviceId: row.deviceId,
    coin: "monero" as const,
    algorithm: "RandomX" as const,
    connectionMethod: row.connectionMethod as "pool" | "solo" | "p2pool",
    poolHost: row.poolHost,
    poolPort: row.poolPort,
    tlsEnabled: row.tlsEnabled,
    walletAddress: row.walletAddress,
    cpuThreadLimit: row.cpuThreadLimit,
    profile: row.profile as "eco" | "balanced" | "performance" | "custom",
    createdAt: row.createdAt.toISOString(),
  };
}

function mapStatistic(row: typeof miningStatisticsTable.$inferSelect) {
  return {
    id: row.id,
    deviceId: row.deviceId,
    hashrate: row.hashrate,
    acceptedShares: row.acceptedShares,
    rejectedShares: row.rejectedShares,
    uptime: row.uptime,
    source: "device_reported" as const,
    recordedAt: row.recordedAt.toISOString(),
    verificationStatus: "awaiting_pool_verification" as const,
  };
}

type LatestStats = Map<number, typeof miningStatisticsTable.$inferSelect>;

async function latestStatsFor(deviceIds: number[]): Promise<LatestStats> {
  if (!deviceIds.length) return new Map();
  const rows = await db.select().from(miningStatisticsTable)
    .where(inArray(miningStatisticsTable.deviceId, deviceIds))
    .orderBy(desc(miningStatisticsTable.recordedAt));
  const latest: LatestStats = new Map();
  for (const row of rows) {
    if (!latest.has(row.deviceId)) latest.set(row.deviceId, row);
  }
  return latest;
}

function mapDevice(
  row: typeof miningDevicesTable.$inferSelect,
  latest?: typeof miningStatisticsTable.$inferSelect,
) {
  const isFresh = row.lastHeartbeat !== null &&
    Date.now() - row.lastHeartbeat.getTime() <= DEVICE_HEARTBEAT_FRESH_MS;
  const status = row.status === "connected" && !isFresh ? "offline" : row.status;
  return {
    id: row.id,
    deviceName: row.deviceName,
    operatingSystem: row.operatingSystem as "windows_10_11" | "linux_ubuntu_debian" | "linux_other",
    cpuModel: row.cpuModel,
    workerId: row.workerId,
    status: status as "offline" | "connected" | "disconnected" | "revoked" | "suspended",
    algorithm: row.algorithm,
    pairedAt: row.pairedAt.toISOString(),
    lastHeartbeat: iso(row.lastHeartbeat),
    createdAt: row.createdAt.toISOString(),
    hashrate: latest?.hashrate ?? null,
    acceptedShares: latest?.acceptedShares ?? 0,
    rejectedShares: latest?.rejectedShares ?? 0,
    uptime: latest?.uptime ?? 0,
    verificationStatus: "awaiting_pool_verification" as const,
  };
}

function deviceTokenFromRequest(req: { get: (name: string) => string | undefined }): string | null {
  const header = req.get("authorization");
  if (!header?.startsWith("Bearer w3i_")) return null;
  return header.slice("Bearer ".length);
}

async function authenticateDevice(req: Parameters<typeof deviceTokenFromRequest>[0], deviceId: number) {
  const token = deviceTokenFromRequest(req);
  if (!token) return null;
  const [device] = await db.select().from(miningDevicesTable)
    .where(and(
      eq(miningDevicesTable.id, deviceId),
      eq(miningDevicesTable.credentialHash, hashSecret(token)),
    ))
    .limit(1);
  if (!device || ["revoked", "suspended", "disconnected"].includes(device.status)) return null;
  return device;
}

function allowPairingAttempt(req: { ip: string | undefined }, res: Response): boolean {
  const now = Date.now();
  const key = req.ip ?? "unknown";
  const current = pairingAttempts.get(key);
  if (!current || current.resetAt <= now) {
    pairingAttempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (current.count >= 10) {
    res.status(429).json({ error: "Too many pairing attempts. Try again later." });
    return false;
  }
  current.count += 1;
  return true;
}

router.get("/mining/engine", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(GetMiningEngineStatusResponse.parse(engineStatus(settings)));
});

router.get("/mining/dashboard", requireActiveUser, async (_req, res): Promise<void> => {
  const user = res.locals.currentUser as { clerkUserId: string };
  const [devices, configurations] = await Promise.all([
    db.select().from(miningDevicesTable)
      .where(eq(miningDevicesTable.userId, user.clerkUserId))
      .orderBy(desc(miningDevicesTable.createdAt)),
    db.select().from(miningConfigurationsTable)
      .where(eq(miningConfigurationsTable.userId, user.clerkUserId))
      .orderBy(desc(miningConfigurationsTable.createdAt)),
  ]);
  const latestStats = await latestStatsFor(devices.map((device) => device.id));
  const mappedDevices = devices.map((device) => mapDevice(device, latestStats.get(device.id)));
  const freshDevices = mappedDevices.filter((device) => device.status === "connected");
  const reportedHashrate = mappedDevices.reduce((sum, device) => sum + (device.hashrate ?? 0), 0);
  const latestRecordedAt = [...latestStats.values()]
    .map((stat) => stat.recordedAt)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  res.json(GetMiningDashboardResponse.parse({
    devices: mappedDevices,
    configurations: configurations.map(mapConfiguration),
    currentReportedHashrate: mappedDevices.some((device) => device.hashrate !== null) ? reportedHashrate : null,
    acceptedShares: mappedDevices.reduce((sum, device) => sum + device.acceptedShares, 0),
    rejectedShares: mappedDevices.reduce((sum, device) => sum + device.rejectedShares, 0),
    onlineDevices: freshDevices.length,
    verifiedHashrate: null,
    verificationStatus: "awaiting_pool_verification",
    updatedAt: iso(latestRecordedAt),
  }));
});

router.get("/mining/configurations", requireActiveUser, async (_req, res): Promise<void> => {
  const user = res.locals.currentUser as { clerkUserId: string };
  const rows = await db.select().from(miningConfigurationsTable)
    .where(eq(miningConfigurationsTable.userId, user.clerkUserId))
    .orderBy(desc(miningConfigurationsTable.createdAt));
  res.json(ListMiningConfigurationsResponse.parse(rows.map(mapConfiguration)));
});

router.post("/mining/configurations", requireActiveUser, async (req, res): Promise<void> => {
  const parsed = CreateMiningConfigurationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  if (!walletAddressPattern.test(input.walletAddress)) {
    res.status(400).json({ error: "Enter a valid-looking public Monero wallet address. The address checksum is not verified." });
    return;
  }
  if (!validPoolHost(input.poolHost)) {
    res.status(400).json({ error: "Enter a host name only. Do not include a URL scheme, path, or port." });
    return;
  }
  if (input.profile !== "custom" && profileLimits[input.profile] !== input.cpuThreadLimit) {
    res.status(400).json({ error: "The selected profile does not match its CPU thread hint." });
    return;
  }

  const settings = await getOrCreateSettings();
  if (!settings.engineEnabled || !settings.moneroEnabled) {
    res.status(503).json({ error: "The Mining Engine is currently disabled." });
    return;
  }

  const user = res.locals.currentUser as { clerkUserId: string };
  const [configuration] = await db.insert(miningConfigurationsTable).values({
    userId: user.clerkUserId,
    coin: "monero",
    algorithm: "RandomX",
    connectionMethod: input.connectionMethod,
    poolHost: input.poolHost.trim().toLowerCase(),
    poolPort: input.poolPort,
    tlsEnabled: input.tlsEnabled,
    walletAddress: input.walletAddress,
    cpuThreadLimit: input.cpuThreadLimit,
    profile: input.profile,
  }).returning();
  await db.insert(miningConsentsTable).values({
    userId: user.clerkUserId,
    consentVersion: CONSENT_VERSION,
    acceptedAt: new Date(),
  });

  res.status(201).json(CreateMiningConfigurationResponse.parse(mapConfiguration(configuration)));
});

router.post("/mining/pairing-codes", requireActiveUser, async (req, res): Promise<void> => {
  const parsed = CreateMiningPairingCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = res.locals.currentUser as { clerkUserId: string };
  const [configuration] = await db.select().from(miningConfigurationsTable)
    .where(and(
      eq(miningConfigurationsTable.id, parsed.data.configurationId),
      eq(miningConfigurationsTable.userId, user.clerkUserId),
    ))
    .limit(1);
  if (!configuration) {
    res.status(400).json({ error: "Select one of your own mining configurations." });
    return;
  }
  const [activeConsent] = await db.select({ id: miningConsentsTable.id })
    .from(miningConsentsTable)
    .where(and(
      eq(miningConsentsTable.userId, user.clerkUserId),
      isNull(miningConsentsTable.revokedAt),
    ))
    .limit(1);
  if (!activeConsent) {
    res.status(403).json({ error: "Accept the current mining consent before pairing a device." });
    return;
  }
  const settings = await getOrCreateSettings();
  if (!settings.engineEnabled || !settings.moneroEnabled) {
    res.status(503).json({ error: "The Mining Engine is currently disabled." });
    return;
  }

  const pairingCode = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
  await db.insert(miningPairingCodesTable).values({
    userId: user.clerkUserId,
    configurationId: configuration.id,
    deviceName: sanitizeDeviceName(parsed.data.deviceName),
    operatingSystem: parsed.data.operatingSystem,
    codeHash: hashSecret(pairingCode),
    expiresAt,
  });
  res.status(201).json(CreateMiningPairingCodeResponse.parse({
    pairingCode,
    expiresAt: expiresAt.toISOString(),
  }));
});

router.post("/mining/pair", async (req, res): Promise<void> => {
  if (!allowPairingAttempt(req, res)) return;
  const parsed = PairMiningDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const pairingHash = hashSecret(parsed.data.pairingCode);
  const now = new Date();
  const [candidate] = await db.select().from(miningPairingCodesTable)
    .where(and(
      eq(miningPairingCodesTable.codeHash, pairingHash),
      isNull(miningPairingCodesTable.usedAt),
      gt(miningPairingCodesTable.expiresAt, now),
    ))
    .limit(1);
  if (!candidate) {
    res.status(400).json({ error: "The pairing code is invalid, expired, or already used." });
    return;
  }
  const settings = await getOrCreateSettings();
  if (!settings.engineEnabled || !settings.moneroEnabled) {
    res.status(503).json({ error: "The Mining Engine is currently disabled." });
    return;
  }

  const [claimed] = await db.update(miningPairingCodesTable)
    .set({ usedAt: now })
    .where(and(
      eq(miningPairingCodesTable.id, candidate.id),
      isNull(miningPairingCodesTable.usedAt),
      gt(miningPairingCodesTable.expiresAt, now),
    ))
    .returning();
  if (!claimed) {
    res.status(400).json({ error: "The pairing code is invalid, expired, or already used." });
    return;
  }

  const credentialToken = `w3i_${randomBytes(32).toString("base64url")}`;
  const [device] = await db.insert(miningDevicesTable).values({
    userId: claimed.userId,
    deviceName: sanitizeDeviceName(claimed.deviceName),
    operatingSystem: claimed.operatingSystem,
    cpuModel: parsed.data.cpuModel?.trim().slice(0, 160) || null,
    workerId: randomBytes(12).toString("hex"),
    credentialHash: hashSecret(credentialToken),
    status: "offline",
    algorithm: "RandomX",
  }).returning();
  await Promise.all([
    db.update(miningConfigurationsTable)
      .set({ deviceId: device.id })
      .where(and(
        eq(miningConfigurationsTable.id, claimed.configurationId),
        eq(miningConfigurationsTable.userId, claimed.userId),
      )),
    db.update(miningConsentsTable)
      .set({ deviceId: device.id })
      .where(and(
        eq(miningConsentsTable.userId, claimed.userId),
        isNull(miningConsentsTable.revokedAt),
      )),
  ]);

  res.status(201).json(PairMiningDeviceResponse.parse({
    device: mapDevice(device),
    credentialToken,
    message: "Save this device credential securely. It is shown only once.",
  }));
});

router.post("/mining/devices/:deviceId/heartbeat", async (req, res): Promise<void> => {
  const params = HeartbeatMiningDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const device = await authenticateDevice(req, params.data.deviceId);
  if (!device) {
    res.status(401).json({ error: "Device credential is invalid or revoked." });
    return;
  }
  const receivedAt = new Date();
  await db.update(miningDevicesTable)
    .set({ lastHeartbeat: receivedAt, status: "connected" })
    .where(eq(miningDevicesTable.id, device.id));
  res.json(HeartbeatMiningDeviceResponse.parse({ receivedAt: receivedAt.toISOString() }));
});

router.post("/mining/devices/:deviceId/telemetry", async (req, res): Promise<void> => {
  const params = ReportMiningTelemetryParams.safeParse(req.params);
  const parsed = ReportMiningTelemetryBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const device = await authenticateDevice(req, params.data.deviceId);
  if (!device) {
    res.status(401).json({ error: "Device credential is invalid or revoked." });
    return;
  }
  const recordedAt = new Date();
  if (device.lastHeartbeat && recordedAt.getTime() - device.lastHeartbeat.getTime() < 5_000) {
    res.status(429).json({ error: "Telemetry is arriving too frequently." });
    return;
  }

  const [statistic] = await db.insert(miningStatisticsTable).values({
    deviceId: device.id,
    hashrate: parsed.data.hashrate,
    acceptedShares: parsed.data.acceptedShares,
    rejectedShares: parsed.data.rejectedShares,
    uptime: parsed.data.uptime,
    source: "device_reported",
    recordedAt,
  }).returning();
  await db.update(miningDevicesTable)
    .set({ lastHeartbeat: recordedAt, status: "connected" })
    .where(eq(miningDevicesTable.id, device.id));
  res.status(201).json(ReportMiningTelemetryResponse.parse(mapStatistic(statistic)));
});

router.get("/mining/devices/:deviceId/statistics", requireActiveUser, async (req, res): Promise<void> => {
  const params = GetMiningDeviceStatisticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = res.locals.currentUser as { clerkUserId: string };
  const [device] = await db.select({ id: miningDevicesTable.id })
    .from(miningDevicesTable)
    .where(and(
      eq(miningDevicesTable.id, params.data.deviceId),
      eq(miningDevicesTable.userId, user.clerkUserId),
    ))
    .limit(1);
  if (!device) {
    res.status(404).json({ error: "Device was not found for this account." });
    return;
  }
  const rows = await db.select().from(miningStatisticsTable)
    .where(eq(miningStatisticsTable.deviceId, device.id))
    .orderBy(desc(miningStatisticsTable.recordedAt))
    .limit(100);
  res.json(GetMiningDeviceStatisticsResponse.parse(rows.map(mapStatistic).reverse()));
});

async function changeDeviceStatus(
  deviceId: number,
  userId: string,
  status: "disconnected" | "revoked",
) {
  const [device] = await db.update(miningDevicesTable)
    .set({ status, credentialHash: null })
    .where(and(
      eq(miningDevicesTable.id, deviceId),
      eq(miningDevicesTable.userId, userId),
    ))
    .returning({ id: miningDevicesTable.id });
  return Boolean(device);
}

router.post("/mining/devices/:deviceId/disconnect", requireActiveUser, async (req, res): Promise<void> => {
  const params = DisconnectMiningDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = res.locals.currentUser as { clerkUserId: string };
  const changed = await changeDeviceStatus(params.data.deviceId, user.clerkUserId, "disconnected");
  if (!changed) {
    res.status(404).json({ error: "Device was not found for this account." });
    return;
  }
  res.json(DisconnectMiningDeviceResponse.parse({ success: true, status: "disconnected" }));
});

router.post("/mining/devices/:deviceId/revoke", requireActiveUser, async (req, res): Promise<void> => {
  const params = RevokeMiningDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = res.locals.currentUser as { clerkUserId: string };
  const changed = await changeDeviceStatus(params.data.deviceId, user.clerkUserId, "revoked");
  if (!changed) {
    res.status(404).json({ error: "Device was not found for this account." });
    return;
  }
  res.json(RevokeMiningDeviceResponse.parse({ success: true, status: "revoked" }));
});

router.post("/mining/consent/revoke", requireActiveUser, async (_req, res): Promise<void> => {
  const user = res.locals.currentUser as { clerkUserId: string };
  const revokedAt = new Date();
  await Promise.all([
    db.update(miningConsentsTable)
      .set({ revokedAt })
      .where(and(
        eq(miningConsentsTable.userId, user.clerkUserId),
        isNull(miningConsentsTable.revokedAt),
      )),
    db.update(miningDevicesTable)
      .set({ status: "disconnected", credentialHash: null })
      .where(eq(miningDevicesTable.userId, user.clerkUserId)),
  ]);
  res.json(RevokeMiningConsentResponse.parse({ success: true, status: "consent_revoked" }));
});

router.get("/admin/mining/overview", requireActiveUser, requireAdmin, async (_req, res): Promise<void> => {
  const [devices, settings] = await Promise.all([
    db.select().from(miningDevicesTable).orderBy(desc(miningDevicesTable.createdAt)),
    getOrCreateSettings(),
  ]);
  const latestStats = await latestStatsFor(devices.map((device) => device.id));
  const mappedDevices = devices.map((device) => ({
    ...mapDevice(device, latestStats.get(device.id)),
    userId: device.userId,
  }));
  res.json(GetAdminMiningOverviewResponse.parse({
    totalDevices: devices.length,
    connectedDevices: mappedDevices.filter((device) => device.status === "connected").length,
    awaitingPoolVerification: devices.length,
    devices: mappedDevices,
    engine: engineStatus(settings),
  }));
});

router.patch("/admin/mining/engine", requireActiveUser, requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateAdminMiningEngineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = res.locals.currentUser as { clerkUserId: string };
  await db.insert(miningSettingsTable)
    .values({ id: 1 })
    .onConflictDoNothing();
  const [settings] = await db.update(miningSettingsTable)
    .set({ ...parsed.data, updatedBy: user.clerkUserId, updatedAt: new Date() })
    .where(eq(miningSettingsTable.id, 1))
    .returning();
  res.json(UpdateAdminMiningEngineResponse.parse(engineStatus(settings)));
});

router.post("/admin/mining/devices/:deviceId/suspend", requireActiveUser, requireAdmin, async (req, res): Promise<void> => {
  const params = SuspendAdminMiningDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [device] = await db.update(miningDevicesTable)
    .set({ status: "suspended", credentialHash: null })
    .where(eq(miningDevicesTable.id, params.data.deviceId))
    .returning({ id: miningDevicesTable.id });
  if (!device) {
    res.status(404).json({ error: "Device was not found." });
    return;
  }
  res.json(SuspendAdminMiningDeviceResponse.parse({ success: true, status: "suspended" }));
});

export default router;
