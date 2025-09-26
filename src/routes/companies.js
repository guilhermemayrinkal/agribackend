const express = require('express');
const { authenticateToken, authorize, authorizeCompanyAccess } = require('../middleware/auth');
const { 
  validateCompany, 
  validateCompanyId, 
  validatePagination 
} = require('../middleware/validation');
const {
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  toggleStatusCompany,
  deleteCompany,
  getCompanyDashboard
} = require('../controllers/companyController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/companies
// @desc    Get companies (analysts see only their assigned companies)
// @access  Private (Admin, Analyst)
router.get('/', authorize('admin', 'analyst'), validatePagination, getCompanies);

// @route   GET /api/v1/companies/:id
// @desc    Get company by ID
// @access  Private (Admin, Analyst - only assigned companies)
router.get('/:companyId', validateCompanyId, authorizeCompanyAccess, getCompanyById);

// @route   GET /api/v1/companies/:id/dashboard
// @desc    Get company dashboard data
// @access  Private (Admin, Analyst, Client)
router.get('/:companyId/dashboard', validateCompanyId, authorizeCompanyAccess, getCompanyDashboard);

// @route   POST /api/v1/companies
// @desc    Create new company
// @access  Private (Admin, Analyst)
router.post('/', authorize('admin', 'analyst'), validateCompany, createCompany);

// @route   PUT /api/v1/companies/:id
// @desc    Update company
// @access  Private (Admin, Analyst - only assigned companies)
router.put('/:companyId', authorize('admin', 'analyst'), validateCompanyId, updateCompany);

// @route   PUT /api/v1/companies/:id
// @desc    Toggle status company
// @access  Private (Admin, Analyst - only assigned companies)
router.put('/companies_toggle/:companyId', authorize('admin', 'analyst'), validateCompanyId, toggleStatusCompany);

// @route   DELETE /api/v1/companies/:id
// @desc    Delete company
// @access  Private (Admin, Analyst - only assigned companies)
router.delete('/:companyId', authorize('admin', 'analyst'), validateCompanyId, deleteCompany);

module.exports = router;