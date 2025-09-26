const express = require('express');
const { authenticateToken, authorize, authorizeCompanyAccess } = require('../middleware/auth');
const { checkSubscription, checkUsageLimit, checkFeatureAccess } = require('../middleware/subscriptionMiddleware');
const {
  validateChart,
  validateId,
  validateCompanyId,
  validatePagination
} = require('../middleware/validation');
const {
  getChartTemplates,
  getChartsByCompany,
  getChartById,
  createChart,
  updateChart,
  deleteChart,
  getChartData,
  getChartCategories
} = require('../controllers/chartController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/charts/templates
// @desc    Get chart templates
// @access  Private (All authenticated users)
router.get('/templates', getChartTemplates);

// @route   GET /api/v1/charts/categories
// @desc    Get chart categories
// @access  Private (All authenticated users)
router.get('/categories', getChartCategories);

// @route   GET /api/v1/charts/company/:companyId
// @desc    Get charts by company
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/company/:companyId', validateCompanyId, authorizeCompanyAccess, checkSubscription, getChartsByCompany);

// @route   GET /api/v1/charts/:id
// @desc    Get chart by ID
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/:id', validateId, checkSubscription, getChartById);

// @route   GET /api/v1/charts/:id/data
// @desc    Get chart data for visualization
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/:id/data', validateId, checkSubscription, getChartData);

// @route   POST /api/v1/charts
// @desc    Create new chart
// @access  Private (Admin, Analyst)
router.post('/', authorize('admin', 'analyst'), validateChart, createChart);

// @route   PUT /api/v1/charts/:id
// @desc    Update chart
// @access  Private (Admin, Analyst - chart creator)
router.put('/:id', authorize('admin', 'analyst'), validateId, updateChart);

// @route   DELETE /api/v1/charts/:id
// @desc    Delete chart
// @access  Private (Admin, Analyst - chart creator)
router.delete('/:id', authorize('admin', 'analyst'), validateId, deleteChart);

module.exports = router;