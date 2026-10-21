import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { z } from "zod/v4";

export const walletWatchesTable = pgTable(
  "wallet_watches",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id")
      .notNull()
      .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
    network: text("network").notNull(),
    address: text("address").notNull(),
    label: text("label").notNull(),
    alertsEnabled: boolean("alerts_enabled").notNull().default(true),
    lastCursor: text("last_cursor"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("wallet_watches_owner_network_address").on(
      table.clerkUserId,
      table.network,
      table.address,
    ),
    index("wallet_watches_network_cursor").on(table.network, table.lastCursor),
  ],
);

export const walletActivityTable = pgTable(
  "wallet_activity",
  {
    id: serial("id").primaryKey(),
    watchId: integer("watch_id")
      .notNull()
      .references(() => walletWatchesTable.id, { onDelete: "cascade" }),
    txHash: text("tx_hash").notNull(),
    eventKey: text("event_key").notNull(),
    activityType: text("activity_type").notNull(),
    direction: text("direction").notNull(),
    asset: text("asset").notNull(),
    amount: text("amount").notNull(),
    counterparty: text("counterparty"),
    blockNumber: text("block_number"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    explorerUrl: text("explorer_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("wallet_activity_watch_tx_event").on(
      table.watchId,
      table.txHash,
      table.eventKey,
    ),
    index("wallet_activity_watch_time").on(table.watchId, table.createdAt),
  ],
);

export const insertWalletWatchSchema = createInsertSchema(walletWatchesTable).omit({
  id: true,
  lastCursor: true,
  lastCheckedAt: true,
  createdAt: true,
});
export type InsertWalletWatch = z.infer<typeof insertWalletWatchSchema>;
export type WalletWatch = typeof walletWatchesTable.$inferSelect;
export type WalletActivity = typeof walletActivityTable.$inferSelect;
