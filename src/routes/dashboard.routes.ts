import { Router } from 'express';
import { authenticate, isMainAdmin, isManagerOrAbove } from '../middleware/auth';
import { getOverview, getCampaignStats, getAreaStats, getAuditLogs } from '../controllers/dashboard.controller';

const router = Router();

router.use(authenticate);
router.get('/overview', getOverview);
router.get('/campaigns/:id', isManagerOrAbove, getCampaignStats);
router.get('/areas/:id', isManagerOrAbove, getAreaStats);
router.get('/audit-logs', isMainAdmin, getAuditLogs);

export default router;
