import { Router } from 'express';
import { authenticate, isManagerOrAbove } from '../middleware/auth';
import { listCampaigns, createCampaign, updateCampaign, getCampaignById } from '../controllers/campaigns.controller';

const router = Router();

router.use(authenticate);
router.get('/', listCampaigns);
router.get('/:id', getCampaignById);
router.post('/', isManagerOrAbove, createCampaign);
router.patch('/:id', isManagerOrAbove, updateCampaign);

export default router;
