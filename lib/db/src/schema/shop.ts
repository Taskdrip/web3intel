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

export const shopProductsTable = pgTable(
  "shop_products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    saleType: text("sale_type").notNull(),
    fulfillment: text("fulfillment").notNull(),
    summary: text("summary").notNull(),
    description: text("description").notNull(),
    specs: text("specs").notNull().default(""),
    imageUrl: text("image_url"),
    priceCents: integer("price_cents"),
    priceCurrency: text("price_currency").notNull().default("USD"),
    affiliateUrl: text("affiliate_url"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("shop_products_slug_unique").on(table.slug),
    index("shop_products_status_category").on(table.status, table.category),
  ],
);

export const shopOrdersTable = pgTable(
  "shop_orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    clerkUserId: text("clerk_user_id")
      .notNull()
      .references(() => usersTable.clerkUserId, { onDelete: "restrict" }),
    productId: integer("product_id")
      .notNull()
      .references(() => shopProductsTable.id, { onDelete: "restrict" }),
    productTitle: text("product_title").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    currency: text("currency").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    shippingAddress: text("shipping_address").notNull(),
    shippingCity: text("shipping_city").notNull(),
    shippingRegion: text("shipping_region").notNull().default(""),
    shippingPostalCode: text("shipping_postal_code").notNull().default(""),
    shippingCountry: text("shipping_country").notNull(),
    paymentReference: text("payment_reference"),
    status: text("status").notNull().default("awaiting_payment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("shop_orders_number_unique").on(table.orderNumber),
    index("shop_orders_owner_created").on(table.clerkUserId, table.createdAt),
    index("shop_orders_status_created").on(table.status, table.createdAt),
  ],
);

export const shopPaymentSettingsTable = pgTable("shop_payment_settings", {
  id: integer("id").primaryKey().default(1),
  asset: text("asset").notNull().default("BTC"),
  network: text("network").notNull().default("Bitcoin"),
  receivingAddress: text("receiving_address").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertShopProductSchema = createInsertSchema(shopProductsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShopProduct = z.infer<typeof insertShopProductSchema>;
export type ShopProduct = typeof shopProductsTable.$inferSelect;
export type ShopOrder = typeof shopOrdersTable.$inferSelect;
export type ShopPaymentSettings = typeof shopPaymentSettingsTable.$inferSelect;
