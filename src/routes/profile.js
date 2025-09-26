const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { uploadAvatar } = require('../middleware/uploadAvatar');
const {
  validateId,
  validateProfileUpdate,
  validatePasswordUpdate
} = require('../middleware/validation');
const {
  updateProfile,
  updateProfilePassword
} = require('../controllers/profileController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// @route   PUT /api/v1/profile
// @desc    Update user profile (works for all user types)
// @access  Private (All authenticated users)
router.put('/', uploadAvatar.single('avatar'), updateProfile);

// @route   PUT /api/v1/profile/password
// @desc    Update user password (works for all user types)
// @access  Private (All authenticated users)
router.put('/password', validatePasswordUpdate, updateProfilePassword);

module.exports = router;