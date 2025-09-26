const express = require('express');
// const { authMiddleware } = require('../middlewares/auth');
const { authenticateToken, authorize, authorizeCompanyAccess, isUserLoggedIn, getLoggedInUser } = require('../middleware/auth');
const { uploadChatFile } = require('../controllers/uploadController');
const router = express.Router();

// All routes require authentication
// router.use(authenticateToken);

router.post('/files/chat', uploadChatFile);

module.exports = router;
