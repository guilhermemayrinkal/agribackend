const express = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const {
  validateArticleCategory,
  validateId,
  validatePagination
} = require('../middleware/validation');
const {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories
} = require('../controllers/articleCategoryController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/article-categories
// @desc    Get all article categories
// @access  Private (All authenticated users)
router.get('/', validatePagination, getCategories);

// @route   GET /api/v1/article-categories/:id
// @desc    Get category by ID
// @access  Private (All authenticated users)
router.get('/:id', validateId, getCategoryById);

// @route   POST /api/v1/article-categories
// @desc    Create new category
// @access  Private (Admin only)
router.post('/', authorize('admin'), validateArticleCategory, createCategory);

// @route   PUT /api/v1/article-categories/:id
// @desc    Update category
// @access  Private (Admin only)
router.put('/:id', authorize('admin'), validateId, updateCategory);

// @route   PUT /api/v1/article-categories/reorder
// @desc    Reorder categories
// @access  Private (Admin only)
router.put('/reorder', authorize('admin'), reorderCategories);

// @route   DELETE /api/v1/article-categories/:id
// @desc    Delete category
// @access  Private (Admin only)
router.delete('/:id', authorize('admin'), validateId, deleteCategory);

module.exports = router;