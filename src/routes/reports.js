const express = require('express');
const { authenticateToken, authorize, authorizeCompanyAccess } = require('../middleware/auth');
const {
  validateReportTemplate,
  validateCompanyReport,
  validateReportEntry,
  validateId,
  validateReportId,
  validateCompanyId
} = require('../middleware/validation');
const {
  getReportTemplates,
  getReportTemplateById,
  createReportTemplate,
  updateReportTemplate,
  deleteReportTemplate,
  getCompanyReports,
  getCompanyReportById,
  createCompanyReport,
  updateCompanyReport,
  deleteCompanyReport,
  getReportEntries,
  createReportEntry,
  createMultipleReportEntries,
  importReportEntries,
  updateReportEntry,
  deleteReportEntry,
  approveReportEntry,
  rejectReportEntry
} = require('../controllers/reportController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Report Templates Routes
// @route   GET /api/v1/reports/templates
// @desc    Get all report templates
// @access  Private (Admin, Analyst)
router.get('/templates', authorize('admin', 'analyst'), getReportTemplates);

// @route   GET /api/v1/reports/templates/:id
// @desc    Get report template by ID
// @access  Private (Admin, Analyst)
router.get('/templates/:id', authorize('admin', 'analyst'), validateId, getReportTemplateById);

// @route   POST /api/v1/reports/templates
// @desc    Create new report template
// @access  Private (Admin, Analyst)
router.post('/templates', authorize('admin', 'analyst'), validateReportTemplate, createReportTemplate);

// @route   PUT /api/v1/reports/templates/:id
// @desc    Update report template
// @access  Private (Admin, Analyst - template creator)
router.put('/templates/:id', authorize('admin', 'analyst'), validateId, updateReportTemplate);

// @route   DELETE /api/v1/reports/templates/:id
// @desc    Delete report template
// @access  Private (Admin, Analyst - template creator)
router.delete('/templates/:id', authorize('admin', 'analyst'), validateId, deleteReportTemplate);

// Company Reports Routes
// @route   GET /api/v1/reports/company/:companyId/all
// @desc    Get all reports for a company
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/company/:companyId/all', validateCompanyId, authorizeCompanyAccess, getCompanyReports);

// @route   GET /api/v1/reports/company/:id
// @desc    Get company report by ID
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/company/:id', validateId, getCompanyReportById);

// @route   POST /api/v1/reports/company
// @desc    Create new company report
// @access  Private (Admin, Analyst)
router.post('/company', authorize('admin', 'analyst'), validateCompanyReport, createCompanyReport);

// @route   PUT /api/v1/reports/company/:id
// @desc    Update company report
// @access  Private (Admin, Analyst - report creator)
router.put('/company/:id', authorize('admin', 'analyst'), validateId, updateCompanyReport);

// @route   DELETE /api/v1/reports/company/:id
// @desc    Delete company report
// @access  Private (Admin, Analyst - report creator)
router.delete('/company/:id', authorize('admin', 'analyst'), validateId, deleteCompanyReport);

// Report Entries Routes
// @route   GET /api/v1/reports/:reportId/entries
// @desc    Get all entries for a report
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/:reportId/entries', validateReportId, getReportEntries);

// @route   POST /api/v1/reports/:reportId/entries
// @desc    Create new report entry
// @access  Private (Admin, Analyst, Client - if allowed)
router.post('/:reportId/entries', validateReportId, validateReportEntry, createReportEntry);

// @route   POST /api/v1/reports/:reportId/entries/bulk
// @desc    Create multiple report entries
// @access  Private (Admin, Analyst)
router.post('/:reportId/entries/bulk', authorize('admin', 'analyst'), validateReportId, createMultipleReportEntries);

router.post('/:reportId/entries/import', validateReportId, importReportEntries);


// @route   PUT /api/v1/reports/entries/:id
// @desc    Update report entry
// @access  Private (Admin, Analyst, Client - own entries)
router.put('/entries/:id', validateId, validateReportEntry, updateReportEntry);

// @route   DELETE /api/v1/reports/entries/:id
// @desc    Delete report entry
// @access  Private (Admin, Analyst, Client - own entries)
router.delete('/entries/:id', validateId, deleteReportEntry);

// @route   PUT /api/v1/reports/entries/:id/approve
// @desc    Approve report entry
// @access  Private (Admin, Analyst)
router.put('/entries/:id/approve', authorize('admin', 'analyst'), validateId, approveReportEntry);

// @route   PUT /api/v1/reports/entries/:id/reject
// @desc    Reject report entry
// @access  Private (Admin, Analyst)
router.put('/entries/:id/reject', authorize('admin', 'analyst'), validateId, rejectReportEntry);

module.exports = router;