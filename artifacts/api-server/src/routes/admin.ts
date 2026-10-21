import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateAdminWalletWatchBody,
  CreateAdminWalletWatchResponse,
  DeleteAdminActivityQueryParams,
  DeleteAdminWalletWatchQueryParams,
  GetAdminProviderStatusResponse,
  ListAdminActivityQueryParams,
  ListAdminActivityResponse,
  ListAdminUsersResponse,
  ListAdminWalletWatchesResponse,
  UpdateAdminWalletWatchBody,
  UpdateAdminWalletWatchQueryParams,
  UpdateAdminWalletWatchResponse,
  UpdateAdminUserBody,
  UpdateAdminUserParams,
  UpdateAdminUserResponse,
} from "@workspace/api-zod";
import {
  db,
  walletActivityTable,
  usersTable,
  walletWatchesTable,
  type User,
} from "@workspace/db";
import { requireActiveUser, requireAdmin } from "../middlewares/authorization";
import { isValidWatchAddress } from "./wallet-watch";

const router: IRouter = Router();
router.use(requireActiveUser, requireAdmin);

router.get("/admin/users", async (_req, res): Promise<void> => {
  const [users, watches] = await Promise.all([
    db.select().from(usersTable).orderBy(desc(usersTable.createdAt)),
    db.select({ clerkUserId: walletWatchesTable.clerkUserId }).from(walletWatchesTable),
  ]);
  const counts = new Map<string, number>();
  for (const row of watches) {
    counts.set(row.clerkUserId, (counts.get(row.clerkUserId) ?? 0) + 1);
  }
  res.json(ListAdminUsersResponse.parse(users.map((user) => ({
    clerkUserId: user.clerkUserId,
    role: user.role,
    status: user.status,
    trackedWalletCount: counts.get(user.clerkUserId) ?? 0,
    createdAt: user.createdAt,
  }))));
});

router.patch("/admin/users/:clerkUserId", async (req, res): Promise<void> => {
  const params = UpdateAdminUserParams.safeParse(req.params);
  const body = UpdateAdminUserBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message ?? "Invalid account update." });
    return;
  }
  const current = res.locals.currentUser as User;
  if (params.data.clerkUserId === current.clerkUserId) {
    res.status(400).json({ error: "Administrators cannot change their own role or account status here." });
    return;
  }
  const [updated] = await db.update(usersTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(usersTable.clerkUserId, params.data.clerkUserId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Account was not found." });
    return;
  }
  const watches = await db.select({ id: walletWatchesTable.id })
    .from(walletWatchesTable)
    .where(eq(walletWatchesTable.clerkUserId, updated.clerkUserId));
  res.json(UpdateAdminUserResponse.parse({
    clerkUserId: updated.clerkUserId,
    role: updated.role,
    status: updated.status,
    trackedWalletCount: watches.length,
    createdAt: updated.createdAt,
  }));
});

router.get("/admin/wallets", async (_req, res): Promise<void> => {
  const watches = await db.select().from(walletWatchesTable)
    .orderBy(desc(walletWatchesTable.createdAt));
  res.json(ListAdminWalletWatchesResponse.parse(watches));
});

router.post("/admin/wallets", async (req, res): Promise<void> => {
  const parsed = CreateAdminWalletWatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const address = input.network === "solana" ? input.address.trim() : input.address.trim().toLowerCase();
  const label = input.label.trim();
  if (!label || !isValidWatchAddress(input.network, address)) {
    res.status(400).json({ error: "Provide a valid label and an address for the selected network." });
    return;
  }
  const [owner] = await db.select({
    clerkUserId: usersTable.clerkUserId,
    status: usersTable.status,
  }).from(usersTable)
    .where(eq(usersTable.clerkUserId, input.clerkUserId))
    .limit(1);
  if (!owner) {
    res.status(400).json({ error: "The selected account does not exist." });
    return;
  }
  if (owner.status !== "active") {
    res.status(400).json({ error: "Wallet watches cannot be added to a suspended account." });
    return;
  }
  try {
    const [watch] = await db.insert(walletWatchesTable).values({
      clerkUserId: owner.clerkUserId,
      network: input.network,
      address,
      label,
      alertsEnabled: input.alertsEnabled,
    }).returning();
    res.status(201).json(CreateAdminWalletWatchResponse.parse(watch));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "This address is already watched by that account on this network." });
      return;
    }
    req.log.error({ err: error }, "Could not create admin wallet watch");
    res.status(503).json({ error: "The wallet watch could not be saved." });
  }
});

