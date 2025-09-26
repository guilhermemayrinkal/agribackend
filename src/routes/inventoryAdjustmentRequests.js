const express = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const {
  validateAdjustmentRequest,
  validateId,
  validatePagination
} = require('../middleware/validation');
const {
  getAdjustmentRequests,
  getAdjustmentRequestById,
  createAdjustmentRequest,
  approveAdjustmentRequest,
  rejectAdjustmentRequest,
  getRequestsByCompany,
  getRequestsSummary
} = require('../controllers/inventoryAdjustmentController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/inventory-adjustments
// @desc    Get adjustment requests (filtered by user role)
// @access  Private (All authenticated users)
router.get('/', validatePagination, getAdjustmentRequests);

// @route   GET /api/v1/inventory-adjustments/company/:companyId
// @desc    Get adjustment requests by company
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/company/:companyId', validatePagination, getRequestsByCompany);

// @route   GET /api/v1/inventory-adjustments/summary
// @desc    Get adjustment requests summary
// @access  Private (All authenticated users)
router.get('/summary', getRequestsSummary);

// @route   GET /api/v1/inventory-adjustments/:id
// @desc    Get adjustment request by ID
// @access  Private (All authenticated users)
router.get('/:id', validateId, getAdjustmentRequestById);

// @route   POST /api/v1/inventory-adjustments
// @desc    Create new adjustment request
// @access  Private (Company users only)
router.post('/', validateAdjustmentRequest, createAdjustmentRequest);

// @route   PUT /api/v1/inventory-adjustments/:id/approve
// @desc    Approve adjustment request
// @access  Private (Admin, Analyst, Client - company owner)
router.put('/:id/approve', validateId, approveAdjustmentRequest);

// @route   PUT /api/v1/inventory-adjustments/:id/reject
// @desc    Reject adjustment request
// @access  Private (Admin, Analyst, Client - company owner)
router.put('/:id/reject', validateId, rejectAdjustmentRequest);

module.exports = router;