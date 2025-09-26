const { verifyToken } = require('../config/jwt');
const { executeQuery } = require('../config/database');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = verifyToken(token);

    // Check if user/company still exists and is active
    let user = null;
    if (decoded.role === 'client' && decoded.userType === 'company') {
      const [company] = await executeQuery(
        'SELECT * FROM companies WHERE id = ? AND is_active = TRUE',
        [decoded.id]
      );
      user = company;
    } else if (decoded.role === 'company_user') {
      const [companyUser] = await executeQuery(
        `SELECT 
          cu.*,
          c.company_name,
          c.cnpj,
          c.sector,
          c.business_type,
          c.analyst_id
         FROM company_users cu
         JOIN companies c ON cu.company_id = c.id
         WHERE cu.id = ? AND cu.is_active = TRUE AND c.is_active = TRUE`,
        [decoded.id]
      );
      user = companyUser;
    } else {
      const [userRecord] = await executeQuery(
        'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
        [decoded.id]
      );
      user = userRecord;
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: decoded.role,
      userType: decoded.userType,
      name: user.name,
      companyName: user.company_name || null,
      analystId: user.analyst_id || null,
      companyId: decoded.companyId || null,
      permissions: decoded.role === 'company_user' ? {
        canViewReports: user.can_view_reports,
        canEditReports: user.can_edit_reports,
        canViewCharts: user.can_view_charts,
        canViewGoals: user.can_view_goals,
        canViewAlerts: user.can_view_alerts,
        canViewInsights: user.can_view_insights,
        canViewFinancialData: user.can_view_financial_data,
        canExportData: user.can_export_data
      } : null
    };

    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// Middleware to check user roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Middleware to check if analyst can access company data
const authorizeCompanyAccess = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { role, id: userId, companyId: userCompanyId } = req.user;

    console.log('COMPANYU ID ' + companyId);
    console.log('USER COMAPN ' + JSON.stringify(req.user));
    // Admin can access everything
    if (role === 'admin') {
      return next();
    }

    // Client can only access their own data
    if (role === 'client' || role === 'company_user') {
      const targetCompanyId = role === 'company_user' ? userCompanyId : userId;
      if (targetCompanyId !== companyId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this company datafafaafaf'
        });
      }
      return next();
    }

    // Legacy client check (for backward compatibility)
    if (role === 'client') {
      if (userId !== companyId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this company data'
        });
      }
      return next();
    }

    // Analyst can only access their assigned companies
    if (role === 'analyst') {
      const [company] = await executeQuery(
        'SELECT analyst_id FROM companies WHERE id = ?',
        [companyId]
      );

      if (!company || company.analyst_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this company data'
        });
      }
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Invalid role'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authorization check failed'
    });
  }
};

const isUserLoggedIn = (req) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return false;
    }

    const decoded = verifyToken(token);

    // Se o token foi decodificado com sucesso, o usuário está logado
    return !!decoded;
  } catch (error) {
    return false;
  }
};

// Função para obter informações do usuário logado (se disponível)
const getLoggedInUser = (req) => {
  return req.user || null;
};

module.exports = {
  authenticateToken,
  authorize,
  authorizeCompanyAccess,
  isUserLoggedIn,
  getLoggedInUser,
};