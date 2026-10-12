import { Router } from 'express';
import { authenticate, isMainAdmin } from '../middleware/auth';
import { listParties, createParty, getPartyById, togglePartyStatus } from '../controllers/parties.controller';

const router = Router();

router.use(authenticate, isMainAdmin);

router.get('/', listParties);
router.post('/', createParty);
router.get('/:id', getPartyById);
router.post('/:id/toggle-status', togglePartyStatus);

export default router;
