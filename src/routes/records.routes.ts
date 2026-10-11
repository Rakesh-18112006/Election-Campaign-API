import { Router } from 'express';
import multer from 'multer';
import { authenticate, isManagerOrAbove } from '../middleware/auth';
import {
  listRecords,
  getRecordById,
  createRecord,
  importRecords,
  assignRecord,
  bulkAssignRecords,
} from '../controllers/records.controller';
import { submitVisit, getVisitHistory } from '../controllers/visits.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);
router.get('/', listRecords);
router.get('/:id', getRecordById);
router.post('/', isManagerOrAbove, createRecord);
router.post('/import', isManagerOrAbove, upload.single('file'), importRecords);
router.post('/bulk-assign', isManagerOrAbove, bulkAssignRecords);
router.post('/:id/assignments', isManagerOrAbove, assignRecord);
router.post('/:id/visits', submitVisit);
router.get('/:id/visits', getVisitHistory);

export default router;
