const express = require('express');
const { authenticateToken, authorize, authorizeCompanyAccess } = require('../middleware/auth');
const { checkSubscription, checkUsageLimit, checkFeatureAccess } = require('../middleware/subscriptionMiddleware');

const {
  validateInventoryMovement,
  validateInventoryDestination,
  validateId,
  validateCompanyId,
  validatePagination
} = require('../middleware/validation');
const {
  // Stocks
  getStocksByCompany,
  getStockById,
  createStock,
  updateStock,
  deleteStock,
  syncStockWithReport,

  // Items
  getItemsByStock,
  getItemsByCompany,
  getItemById,

  // Destinations
  getDestinationsByCompany,
  createDestination,
  updateDestination,
  deleteDestination,

  // Movements
  getMovements,
  createMovement,
  getMovementHistory,

  // Summary
  getInventorySummary
} = require('../controllers/inventoryController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Stocks Routes
// @route   GET /api/v1/inventory/stocks/company/:companyId
// @desc    Get stocks by company
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/stocks/company/:companyId', validateCompanyId, authorizeCompanyAccess, checkSubscription, getStocksByCompany);

// @route   GET /api/v1/inventory/stocks/:id
// @desc    Get stock by ID
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/stocks/:id', validateId, getStockById);

// @route   POST /api/v1/inventory/stocks
// @desc    Create new stock
// @access  Private (Admin, Analyst)
router.post('/stocks', authorize('admin', 'analyst'), createStock);

// @route   PUT /api/v1/inventory/stocks/:id
// @desc    Update stock
// @access  Private (Admin, Analyst - stock creator)
router.put('/stocks/:id', authorize('admin', 'analyst'), validateId, updateStock);

// @route   DELETE /api/v1/inventory/stocks/:id
// @desc    Delete stock
// @access  Private (Admin, Analyst - stock creator)
router.delete('/stocks/:id', authorize('admin', 'analyst'), validateId, deleteStock);

// @route   POST /api/v1/inventory/stocks/:id/sync
// @desc    Sync stock with report data
// @access  Private (Admin, Analyst - stock creator)
router.post('/stocks/:id/sync', authorize('admin', 'analyst'), validateId, syncStockWithReport);

// Items Routes
// @route   GET /api/v1/inventory/items/stock/:stockId
// @desc    Get items by stock
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/items/stock/:stockId', getItemsByStock);

// @route   GET /api/v1/inventory/items/company/:companyId
// @desc    Get all items by company
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/items/company/:companyId', validateCompanyId, authorizeCompanyAccess, checkSubscription, getItemsByCompany);

// @route   GET /api/v1/inventory/items/:id
// @desc    Get item by ID
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/items/:id', validateId, getItemById);

// Destinations Routes
// @route   GET /api/v1/inventory/destinations/company/:companyId
// @desc    Get destinations by company
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/destinations/company/:companyId', validateCompanyId, authorizeCompanyAccess, getDestinationsByCompany);

// @route   POST /api/v1/inventory/destinations
// @desc    Create new destination
// @access  Private (Admin, Analyst, Client)
router.post('/destinations', validateInventoryDestination, createDestination);

// @route   PUT /api/v1/inventory/destinations/:id
// @desc    Update destination
// @access  Private (Admin, Analyst, Client - own company)
router.put('/destinations/:id', validateId, updateDestination);

// @route   DELETE /api/v1/inventory/destinations/:id
// @desc    Delete destination
// @access  Private (Admin, Analyst, Client - own company)
router.delete('/destinations/:id', validateId, deleteDestination);

// Movements Routes
// @route   GET /api/v1/inventory/movements
// @desc    Get movements (filtered by user role)
// @access  Private (All authenticated users)
router.get('/movements', validatePagination, checkSubscription, getMovements);

// @route   POST /api/v1/inventory/movements
// @desc    Create new movement
// @access  Private (Admin, Analyst, Client)
router.post('/movements', validateInventoryMovement, createMovement);

// @route   GET /api/v1/inventory/movements/item/:itemId
// @desc    Get movement history for item
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/movements/item/:itemId', validateId, getMovementHistory);

// Summary Routes
// @route   GET /api/v1/inventory/summary/company/:companyId
// @desc    Get inventory summary
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/summary/company/:companyId', validateCompanyId, authorizeCompanyAccess, getInventorySummary);

module.exports = router;