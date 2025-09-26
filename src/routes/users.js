const express = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const { uploadAvatar } = require('../middleware/uploadAvatar');
const {
  validateRegister,
  validateId,
  validatePagination
} = require('../middleware/validation');
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updatePassword,
  deleteUser,
  toggleUser,
  getAnalysts,
  updateLastSeen
} = require('../controllers/userController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   GET /api/v1/users
// @desc    Get all users
// @access  Private (Admin only)
router.get('/', authorize('admin'), validatePagination, getUsers);

// @route   GET /api/v1/users/analysts
// @desc    Get all analysts
// @access  Private (Admin, Analyst)
router.get('/analysts', authorize('admin', 'analyst'), getAnalysts);

// @route   POST /api/v1/users/update-last-seen
// @desc    Update user's last seen timestamp
// @access  Private (All authenticated users)
router.post('/update-last-seen', updateLastSeen);

// @route   GET /api/v1/users/:id
// @desc    Get user by ID
// @access  Private (Admin only)
router.get('/:id', authorize('admin'), validateId, getUserById);

// @route   POST /api/v1/users
// @desc    Create new user
// @access  Private (Admin only)
router.post('/', authorize('admin'), validateRegister, createUser);

// @route   PUT /api/v1/users/:id
// @desc    Update user
// @access  Private (Admin only)
router.put('/:id', validateId, uploadAvatar.single('avatar'), updateUser);
// router.put('/:id', authorize('admin'), validateId, uploadAvatar.single('avatar'), updateUser);

// @route   PUT /api/v1/users/:id/password
// @desc    Update user password
// @access  Private (Admin only)
router.put('/:id/password', authorize('admin'), validateId, updatePassword);

// @route   DELETE /api/v1/users/:id
// @desc    Delete user
// @access  Private (Admin only)
router.delete('/:id', authorize('admin'), validateId, deleteUser);


// @route   DELETE /api/v1/users/:id
// @desc    Delete user
// @access  Private (Admin only)
router.put('/toggle/:id/toggle-status', authorize('admin'), validateId, toggleUser);

module.exports = router;