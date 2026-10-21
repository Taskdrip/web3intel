import { Router, type IRouter } from "express";
import { GetCurrentUserResponse } from "@workspace/api-zod";
import type { User } from "@workspace/db";
import { requireActiveUser } from "../middlewares/authorization";

const router: IRouter = Router();

router.get(
  "/auth/me",
  requireActiveUser,
  (req, res): void => {
    const user = res.locals.currentUser as User;
    res.json(
      GetCurrentUserResponse.parse({
        clerkUserId: user.clerkUserId,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      }),
    );
  },
);

export default router;
