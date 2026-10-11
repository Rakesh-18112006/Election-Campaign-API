import { Router } from 'express';
import { authenticate, isManagerOrAbove } from '../middleware/auth';
import { listAreas, createArea, updateArea, getAreaById } from '../controllers/areas.controller';

const router = Router();

router.use(authenticate);
router.get('/', listAreas);
router.get('/:id', getAreaById);
router.post('/', isManagerOrAbove, createArea);
router.patch('/:id', isManagerOrAbove, updateArea);

export default router;
