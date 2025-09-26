const bcrypt = require('bcryptjs');
const { executeQuery } = require('../config/database');

// Helper function to convert undefined to null for MySQL compatibility
const safeValue = (value) => value === undefined ? null : value;

// Get all company users
const getCompanyUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, company_id, role, search } = req.query;
    const { role: userRole, id: userId } = req.user;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE cu.is_active = TRUE';
    let params = [];

    // Analysts can only see users from their assigned companies
    if (userRole === 'analyst') {
      whereClause += ' AND c.analyst_id = ?';
      params.push(userId);
    }

    if (company_id) {
      whereClause += ' AND cu.company_id = ?';
      params.push(company_id);
    }

    if (role) {
      whereClause += ' AND cu.role = ?';
      params.push(role);
    }

    if (search) {
      whereClause += ' AND (cu.name LIKE ? OR cu.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Get company users with company info
    const companyUsers = await executeQuery(
      `SELECT 
        cu.*,
        c.company_name
       FROM company_users cu
       JOIN companies c ON cu.company_id = c.id
       ${whereClause}
       ORDER BY cu.created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total 
       FROM company_users cu
       JOIN companies c ON cu.company_id = c.id
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        users: companyUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total),
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

// Get company user by ID
const getCompanyUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [companyUser] = await executeQuery(
      `SELECT 
        cu.*,
        c.company_name
       FROM company_users cu
       JOIN companies c ON cu.company_id = c.id
       WHERE cu.id = ?`,
      [id]
    );

    if (!companyUser) {
      return res.status(404).json({
        success: false,
        message: 'Company user not found'
      });
    }

    res.json({
      success: true,
      data: companyUser
    });

  } catch (error) {
    next(error);
  }
};

// Create new company user
const createCompanyUser = async (req, res, next) => {
  try {
    const {
      company_id, name, email, password, role = 'user',
      can_view_reports = true, can_edit_reports = false, can_view_charts = true,
      can_view_goals = true, can_view_alerts = true, can_view_insights = true,
      can_view_financial_data = false, can_export_data = false, avatar
    } = req.body;

    // Check if company exists and user has access
    const [company] = await executeQuery(
      'SELECT id, analyst_id FROM companies WHERE id = ?',
      [company_id]
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Check access for analysts
    if (req.user.role === 'analyst' && company.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this company'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await executeQuery(
      `INSERT INTO company_users (
        company_id, name, email, password, role,
        can_view_reports, can_edit_reports, can_view_charts,
        can_view_goals, can_view_alerts, can_view_insights,
        can_view_financial_data, can_export_data, avatar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id, name, email, hashedPassword, role,
        can_view_reports, can_edit_reports, can_view_charts,
        can_view_goals, can_view_alerts, can_view_insights,
        can_view_financial_data, can_export_data, safeValue(avatar)
      ]
    );

    // Get created user
    const [companyUser] = await executeQuery(
      `SELECT 
        cu.*,
        c.company_name
       FROM company_users cu
       JOIN companies c ON cu.company_id = c.id
       WHERE cu.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Company user created successfully',
      data: companyUser
    });

  } catch (error) {
    next(error);
  }
};

// Update company user
const updateCompanyUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name, email, role, can_view_reports, can_edit_reports, can_view_charts,
      can_view_goals, can_view_alerts, can_view_insights,
      can_view_financial_data, can_export_data, avatar, is_active
    } = req.body;

    // Check if user exists
    const [existingUser] = await executeQuery(
      `SELECT cu.*, c.analyst_id 
       FROM company_users cu
       JOIN companies c ON cu.company_id = c.id
       WHERE cu.id = ?`,
      [id]
    );

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'Company user not found'
      });
    }

    // Check access for analysts
    if (req.user.role === 'analyst' && existingUser.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update user
    await executeQuery(
      `UPDATE company_users SET 
        name = ?, email = ?, role = ?,
        can_view_reports = ?, can_edit_reports = ?, can_view_charts = ?,
        can_view_goals = ?, can_view_alerts = ?, can_view_insights = ?,
        can_view_financial_data = ?, can_export_data = ?, avatar = ?, is_active = ?
       WHERE id = ?`,
      [
        safeValue(name), safeValue(email), safeValue(role),
        safeValue(can_view_reports), safeValue(can_edit_reports), safeValue(can_view_charts),
        safeValue(can_view_goals), safeValue(can_view_alerts), safeValue(can_view_insights),
        safeValue(can_view_financial_data), safeValue(can_export_data), safeValue(avatar),
        safeValue(is_active), id
      ]
    );

    // Get updated user
    const [companyUser] = await executeQuery(
      `SELECT 
        cu.*,
        c.company_name
       FROM company_users cu
       JOIN companies c ON cu.company_id = c.id
       WHERE cu.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Company user updated successfully',
      data: companyUser
    });

  } catch (error) {
    next(error);
  }
};

// Delete company user
const deleteCompanyUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const [companyUser] = await executeQuery(
      `SELECT cu.*, c.analyst_id 
       FROM company_users cu
       JOIN companies c ON cu.company_id = c.id
       WHERE cu.id = ?`,
      [id]
    );

    if (!companyUser) {
      return res.status(404).json({
        success: false,
        message: 'Company user not found'
      });
    }

    // Check access for analysts
    if (req.user.role === 'analyst' && companyUser.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Soft delete - set is_active to false
    await executeQuery(
      'UPDATE company_users SET is_active = FALSE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Company user deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Get users by company
const getCompanyUsersByCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { role: userRole, id: userId } = req.user;

    // Check if company exists and user has access
    const [company] = await executeQuery(
      'SELECT id, analyst_id FROM companies WHERE id = ?',
      [companyId]
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Check access for analysts
    if (userRole === 'analyst' && company.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this company'
      });
    }

    const companyUsers = await executeQuery(
      `SELECT * FROM company_users 
       WHERE company_id = ? AND is_active = TRUE 
       ORDER BY role DESC, name ASC`,
      [companyId]
    );

    res.json({
      success: true,
      data: companyUsers
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCompanyUsers,
  getCompanyUserById,
  createCompanyUser,
  updateCompanyUser,
  deleteCompanyUser,
  getCompanyUsersByCompany
};