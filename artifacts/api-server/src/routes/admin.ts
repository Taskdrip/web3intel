import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  DeleteAdminActivityQueryParams,
  ListAdminActivityQueryParams,
  ListAdminActivityResponse,
  ListAdminUsersResponse,
  ListAdminWalletWatchesResponse,
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
  const watchId = Number(req.query.watchId);
  if (!Number.isSafeInteger(watchId) || watchId < 1) {
    res.status(400).json({ error: "A valid wallet watch ID is required." });
    return;
  }
  const deleted = await db.delete(walletWatchesTable)
    .where(and(eq(walletWatchesTable.id, watchId)))
    .returning({ id: walletWatchesTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Wallet watch was not found." });
    return;
  }
  res.status(204).end();
});

export default router;
