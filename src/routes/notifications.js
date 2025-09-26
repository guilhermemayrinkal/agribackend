// backend/src/routes/notifications.js
const express = require('express');
const router = express.Router();
// const { authMiddleware } = require('../middlewares/authMiddleware');
const { authenticateToken, authorize, authorizeCompanyAccess } = require('../middleware/auth');
const { checkSubscription, checkUsageLimit, checkFeatureAccess } = require('../middleware/subscriptionMiddleware');

const nc = require('../controllers/notificationController');

router.use(authenticateToken);

// GET /notifications
router.get('/', checkSubscription, nc.listMyNotifications);

// GET /notifications/unread-count
router.get('/unread-count', nc.unreadCount);

// PATCH /notifications/:id/read
router.put('/:id/read', nc.markAsRead);

// POST /notifications/read-all
router.post('/read-all', nc.markAllAsRead);

// DELETE /notifications/:id (arquiva)
router.delete('/:id', nc.archiveNotification);

// (opcional) POST /notifications (criar evento manual p/ testes)
router.post('/', nc.createManual);

module.exports = router;
