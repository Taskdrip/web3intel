import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateAdminShopProductBody,
  CreateAdminShopProductResponse,
  CreateShopOrderBody,
  CreateShopOrderResponse,
  GetAdminShopPaymentSettingsResponse,
  GetShopPaymentInstructionsResponse,
  GetShopProductParams,
  GetShopProductResponse,
  ListAdminShopOrdersResponse,
  ListAdminShopProductsResponse,
  ListMyShopOrdersResponse,
  ListShopProductsResponse,
  SubmitShopPaymentReferenceBody,
  SubmitShopPaymentReferenceParams,
  SubmitShopPaymentReferenceResponse,
  UpdateAdminShopOrderBody,
  UpdateAdminShopOrderParams,
  UpdateAdminShopOrderResponse,
  UpdateAdminShopPaymentSettingsBody,
  UpdateAdminShopPaymentSettingsResponse,
  UpdateAdminShopProductBody,
  UpdateAdminShopProductParams,
  UpdateAdminShopProductResponse,
} from "@workspace/api-zod";
import {
  db,
  shopOrdersTable,
  shopPaymentSettingsTable,
  shopProductsTable,
  type User,
} from "@workspace/db";
import { requireActiveUser, requireAdmin } from "../middlewares/authorization";
import { ensureStarterShopCatalog } from "../lib/shop-catalog";

const router: IRouter = Router();

async function getOrCreatePaymentSettings() {
  await db.insert(shopPaymentSettingsTable)
    .values({ id: 1 })
    .onConflictDoNothing();
  const [settings] = await db.select().from(shopPaymentSettingsTable)
    .where(eq(shopPaymentSettingsTable.id, 1))
    .limit(1);
  return settings;
}

function slugify(value: string): string {
  return value.toLowerCase().trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function validateProductLinks(input: {
  saleType?: string;
  affiliateUrl?: string | null;
}): string | null {
  if (input.saleType === "affiliate" && !input.affiliateUrl) {
    return "Affiliate products need a valid affiliate URL.";
  }
  if (input.saleType === "direct" && input.affiliateUrl) {
    return "Direct-sale products cannot include an affiliate URL.";
  }
  return null;
}

router.get("/shop/products", async (_req, res): Promise<void> => {
  await ensureStarterShopCatalog();
  const products = await db.select().from(shopProductsTable)
    .where(eq(shopProductsTable.status, "active"))
    .orderBy(shopProductsTable.category, shopProductsTable.title);
  res.json(ListShopProductsResponse.parse(products));
});

router.get("/shop/products/:slug", async (req, res): Promise<void> => {
  const params = GetShopProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [product] = await db.select().from(shopProductsTable)
    .where(and(
      eq(shopProductsTable.slug, params.data.slug),
      eq(shopProductsTable.status, "active"),
    ))
    .limit(1);
  if (!product) {
    res.status(404).json({ error: "Product was not found." });
    return;
  }
  res.json(GetShopProductResponse.parse(product));
});

router.get("/shop/payment-instructions", async (_req, res): Promise<void> => {
  const settings = await getOrCreatePaymentSettings();
  res.json(GetShopPaymentInstructionsResponse.parse({
    configured: Boolean(settings?.receivingAddress),
    asset: settings?.asset ?? "BTC",
    network: settings?.network ?? "Bitcoin",
    receivingAddress: settings?.receivingAddress ?? "",
    instructions: settings?.instructions ?? "",
  }));
});

router.get("/shop/orders", requireActiveUser, async (_req, res): Promise<void> => {
  const user = res.locals.currentUser as User;
  const orders = await db.select().from(shopOrdersTable)
    .where(eq(shopOrdersTable.clerkUserId, user.clerkUserId))
    .orderBy(desc(shopOrdersTable.createdAt));
  res.json(ListMyShopOrdersResponse.parse(orders));
});

router.post("/shop/orders", requireActiveUser, async (req, res): Promise<void> => {
  const parsed = CreateShopOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = res.locals.currentUser as User;
  const input = parsed.data;
  const [product] = await db.select().from(shopProductsTable)
    .where(and(
      eq(shopProductsTable.id, input.productId),
      eq(shopProductsTable.status, "active"),
    ))
    .limit(1);
  if (!product || product.saleType !== "direct") {
    res.status(404).json({ error: "This direct-sale product is not available." });
    return;
  }
  if (product.priceCents === null || product.priceCents < 1) {
    res.status(400).json({ error: "This product is not available for checkout yet. Contact the seller for a confirmed price." });
    return;
  }
  const settings = await getOrCreatePaymentSettings();
  if (!settings?.receivingAddress) {
    res.status(503).json({ error: "Manual crypto checkout is not configured yet." });
    return;
  }
  const [order] = await db.insert(shopOrdersTable).values({
    orderNumber: `WI-${randomBytes(6).toString("hex").toUpperCase()}`,
    clerkUserId: user.clerkUserId,
    productId: product.id,
    productTitle: product.title,
    quantity: input.quantity,
    unitPriceCents: product.priceCents,
    currency: product.priceCurrency,
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim().toLowerCase(),
    shippingAddress: input.shippingAddress?.trim() ?? "",
    shippingCity: input.shippingCity?.trim() ?? "",
    shippingRegion: input.shippingRegion?.trim() ?? "",
    shippingPostalCode: input.shippingPostalCode?.trim() ?? "",
    shippingCountry: input.shippingCountry?.trim() ?? "",
    status: "awaiting_payment",
  }).returning();
  res.status(201).json(CreateShopOrderResponse.parse(order));
});

router.patch("/shop/orders/:id/payment", requireActiveUser, async (req, res): Promise<void> => {
  const params = SubmitShopPaymentReferenceParams.safeParse(req.params);
  const body = SubmitShopPaymentReferenceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message ?? "Invalid payment reference." });
    return;
  }
  const user = res.locals.currentUser as User;
  const [order] = await db.update(shopOrdersTable)
    .set({
      paymentReference: body.data.paymentReference.trim(),
      status: "payment_submitted",
      updatedAt: new Date(),
    })
    .where(and(
      eq(shopOrdersTable.id, params.data.id),
      eq(shopOrdersTable.clerkUserId, user.clerkUserId),
      eq(shopOrdersTable.status, "awaiting_payment"),
    ))
    .returning();
  if (!order) {
    res.status(404).json({ error: "An unpaid order for this account was not found." });
    return;
  }
  res.json(SubmitShopPaymentReferenceResponse.parse(order));
});

