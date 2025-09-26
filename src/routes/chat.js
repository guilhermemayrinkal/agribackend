const express = require('express');
const router = express.Router();
// const { authMiddleware } = require('../middleware/auth'); // supondo que já exista
const { authenticateToken, authorize, authorizeCompanyAccess } = require('../middleware/auth');
const { checkSubscription, checkUsageLimit, checkFeatureAccess } = require('../middleware/subscriptionMiddleware');

const chatController = require('../controllers/chatController');

// tudo exige auth
router.use(authenticateToken);

// Conversas
router.get('/conversations', checkSubscription, chatController.listConversations);
router.post('/conversations', checkSubscription, chatController.ensureConversation); // cria/retorna existente

// Mensagens
router.get('/conversations/:conversationId/messages', checkSubscription, chatController.listMessages);
router.post('/conversations/:conversationId/messages', checkSubscription, chatController.sendMessage);
router.post('/conversations/:conversationId/read', checkSubscription, chatController.markAsRead);

// Participantes (company_user)
router.post('/conversations/:conversationId/participants', checkSubscription, chatController.addCompanyUserParticipant);

module.exports = router;
