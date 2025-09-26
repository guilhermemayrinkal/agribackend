const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path'); // <— ADICIONE
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const { initChatSocket } = require('./sockets/chatSocket');



const { testConnection } = require('./config/database');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const companyRoutes = require('./routes/companies');
const companyUserRoutes = require('./routes/companyUsers');
const chartRoutes = require('./routes/charts');
const dataRoutes = require('./routes/data');
const goalRoutes = require('./routes/goals');
const alertRoutes = require('./routes/alerts');
const insightRoutes = require('./routes/insights');
const reportRoutes = require('./routes/reports');
const inventoryRoutes = require('./routes/inventory');
const inventoryAdjustmentsRoutes = require('./routes/inventoryAdjustmentRequests');
const subscriptionRouters = require('./routes/subscriptions');
const articleRouters = require('./routes/articles');
const articleCategories = require('./routes/articleCategories');
const profileRoutes = require('./routes/profile');
const chatRoutes = require('./routes/chat');
const notificationRoutes = require('./routes/notifications');
const fileRoutes = require('./routes/fileRoutes');


const app = express();
const PORT = process.env.PORT || 3001;
const API_VERSION = process.env.API_VERSION || 'v1';

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

initChatSocket(io);

server.listen(5175, () => {
  console.log('API running...');
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Static: servir arquivos enviados
const uploadsDir = path.resolve(__dirname, '../uploads');
// se o seu server.js não estiver em src/ e sim na raiz do backend, use: path.resolve(__dirname, 'uploads')

app.use('/uploads', express.static(uploadsDir, {
  maxAge: '1d',
  etag: true,
}));

// General middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
// app.use(generalLimiter);

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'BusinessAnalytics API is running',
    timestamp: new Date().toISOString(),
    version: API_VERSION
  });
});

// API routes
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/users`, userRoutes);
app.use(`/api/${API_VERSION}/companies`, companyRoutes);
app.use(`/api/${API_VERSION}/company-users`, companyUserRoutes);
app.use(`/api/${API_VERSION}/charts`, chartRoutes);
app.use(`/api/${API_VERSION}/data`, dataRoutes);
app.use(`/api/${API_VERSION}/goals`, goalRoutes);
app.use(`/api/${API_VERSION}/alerts`, alertRoutes);
app.use(`/api/${API_VERSION}/insights`, insightRoutes);
app.use(`/api/${API_VERSION}/reports`, reportRoutes);
app.use(`/api/${API_VERSION}/inventory`, inventoryRoutes);
app.use(`/api/${API_VERSION}/inventory-adjustments`, inventoryAdjustmentsRoutes);
app.use(`/api/${API_VERSION}/subscriptions`, subscriptionRouters);
app.use(`/api/${API_VERSION}/articles`, articleRouters);
app.use(`/api/${API_VERSION}/article-categories`, articleCategories);
app.use(`/api/${API_VERSION}/profile`, profileRoutes);
app.use(`/api/${API_VERSION}/chat`, chatRoutes);
app.use(`/api/${API_VERSION}/notifications`, notificationRoutes);
app.use(`/api/${API_VERSION}`, fileRoutes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 BusinessAnalytics API ${API_VERSION}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`📚 API Base URL: http://localhost:${PORT}/api/${API_VERSION}`);
      console.log(`\n📋 Available Endpoints:`);
      console.log(`   🔐 Auth: /api/${API_VERSION}/auth`);
      console.log(`   👥 Users: /api/${API_VERSION}/users`);
      console.log(`   🏢 Companies: /api/${API_VERSION}/companies`);
      console.log(`   👤 Company Users: /api/${API_VERSION}/company-users`);
      console.log(`   📊 Charts: /api/${API_VERSION}/charts`);
      console.log(`   📈 Data: /api/${API_VERSION}/data`);
      console.log(`   🎯 Goals: /api/${API_VERSION}/goals`);
      console.log(`   🚨 Alerts: /api/${API_VERSION}/alerts`);
      console.log(`   💡 Insights: /api/${API_VERSION}/insights`);
      console.log('🖼️ Serving uploads from:', uploadsDir);

    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;