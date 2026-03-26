import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import billingRouter from "./billing";
import organizationsRouter from "./organizations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(billingRouter);
router.use(organizationsRouter);

export default router;
