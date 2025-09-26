const express = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const { checkSubscription, checkUsageLimit } = require('../middleware/subscriptionMiddleware');
const {
  validateCompanyUser,
  validateId,
  validateCompanyId,
  validatePagination
} = require('../middleware/validation');
const {
  getCompanyUsers,
  getCompanyUserById,
  createCompanyUser,
  updateCompanyUser,
  deleteCompanyUser,
  getCompanyUsersByCompany
} = require('../controllers/companyUserController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/company-users
// @desc    Get all company users
// @access  Private (Admin, Analyst)
router.get('/', authorize('admin', 'analyst'), validatePagination, getCompanyUsers);

// @route   GET /api/v1/company-users/company/:companyId
// @desc    Get users by company
// @access  Private (Admin, Analyst - assigned companies)
router.get('/company/:companyId', validateCompanyId, getCompanyUsersByCompany);

// @route   GET /api/v1/company-users/:id
// @desc    Get company user by ID
// @access  Private (Admin, Analyst)
router.get('/:id', authorize('admin', 'analyst'), validateId, getCompanyUserById);

// @route   POST /api/v1/company-users
// @desc    Create new company user
// @access  Private (Admin, Analyst)
router.post('/', authorize('admin', 'analyst'), validateCompanyUser, checkSubscription, checkUsageLimit('users'), createCompanyUser);

// @route   PUT /api/v1/company-users/:id
// @desc    Update company user
// @access  Private (Admin, Analyst)
router.put('/:id', authorize('admin', 'analyst'), validateId, updateCompanyUser);

// @route   DELETE /api/v1/company-users/:id
// @desc    Delete company user
// @access  Private (Admin, Analyst)
router.delete('/:id', authorize('admin', 'analyst'), validateId, deleteCompanyUser);

module.exports = router;