router.patch("/admin/wallets", async (req, res): Promise<void> => {
  const query = UpdateAdminWalletWatchQueryParams.safeParse(req.query);
  const body = UpdateAdminWalletWatchBody.safeParse(req.body);
  if (!query.success || !body.success) {
    res.status(400).json({ error: query.error?.message ?? body.error?.message ?? "Invalid wallet watch update." });
    return;
  }
  const update = { ...body.data };
  if (update.label !== undefined) {
    update.label = update.label.trim();
    if (!update.label) {
      res.status(400).json({ error: "The wallet label cannot be empty." });
      return;
    }
  }
  const [watch] = await db.update(walletWatchesTable)
    .set(update)
    .where(eq(walletWatchesTable.id, query.data.watchId))
    .returning();
  if (!watch) {
    res.status(404).json({ error: "Wallet watch was not found." });
    return;
  }
  res.json(UpdateAdminWalletWatchResponse.parse(watch));
});

router.get("/admin/providers", async (_req, res): Promise<void> => {
  const status = [
    {
      provider: "PostgreSQL database",
      configured: Boolean(process.env.DATABASE_URL),
      secretValuesVisible: false,
    },
    {
      provider: "Clerk authentication",
      configured: Boolean(process.env.CLERK_SECRET_KEY),
      secretValuesVisible: false,
    },
    {
      provider: "Groq AI research",
      configured: Boolean(process.env.GROQ_API_KEY),
      secretValuesVisible: false,
    },
    {
      provider: "Public blockchain RPC",
      configured: true,
      secretValuesVisible: false,
    },
  ];
  res.json(GetAdminProviderStatusResponse.parse(status));
});

router.get("/admin/activity", async (req, res): Promise<void> => {
  const query = ListAdminActivityQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const activity = await db.select({
    id: walletActivityTable.id,
    watchId: walletActivityTable.watchId,
    network: walletWatchesTable.network,
    address: walletWatchesTable.address,
    label: walletWatchesTable.label,
    clerkUserId: walletWatchesTable.clerkUserId,
    txHash: walletActivityTable.txHash,
    activityType: walletActivityTable.activityType,
    direction: walletActivityTable.direction,
    asset: walletActivityTable.asset,
    amount: walletActivityTable.amount,
    counterparty: walletActivityTable.counterparty,
    blockNumber: walletActivityTable.blockNumber,
    occurredAt: walletActivityTable.occurredAt,
    explorerUrl: walletActivityTable.explorerUrl,
    createdAt: walletActivityTable.createdAt,
  }).from(walletActivityTable)
    .innerJoin(walletWatchesTable, eq(walletActivityTable.watchId, walletWatchesTable.id))
    .orderBy(desc(walletActivityTable.createdAt))
    .limit(query.data.limit);
  res.json(ListAdminActivityResponse.parse(activity));
});

router.delete("/admin/activity", async (req, res): Promise<void> => {
  const query = DeleteAdminActivityQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const deleted = await db.delete(walletActivityTable)
    .where(eq(walletActivityTable.id, query.data.activityId))
    .returning({ id: walletActivityTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Saved activity observation was not found." });
    return;
  }
  res.status(204).end();
});

router.delete("/admin/wallets", async (req, res): Promise<void> => {
  const query = DeleteAdminWalletWatchQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const deleted = await db.delete(walletWatchesTable)
    .where(and(eq(walletWatchesTable.id, query.data.watchId)))
    .returning({ id: walletWatchesTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Wallet watch was not found." });
    return;
  }
  res.status(204).end();
});

export default router;
