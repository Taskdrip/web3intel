import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const miningConfigurationsTable = pgTable("mining_configurations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  deviceId: integer("device_id"),
  coin: text("coin").notNull().default("monero"),
  algorithm: text("algorithm").notNull().default("RandomX"),
  connectionMethod: text("connection_method").notNull(),
  poolHost: text("pool_host").notNull(),
  poolPort: integer("pool_port").notNull(),
  tlsEnabled: boolean("tls_enabled").notNull().default(false),
  walletAddress: text("wallet_address").notNull(),
  cpuThreadLimit: integer("cpu_thread_limit").notNull(),
  profile: text("profile").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const miningDevicesTable = pgTable("mining_devices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  operatingSystem: text("operating_system").notNull(),
  cpuModel: text("cpu_model"),
  workerId: text("worker_id").notNull().unique(),
  credentialHash: text("credential_hash"),
  status: text("status").notNull().default("offline"),
  algorithm: text("algorithm").notNull().default("RandomX"),
  pairedAt: timestamp("paired_at", { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const miningPairingCodesTable = pgTable("mining_pairing_codes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  configurationId: integer("configuration_id").notNull().references(() => miningConfigurationsTable.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  operatingSystem: text("operating_system").notNull(),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const miningStatisticsTable = pgTable("mining_statistics", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => miningDevicesTable.id, { onDelete: "cascade" }),
  hashrate: doublePrecision("hashrate").notNull(),
  acceptedShares: integer("accepted_shares").notNull(),
  rejectedShares: integer("rejected_shares").notNull(),
  uptime: integer("uptime").notNull(),
  source: text("source").notNull().default("device_reported"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const miningConsentsTable = pgTable("mining_consents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  consentVersion: text("consent_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  deviceId: integer("device_id").references(() => miningDevicesTable.id, { onDelete: "set null" }),
});

export const miningSettingsTable = pgTable("mining_settings", {
  id: integer("id").primaryKey().default(1),
  engineEnabled: boolean("engine_enabled").notNull().default(true),
  moneroEnabled: boolean("monero_enabled").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMiningConfigurationSchema = createInsertSchema(miningConfigurationsTable).omit({
  id: true,
  deviceId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMiningConfiguration = typeof miningConfigurationsTable.$inferInsert;
export type MiningConfiguration = typeof miningConfigurationsTable.$inferSelect;
export type MiningDevice = typeof miningDevicesTable.$inferSelect;
export type MiningPairingCode = typeof miningPairingCodesTable.$inferSelect;
export type MiningStatistic = typeof miningStatisticsTable.$inferSelect;
export type MiningConsent = typeof miningConsentsTable.$inferSelect;
export type MiningSettings = typeof miningSettingsTable.$inferSelect;
