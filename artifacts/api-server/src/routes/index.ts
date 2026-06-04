import { Router, type IRouter } from "express";
import healthRouter from "./health";
import artifactsRouter from "./artifacts";
import activityRouter from "./activity";
import todayRouter from "./today";
import leadsRouter from "./leads";
import conversationsRouter from "./conversations";
import settingsRouter from "./settings";
import settingsExtendedRouter from "./settings-extended";
import runsRouter from "./runs";
import agentsRouter from "./agents";
import notificationsRouter from "./notifications";
import welcomeRouter from "./welcome";

const router: IRouter = Router();

router.use(healthRouter);
router.use(artifactsRouter);
router.use(activityRouter);
router.use(todayRouter);
router.use(leadsRouter);
router.use(conversationsRouter);
router.use(settingsRouter);
router.use(settingsExtendedRouter);
router.use(runsRouter);
router.use(agentsRouter);
router.use(notificationsRouter);
router.use(welcomeRouter);

export default router;
