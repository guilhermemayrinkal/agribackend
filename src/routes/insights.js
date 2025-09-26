const express = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const { 
  validateInsight, 
  validateId,
  validatePagination 
} = require('../middleware/validation');
const {
  getInsights,
  getInsightById,
  createInsight,
  updateInsight,
  markAsRead,
  deleteInsight,
  getInsightsSummary,
  generateInsights
} = require('../controllers/insightController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/insights
// @desc    Get insights (filtered by user role)
// @access  Private (All authenticated users)
router.get('/', validatePagination, getInsights);

// @route   GET /api/v1/insights/summary
// @desc    Get insights summary
// @access  Private (All authenticated users)
router.get('/summary', getInsightsSummary);

// @route   GET /api/v1/insights/:id
// @desc    Get insight by ID
// @access  Private (All authenticated users)
router.get('/:id', validateId, getInsightById);

// @route   POST /api/v1/insights
// @desc    Create new insight
// @access  Private (Admin, Analyst)
router.post('/', authorize('admin', 'analyst'), validateInsight, createInsight);

// @route   POST /api/v1/insights/generate
// @desc    Generate automatic insights
// @access  Private (Admin, Analyst)
router.post('/generate', authorize('admin', 'analyst'), generateInsights);

// @route   PUT /api/v1/insights/:id
// @desc    Update insight
// @access  Private (Admin, Analyst - insight creator)
router.put('/:id', authorize('admin', 'analyst'), validateId, updateInsight);

// @route   PUT /api/v1/insights/:id/read
// @desc    Mark insight as read
// @access  Private (All authenticated users)
router.put('/:id/read', validateId, markAsRead);

// @route   DELETE /api/v1/insights/:id
// @desc    Delete insight
// @access  Private (Admin, Analyst - insight creator)
router.delete('/:id', authorize('admin', 'analyst'), validateId, deleteInsight);

module.exports = router;