router.get("/admin/shop/products", requireActiveUser, requireAdmin, async (_req, res): Promise<void> => {
  await ensureStarterShopCatalog();
  const products = await db.select().from(shopProductsTable)
    .orderBy(shopProductsTable.category, shopProductsTable.title);
  res.json(ListAdminShopProductsResponse.parse(products));
});

router.post("/admin/shop/products", requireActiveUser, requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminShopProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const linkError = validateProductLinks(parsed.data);
  if (linkError) {
    res.status(400).json({ error: linkError });
    return;
  }
  const product = parsed.data;
  const slug = slugify(product.title);
  try {
    const [created] = await db.insert(shopProductsTable).values({
      ...product,
      slug,
      specs: product.specs ?? "",
      priceCents: product.priceCents ?? null,
      affiliateUrl: product.affiliateUrl ?? null,
    }).returning();
    res.status(201).json(CreateAdminShopProductResponse.parse(created));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "A product with this title already exists." });
      return;
    }
    req.log.error({ err: error }, "Could not create shop product");
    res.status(503).json({ error: "The product could not be saved." });
  }
});

router.patch("/admin/shop/products/:id", requireActiveUser, requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminShopProductParams.safeParse(req.params);
  const body = UpdateAdminShopProductBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message ?? "Invalid product update." });
    return;
  }
  const linkError = validateProductLinks(body.data);
  if (linkError) {
    res.status(400).json({ error: linkError });
    return;
  }
  const [updated] = await db.update(shopProductsTable).set({
    ...body.data,
    specs: body.data.specs ?? "",
    priceCents: body.data.priceCents ?? null,
    affiliateUrl: body.data.affiliateUrl ?? null,
    updatedAt: new Date(),
  }).where(eq(shopProductsTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Product was not found." });
    return;
  }
  res.json(UpdateAdminShopProductResponse.parse(updated));
});

router.get("/admin/shop/orders", requireActiveUser, requireAdmin, async (_req, res): Promise<void> => {
  const orders = await db.select().from(shopOrdersTable)
    .orderBy(desc(shopOrdersTable.createdAt));
  res.json(ListAdminShopOrdersResponse.parse(orders));
});

const allowedOrderTransitions: Record<string, string[]> = {
  awaiting_payment: ["paid", "cancelled"],
  payment_submitted: ["paid", "cancelled"],
  paid: ["processing"],
  processing: ["fulfilled"],
  fulfilled: [],
  cancelled: [],
};

router.patch("/admin/shop/orders/:id", requireActiveUser, requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminShopOrderParams.safeParse(req.params);
  const body = UpdateAdminShopOrderBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message ?? "Invalid order update." });
    return;
  }
  const [current] = await db.select().from(shopOrdersTable)
    .where(eq(shopOrdersTable.id, params.data.id))
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "Order was not found." });
    return;
  }
  if (!allowedOrderTransitions[current.status]?.includes(body.data.status)) {
    res.status(400).json({ error: `Cannot change an order from ${current.status} to ${body.data.status}.` });
    return;
  }
  const [updated] = await db.update(shopOrdersTable)
    .set({ status: body.data.status, updatedAt: new Date() })
    .where(eq(shopOrdersTable.id, params.data.id))
    .returning();
  res.json(UpdateAdminShopOrderResponse.parse(updated));
});

router.get("/admin/shop/payment-settings", requireActiveUser, requireAdmin, async (_req, res): Promise<void> => {
  const settings = await getOrCreatePaymentSettings();
  res.json(GetAdminShopPaymentSettingsResponse.parse(settings));
});

router.put("/admin/shop/payment-settings", requireActiveUser, requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateAdminShopPaymentSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [settings] = await db.insert(shopPaymentSettingsTable)
    .values({
      id: 1,
      ...parsed.data,
      receivingAddress: parsed.data.receivingAddress.trim(),
      instructions: parsed.data.instructions?.trim() ?? "",
    })
    .onConflictDoUpdate({
      target: shopPaymentSettingsTable.id,
      set: {
        ...parsed.data,
        receivingAddress: parsed.data.receivingAddress.trim(),
        instructions: parsed.data.instructions?.trim() ?? "",
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json(UpdateAdminShopPaymentSettingsResponse.parse(settings));
});

export default router;
