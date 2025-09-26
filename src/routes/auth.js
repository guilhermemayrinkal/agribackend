const express = require('express');
const { authLimiter } = require('../middleware/rateLimiter');
const { validateLogin, validatePasswordReset, validateResetPassword } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const {
  login,
  refreshToken,
  logout,
  getProfile,
  requestPasswordReset,
  resetPassword,
  requestEmailVerification,
  verifyEmailToken
} = require('../controllers/authController');

const router = express.Router();

// @route   POST /api/v1/auth/login
// @desc    Login user
// @access  Public
router.post('/login', validateLogin, login);
// router.post('/login', authLimiter, validateLogin, login);

// @route   POST /api/v1/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', refreshToken);

// @route   POST /api/v1/auth/logout
// @desc    Logout user
// @access  Public
router.post('/logout', logout);

// @route   POST /api/v1/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password', authLimiter, validatePasswordReset, requestPasswordReset);
// router.post('/forgot-password', authLimiter, validatePasswordReset, requestPasswordReset);

// @route   POST /api/v1/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', authLimiter, validateResetPassword, resetPassword);

// Solicitar envio do e-mail de verificação
router.post('/verify-email/request', requestEmailVerification);

// Confirmar/verificar o e-mail (aceita body.token ou query ?token=)
router.post('/verify-email/verify', verifyEmailToken);
router.get('/verify-email/verify', verifyEmailToken);

// // @route   POST /api/v1/auth/forgot-password
// // @desc    Request password reset
// // @access  Public
// router.post('/forgot-password', authLimiter, requestPasswordReset);

// // @route   POST /api/v1/auth/reset-password
// // @desc    Reset password with token
// // @access  Public
// router.post('/reset-password', authLimiter, resetPassword);

// @route   GET /api/v1/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', authenticateToken, getProfile);

module.exports = router;