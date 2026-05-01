import { Router, type Request, type Response } from "express";
import { resolveFullOrg } from "../lib/resolveOrg";
import { requireOperationsTier } from "../lib/operationsTier";
import { buildBoardMonthlyReport } from "../lib/boardReport";

const router = Router();

router.get("/board-monthly", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;
  if (!requireOperationsTier(org, res)) return;

  res.json(await buildBoardMonthlyReport(org));
});

export default router;
