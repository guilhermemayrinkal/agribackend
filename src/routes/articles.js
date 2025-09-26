const express = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const { checkSubscription, checkUsageLimit, checkFeatureAccess } = require('../middleware/subscriptionMiddleware');
const {
  validateArticle,
  validateId,
  validatePagination
} = require('../middleware/validation');
const {
  upload,
  getArticles,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  toggleFavorite,
  markAsRead,
  getCategories,
  getFavoriteArticles,
  getArticleStats
} = require('../controllers/articleController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/articles
// @desc    Get articles (published only for clients)
// @access  Private (All authenticated users)
router.get('/', validatePagination, checkSubscription, getArticles);

// @route   GET /api/v1/articles/categories
// @desc    Get article categories
// @access  Private (All authenticated users)
router.get('/categories', getCategories);

// @route   GET /api/v1/articles/favorites
// @desc    Get user's favorite articles
// @access  Private (Companies only)
router.get('/favorites', getFavoriteArticles);

// @route   GET /api/v1/articles/stats
// @desc    Get articles statistics
// @access  Private (Admin only)
router.get('/stats', authorize('admin'), getArticleStats);

// @route   GET /api/v1/articles/:id
// @desc    Get article by ID
// @access  Private (All authenticated users)
router.get('/:id', validateId, getArticleById);

// @route   POST /api/v1/articles
// @desc    Create new article
// @access  Private (Admin only)
router.post('/',
  authorize('admin'),
  upload.fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ]),
  validateArticle,
  createArticle
);

// @route   PUT /api/v1/articles/:id
// @desc    Update article
// @access  Private (Admin only)
router.put('/:id',
  authorize('admin'),
  validateId,
  upload.fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ]),
  updateArticle
);

// @route   DELETE /api/v1/articles/:id
// @desc    Delete article
// @access  Private (Admin only)
router.delete('/:id', authorize('admin'), validateId, deleteArticle);

// @route   PUT /api/v1/articles/:id/favorite
// @desc    Toggle favorite status
// @access  Private (Companies only)
router.put('/:id/favorite', validateId, toggleFavorite);

// @route   PUT /api/v1/articles/:id/read
// @desc    Mark article as read
// @access  Private (Companies only)
router.put('/:id/read', validateId, markAsRead);

module.exports = router;