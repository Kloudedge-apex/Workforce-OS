import { Router, type IRouter } from "express";
import healthRouter from "./health";
import artifactsRouter from "./artifacts";
import activityRouter from "./activity";
import todayRouter from "./today";
import leadsRouter from "./leads";
import conversationsRouter from "./conversations";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(artifactsRouter);
router.use(activityRouter);
router.use(todayRouter);
router.use(leadsRouter);
router.use(conversationsRouter);
router.use(settingsRouter);

export default router;
