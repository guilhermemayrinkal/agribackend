const express = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const { 
  validateAlert, 
  validateId,
  validatePagination 
} = require('../middleware/validation');
const {
  getAlerts,
  getAlertById,
  createAlert,
  updateAlert,
  markAsRead,
  markMultipleAsRead,
  deleteAlert,
  getUnreadCount,
  getAlertsSummary
} = require('../controllers/alertController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/alerts
// @desc    Get alerts (filtered by user role)
// @access  Private (All authenticated users)
router.get('/', validatePagination, getAlerts);

// @route   GET /api/v1/alerts/unread-count
// @desc    Get unread alerts count
// @access  Private (All authenticated users)
router.get('/unread-count', getUnreadCount);

// @route   GET /api/v1/alerts/summary
// @desc    Get alerts summary
// @access  Private (All authenticated users)
router.get('/summary', getAlertsSummary);

// @route   GET /api/v1/alerts/:id
// @desc    Get alert by ID
// @access  Private (All authenticated users)
router.get('/:id', validateId, getAlertById);

// @route   POST /api/v1/alerts
// @desc    Create new alert
// @access  Private (Admin, Analyst)
router.post('/', authorize('admin', 'analyst'), validateAlert, createAlert);

// @route   PUT /api/v1/alerts/:id
// @desc    Update alert
// @access  Private (Admin, Analyst)
router.put('/:id', authorize('admin', 'analyst'), validateId, updateAlert);

// @route   PUT /api/v1/alerts/:id/read
// @desc    Mark alert as read
// @access  Private (All authenticated users)
router.put('/:id/read', validateId, markAsRead);

// @route   PUT /api/v1/alerts/read-multiple
// @desc    Mark multiple alerts as read
// @access  Private (All authenticated users)
router.put('/read-multiple', markMultipleAsRead);

// @route   DELETE /api/v1/alerts/:id
// @desc    Delete alert
// @access  Private (Admin, Analyst)
router.delete('/:id', authorize('admin', 'analyst'), validateId, deleteAlert);

module.exports = router;