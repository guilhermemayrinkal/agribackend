const express = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const { checkSubscription, getSubscriptionStatus } = require('../middleware/subscriptionMiddleware');
const {
  validatePublicSignup,
  validateSubscription,
  validatePayment,
  validateId
} = require('../middleware/validation');
const {
  getPlans,
  createPublicSignup,
  createPublicSignup2,
  processSubscription,
  confirmPayment,
  getSubscriptionById,
  cancelSubscription,
  getPaymentHistory,
  getSubscriptions,
  updateSubscription,
  // Admin routes
  getAllPlans,
  createPlan,
  updatePlan,
  deletePlan,
  deactivePlan,
  createSubscriptionForCompany
} = require('../controllers/subscriptionController');

const {
  listPlans,
  updatePaymentMethod,
  changePlan,
  changeBillingPeriod
} = require('../controllers/subscriptionManagementController');

const router = express.Router();

// Public routes (no authentication required)
// @route   GET /api/v1/subscriptions/plans
// @desc    Get available subscription plans
// @access  Public
router.get('/plans', getPlans);

// POST /subscriptions/:id/payment-method
router.post('/:id/payment-method', authenticateToken, updatePaymentMethod);

// POST /subscriptions/:id/change-plan
router.post('/:id/change-plan', authenticateToken, changePlan);

// POST /subscriptions/:id/billing-period
router.post('/:id/billing-period', authenticateToken, changeBillingPeriod);

// @route   POST /api/v1/subscriptions/signup
// @desc    Create public signup
// @access  Public
router.post('/signup', validatePublicSignup, createPublicSignup2);

// @route   POST /api/v1/subscriptions/process
// @desc    Process subscription and create company
// @access  Public
router.post('/process', validateSubscription, processSubscription);

// @route   POST /api/v1/subscriptions/confirm-payment
// @desc    Confirm payment
// @access  Public
router.post('/confirm-payment', validatePayment, confirmPayment);

// Protected routes (require authentication)
router.use(authenticateToken);

// @route   GET /api/v1/subscriptions/status
// @desc    Get subscription status for current user
// @access  Private (Companies only)
router.get('/get-status', getSubscriptionStatus);




// @route   GET /api/v1/subscriptions/:id/payments
// @desc    Get payment history
// @access  Private (Admin, Company owner)
router.get('/:id/payments', validateId, getPaymentHistory);


// @route   GET /api/v1/subscriptions/:id
// @desc    Get subscription by ID
// @access  Private (Admin, Company owner)
router.get('/get-by-id/:id', validateId, getSubscriptionById);

// @route   GET /api/v1/subscriptions
// @desc    Get subscriptions (admin only)
// @access  Private (Admin only)
router.get('/', authorize('admin'), getSubscriptions);


// @route   PUT /api/v1/subscriptions/:id
// @desc    Update subscription
// @access  Private (Admin, Company owner)
router.put('/:id', updateSubscription);

// @route   DELETE /api/v1/subscriptions/:id
// @desc    Cancel subscription
// @access  Private (Admin, Company owner)
router.delete('/:id', cancelSubscription);


// ===== ADMIN ONLY ROUTES =====

// @route   GET /api/v1/subscriptions/admin/plans
// @desc    Get all plans (admin only)
// @access  Private (Admin only)
router.get('/admin/plans', authorize('admin'), getAllPlans);

// @route   POST /api/v1/subscriptions/admin/plans
// @desc    Create new plan (admin only)
// @access  Private (Admin only)
router.post('/admin/plans', authorize('admin'), createPlan);

// @route   PUT /api/v1/subscriptions/admin/plans/:id
// @desc    Update plan (admin only)
// @access  Private (Admin only)
router.put('/admin/plans/:id', authorize('admin'), validateId, updatePlan);

// @route   DELETE /api/v1/subscriptions/admin/plans/:id
// @desc    Delete plan (admin only)
// @access  Private (Admin only)
router.delete('/admin/plans/:id', authorize('admin'), validateId, deletePlan);

// @route   DELETE /api/v1/subscriptions/admin/plans/:id
// @desc    Delete plan (admin only)
// @access  Private (Admin only)
router.put('/admin/plans/deactive/:id', authorize('admin'), validateId, deactivePlan);

// @route   POST /api/v1/subscriptions/admin/create
// @desc    Create subscription for existing company (admin only)
// @access  Private (Admin only)
router.post('/admin/create', authorize('admin'), createSubscriptionForCompany);

module.exports = router;