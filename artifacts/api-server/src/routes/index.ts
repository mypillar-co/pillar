import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import billingRouter from "./billing";
import organizationsRouter from "./organizations";
import eventsRouter from "./events";
import vendorsRouter from "./vendors";
import sponsorsRouter from "./sponsors";
import contactsRouter from "./contacts";
import statsRouter from "./stats";
import sitesRouter from "./sites";
import domainsRouter from "./domains";
import socialRouter from "./social";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(billingRouter);
router.use(organizationsRouter);
router.use("/events", eventsRouter);
router.use("/vendors", vendorsRouter);
router.use("/sponsors", sponsorsRouter);
router.use("/contacts", contactsRouter);
router.use("/stats", statsRouter);
router.use("/sites", sitesRouter);
router.use("/domains", domainsRouter);
router.use("/social", socialRouter);

export default router;
