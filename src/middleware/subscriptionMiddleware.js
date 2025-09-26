const { executeQuery } = require('../config/database');

// Middleware to check subscription status for companies
const checkSubscription = async (req, res, next) => {
  try {
    const { role, id: userId, userType, companyId } = req.user;

    // Only check subscription for companies and company users
    if (role !== 'client' && role !== 'company_user') {
      return next(); // Admin and analysts don't need subscription check
    }

    // Get the company ID to check
    let targetCompanyId = null;
    if (role === 'client' && userType === 'company') {
      targetCompanyId = userId; // Company login directly
    } else if (role === 'company_user') {
      targetCompanyId = companyId; // Company user
    }

    if (!targetCompanyId) {
      return res.status(403).json({
        success: false,
        message: 'Company identification required',
        code: 'COMPANY_ID_MISSING'
      });
    }

    // Get active subscription for the company
    const [subscription] = await executeQuery(
      `SELECT 
        s.*,
        sp.name as plan_name,
        sp.max_users,
        sp.max_charts,
        sp.max_companies,
        sp.features
       FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.company_id = ? AND s.status IN ('active', 'trialing')
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [targetCompanyId]
    );

    if (!subscription) {
      return res.status(402).json({
        success: false,
        message: 'No active subscription found. Please contact support to activate your account.',
        code: 'NO_SUBSCRIPTION'
      });
    }

    // Check if subscription is expired
    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);

    if (subscription.status === 'trialing') {
      const trialEnd = subscription.trial_end ? new Date(subscription.trial_end) : periodEnd;
      if (now > trialEnd) {
        // Trial expired, check if there's a valid payment
        const [lastPayment] = await executeQuery(
          `SELECT * FROM payments 
           WHERE subscription_id = ? AND status = 'succeeded' 
           ORDER BY created_at DESC LIMIT 1`,
          [subscription.id]
        );

        if (!lastPayment) {
          return res.status(402).json({
            success: false,
            message: 'Trial period expired. Please update your payment method to continue.',
            code: 'TRIAL_EXPIRED',
            data: {
              trialEnd: subscription.trial_end,
              planName: subscription.plan_name
            }
          });
        }
      }
    } else if (subscription.status === 'active' && now > periodEnd) {
      return res.status(402).json({
        success: false,
        message: 'Subscription expired. Please renew to continue using the service.',
        code: 'SUBSCRIPTION_EXPIRED',
        data: {
          expiredAt: subscription.current_period_end,
          planName: subscription.plan_name
        }
      });
    }

    // Parse features if it's JSON string
    let features = [];
    if (subscription.features) {
      try {
        features = typeof subscription.features === 'string'
          ? JSON.parse(subscription.features)
          : subscription.features;
      } catch (e) {
        features = [];
      }
    }

    // Add subscription info to request
    req.subscription = {
      id: subscription.id,
      planName: subscription.plan_name,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      trialEnd: subscription.trial_end,
      limits: {
        maxUsers: subscription.max_users,
        maxCharts: subscription.max_charts,
        maxCompanies: subscription.max_companies
      },
      features: features
    };

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking subscription status'
    });
  }
};

// Middleware to check specific feature access
const checkFeatureAccess = (requiredFeature) => {
  return (req, res, next) => {
    const { role } = req.user;

    // Admin and analysts have full access
    if (role === 'admin' || role === 'analyst') {
      return next();
    }

    // Check if subscription has the required feature
    if (!req.subscription) {
      return res.status(402).json({
        success: false,
        message: 'Subscription information not available',
        code: 'SUBSCRIPTION_INFO_MISSING'
      });
    }

    const { features } = req.subscription;

    if (!features.includes(requiredFeature)) {
      return res.status(403).json({
        success: false,
        message: `This feature requires a higher subscription plan. Current plan: ${req.subscription.planName}`,
        code: 'FEATURE_NOT_AVAILABLE',
        data: {
          requiredFeature,
          currentPlan: req.subscription.planName,
          availableFeatures: features
        }
      });
    }

    next();
  };
};

// Middleware to check usage limits
const checkUsageLimit = (limitType) => {
  return async (req, res, next) => {
    try {
      const { role, id: userId, companyId } = req.user;

      // Admin and analysts don't have limits
      if (role === 'admin' || role === 'analyst') {
        return next();
      }

      if (!req.subscription) {
        return res.status(402).json({
          success: false,
          message: 'Subscription information not available'
        });
      }

      const targetCompanyId = role === 'company_user' ? companyId : userId;
      const { limits } = req.subscription;

      let currentUsage = 0;
      let maxLimit = 0;

      switch (limitType) {
        case 'users':
          maxLimit = limits.maxUsers;
          if (maxLimit > 0) { // -1 means unlimited
            const [{ count }] = await executeQuery(
              'SELECT COUNT(*) as count FROM company_users WHERE company_id = ? AND is_active = TRUE',
              [targetCompanyId]
            );
            currentUsage = count;
          }
          break;

        case 'charts':
          maxLimit = limits.maxCharts;
          if (maxLimit > 0) {
            const [{ count }] = await executeQuery(
              'SELECT COUNT(*) as count FROM custom_charts WHERE company_id = ? AND is_active = TRUE',
              [targetCompanyId]
            );
            currentUsage = count;
          }
          break;

        case 'companies':
          maxLimit = limits.maxCompanies;
          // This would be used if we allow multiple companies per subscription
          currentUsage = 1; // For now, always 1 company per subscription
          break;

        default:
          return next(); // Unknown limit type, allow access
      }

      // Check if limit is exceeded (unlimited = -1)
      if (maxLimit > 0 && currentUsage >= maxLimit) {
        return res.status(403).json({
          success: false,
          message: `${limitType.charAt(0).toUpperCase() + limitType.slice(1)} limit exceeded. Current plan allows ${maxLimit}, you have ${currentUsage}.`,
          code: 'USAGE_LIMIT_EXCEEDED',
          data: {
            limitType,
            currentUsage,
            maxLimit,
            planName: req.subscription.planName
          }
        });
      }

      next();
    } catch (error) {
      console.error('Usage limit check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking usage limits'
      });
    }
  };
};

// Get subscription status for frontend
const getSubscriptionStatus = async (req, res, next) => {
  try {
    const { role, id: userId, companyId } = req.user;
    console.log('ROLEEEE ' + JSON.stringify(role));
    // Only for companies
    if (role !== 'client' && role !== 'company_user') {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          message: 'Subscription not applicable for this user type'
        }
      });
    }

    const targetCompanyId = role === 'company_user' ? companyId : userId;

    // Get subscription with usage stats
    const [subscription] = await executeQuery(
      `SELECT 
        s.*,
        sp.name as plan_name,
        sp.max_users,
        sp.max_charts,
        sp.max_companies,
        sp.features,
        sp.price
       FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.company_id = ?
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [targetCompanyId]
    );

    if (!subscription) {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          message: 'No subscription found'
        }
      });
    }

    // Get current usage
    const [usersCount] = await executeQuery(
      'SELECT COUNT(*) as count FROM company_users WHERE company_id = ? AND is_active = TRUE',
      [targetCompanyId]
    );

    const [chartsCount] = await executeQuery(
      'SELECT COUNT(*) as count FROM custom_charts WHERE company_id = ? AND is_active = TRUE',
      [targetCompanyId]
    );

    // Parse features
    let features = [];
    let permissions = {};
    try {
      features = typeof subscription.features === 'string'
        ? JSON.parse(subscription.features)
        : subscription.features || [];
    } catch (e) {
      features = [];
    }

    try {
      permissions = typeof subscription.permissions === 'string'
        ? JSON.parse(subscription.permissions)
        : subscription.permissions || {};
    } catch (e) {
      permissions = {
        canViewGoals: true,
        canViewAlerts: true,
        canViewInsights: false,
        canViewReports: true,
        canViewInventory: false,
        canViewArticles: true,
        canViewSubscription: true
      };
    }

    // Calculate days remaining
    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);
    const daysRemaining = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      data: {
        hasSubscription: true,
        subscription: {
          id: subscription.id,
          planName: subscription.plan_name,
          status: subscription.status,
          price: subscription.price,
          currentPeriodEnd: subscription.current_period_end,
          trialEnd: subscription.trial_end,
          daysRemaining: Math.max(0, daysRemaining),
          isTrialing: subscription.status === 'trialing',
          features: features,
          permissions: permissions,
          limits: {
            maxUsers: subscription.max_users,
            maxCharts: subscription.max_charts,
            maxCompanies: subscription.max_companies
          },
          usage: {
            users: usersCount.count,
            charts: chartsCount.count,
            companies: 1
          }
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkSubscription,
  checkFeatureAccess,
  checkUsageLimit,
  getSubscriptionStatus
};