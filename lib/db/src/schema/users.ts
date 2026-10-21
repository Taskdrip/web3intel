import { createInsertSchema } from "drizzle-zod";
import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const appUserRoleEnum = pgEnum("app_user_role", [
  "user",
  "admin",
  "investigator",
]);

export const appUserStatusEnum = pgEnum("app_user_status", [
  "active",
  "suspended",
]);

export const usersTable = pgTable("app_users", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  role: appUserRoleEnum("role").notNull().default("user"),
  status: appUserStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
