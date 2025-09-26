const express = require('express');
const { authenticateToken, authorize, authorizeCompanyAccess } = require('../middleware/auth');
const { 
  validateGoal, 
  validateId, 
  validateCompanyId 
} = require('../middleware/validation');
const {
  getGoalsByCompany,
  getGoalById,
  createGoal,
  updateGoal,
  updateGoalProgress,
  deleteGoal,
  getGoalCategories,
  getGoalsSummary
} = require('../controllers/goalController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/goals/categories
// @desc    Get goal categories
// @access  Private (All authenticated users)
router.get('/categories', getGoalCategories);

// @route   GET /api/v1/goals/company/:companyId
// @desc    Get goals by company
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/company/:companyId', validateCompanyId, authorizeCompanyAccess, getGoalsByCompany);

// @route   GET /api/v1/goals/company/:companyId/summary
// @desc    Get goals summary
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/company/:companyId/summary', validateCompanyId, authorizeCompanyAccess, getGoalsSummary);

// @route   GET /api/v1/goals/:id
// @desc    Get goal by ID
// @access  Private (Admin, Analyst - assigned companies, Client - own company)
router.get('/:id', validateId, getGoalById);

// @route   POST /api/v1/goals
// @desc    Create new goal
// @access  Private (Admin, Analyst)
router.post('/', authorize('admin', 'analyst'), validateGoal, createGoal);

// @route   PUT /api/v1/goals/:id
// @desc    Update goal
// @access  Private (Admin, Analyst)
router.put('/:id', authorize('admin', 'analyst'), validateId, updateGoal);

// @route   PUT /api/v1/goals/:id/progress
// @desc    Update goal progress
// @access  Private (Admin, Analyst)
router.put('/:id/progress', authorize('admin', 'analyst'), validateId, updateGoalProgress);

// @route   DELETE /api/v1/goals/:id
// @desc    Delete goal
// @access  Private (Admin, Analyst)
router.delete('/:id', authorize('admin', 'analyst'), validateId, deleteGoal);

module.exports = router;