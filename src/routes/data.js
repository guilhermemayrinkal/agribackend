const express = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const { dataEntryLimiter } = require('../middleware/rateLimiter');
const { 
  validateDataEntry, 
  validateId, 
  validateChartId,
  validatePagination 
} = require('../middleware/validation');
const {
  getDataEntries,
  createDataEntry,
  createMultipleDataEntries,
  updateDataEntry,
  deleteDataEntry,
  getDataSummary,
  exportDataEntries
} = require('../controllers/dataController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/data/chart/:chartId
// @desc    Get data entries for a chart
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/chart/:chartId', validateChartId, validatePagination, getDataEntries);

// @route   GET /api/v1/data/chart/:chartId/summary
// @desc    Get data summary for chart
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/chart/:chartId/summary', validateChartId, getDataSummary);

// @route   GET /api/v1/data/chart/:chartId/export
// @desc    Export data entries
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/chart/:chartId/export', validateChartId, exportDataEntries);

// @route   POST /api/v1/data/chart/:chartId
// @desc    Create data entry
// @access  Private (Admin, Analyst)
router.post('/chart/:chartId', 
  authorize('admin', 'analyst'), 
  dataEntryLimiter, 
  validateChartId, 
  validateDataEntry, 
  createDataEntry
);

// @route   POST /api/v1/data/chart/:chartId/multiple
// @desc    Create multiple data entries
// @access  Private (Admin, Analyst)
router.post('/chart/:chartId/multiple', 
  authorize('admin', 'analyst'), 
  dataEntryLimiter, 
  validateChartId, 
  createMultipleDataEntries
);

// @route   PUT /api/v1/data/:id
// @desc    Update data entry
// @access  Private (Admin, Analyst - entry creator)
router.put('/:id', authorize('admin', 'analyst'), validateId, validateDataEntry, updateDataEntry);

// @route   DELETE /api/v1/data/:id
// @desc    Delete data entry
// @access  Private (Admin, Analyst - entry creator)
router.delete('/:id', authorize('admin', 'analyst'), validateId, deleteDataEntry);

module.exports = router;