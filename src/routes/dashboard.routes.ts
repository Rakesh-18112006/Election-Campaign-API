import { Router } from 'express';
import { authenticate, isMainAdmin } from '../middleware/auth';
import { getOverview, getCampaignStats, getAreaStats, getAuditLogs } from '../controllers/dashboard.controller';

const router = Router();

router.use(authenticate);
router.get('/overview', getOverview);
router.get('/campaigns/:id', getCampaignStats);
router.get('/areas/:id', getAreaStats);
router.get('/audit-logs', isMainAdmin, getAuditLogs);

export default router;
