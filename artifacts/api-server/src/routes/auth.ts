import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
} from "@workspace/api-zod";
import {
  clearSession,
  getSessionId,
} from "../lib/auth";

const router: IRouter = Router();

router.get("/auth/user", (req: Request, res: Response) => {
  let user: unknown = null;
  if (req.isAuthenticated() && req.user) {
    const u = req.user as Record<string, unknown>;
    user = {
      id: u.id,
      email: u.email ?? null,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      profileImageUrl: u.profileImageUrl ?? null,
    };
  }
  res.json(GetCurrentAuthUserResponse.parse({ user }));
});

router.get("/login", (_req: Request, res: Response) => {
  res.redirect("/login");
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect("/");
});

export default router;
