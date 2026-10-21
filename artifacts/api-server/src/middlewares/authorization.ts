import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

export const requireActiveUser: RequestHandler = async (
  req,
  res,
  next,
): Promise<void> => {
  const userId = res.locals.walletUserId as string | undefined ?? getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  try {
    const [created] = await db
      .insert(usersTable)
      .values({ clerkUserId: userId })
      .onConflictDoNothing()
      .returning();
    const [user] = created
      ? [created]
      : await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.clerkUserId, userId))
          .limit(1);

    if (!user) {
      req.log.error({ clerkUserId: userId }, "Could not provision local user");
      res.status(503).json({ error: "Your account could not be loaded." });
      return;
    }

    if (user.status !== "active") {
      res.status(403).json({ error: "This account is not active." });
      return;
    }

    res.locals.currentUser = user;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Could not load authenticated user");
    res.status(503).json({ error: "Your account could not be loaded." });
  }
};

export const requireAdmin: RequestHandler = (req, res, next): void => {
  const currentUser = res.locals.currentUser as User | undefined;
  if (!currentUser) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  if (currentUser.role !== "admin") {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }
  next();
};
