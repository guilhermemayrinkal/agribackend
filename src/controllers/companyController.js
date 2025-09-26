const bcrypt = require('bcryptjs');
const { executeQuery, executeTransaction } = require('../config/database');

// Helper function to convert undefined to null for MySQL compatibility
const safeValue = (value) => value === undefined ? null : value;

// Get companies (for analysts - only their assigned companies)
const getCompanies = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, business_type, sector } = req.query;
    const { role, id: userId } = req.user;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE c.is_active = TRUE';
    if (role === 'admin') {
      whereClause = '';

    }
    let params = [];

    // Analysts can only see their assigned companies
    if (role === 'analyst') {
      whereClause += ' AND c.analyst_id = ?';
      params.push(userId);
    }

    if (search) {
      whereClause += ' AND (c.name LIKE ? OR c.company_name LIKE ? OR c.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (business_type) {
      whereClause += ' AND c.business_type = ?';
      params.push(business_type);
    }

    if (sector) {
      whereClause += ' AND c.sector LIKE ?';
      params.push(`%${sector}%`);
    }

    // Get companies with analyst info
    const companies = await executeQuery(
      `SELECT 
        c.id, c.name, c.email, c.company_name, c.cnpj, c.sector, c.business_type,
        c.property, c.cultures, c.area, c.area_unit, c.street, c.number, 
        c.complement, c.neighborhood, c.city, c.state, c.zip_code,
        c.avatar, c.dashboard_url, c.is_active, c.created_at, c.updated_at,
        u.name as analyst_name, u.email as analyst_email
       FROM companies c
       LEFT JOIN users u ON c.analyst_id = u.id
       ${whereClause}
       ORDER BY c.created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total FROM companies c ${whereClause}`,
      params
    );

    // Get goals and alerts count for each company
    for (let company of companies) {
      // Goals count
      const [{ goals_count }] = await executeQuery(
        'SELECT COUNT(*) as goals_count FROM goals WHERE company_id = ?',
        [company.id]
      );

      // Unread alerts count
      const [{ alerts_count }] = await executeQuery(
        'SELECT COUNT(*) as alerts_count FROM alerts WHERE company_id = ? AND is_read = FALSE',
        [company.id]
      );

      // Charts count
      const [{ charts_count }] = await executeQuery(
        'SELECT COUNT(*) as charts_count FROM custom_charts WHERE company_id = ? AND is_active = TRUE',
        [company.id]
      );

      company.goals_count = goals_count;
      company.alerts_count = alerts_count;
      company.charts_count = charts_count;

      // Parse cultures JSON
      if (company.cultures) {
        try {
          company.cultures = JSON.parse(company.cultures);
        } catch (e) {
          company.cultures = [];
        }
      }
    }

    res.json({
      success: true,
      data: {
        companies,
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

// Get company by ID
const getCompanyById = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    const [company] = await executeQuery(
      `SELECT 
        c.*, u.name as analyst_name, u.email as analyst_email
       FROM companies c
       LEFT JOIN users u ON c.analyst_id = u.id
       WHERE c.id = ?`,
      [companyId]
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Parse cultures JSON
    if (company.cultures) {
      try {
        company.cultures = JSON.parse(company.cultures);
      } catch (e) {
        company.cultures = [];
      }
    }

    // Get additional data
    const goals = await executeQuery(
      'SELECT * FROM goals WHERE company_id = ? ORDER BY deadline ASC',
      [companyId]
    );

    const alerts = await executeQuery(
      'SELECT * FROM alerts WHERE company_id = ? ORDER BY created_at DESC LIMIT 10',
      [companyId]
    );

    const charts = await executeQuery(
      'SELECT id, title, type, category, data_count, created_at FROM custom_charts WHERE company_id = ? AND is_active = TRUE',
      [companyId]
    );

    company.goals = goals;
    company.alerts = alerts;
    company.charts = charts;

    res.json({
      success: true,
      data: company
    });

  } catch (error) {
    next(error);
  }
};

// Create new company
const createCompany = async (req, res, next) => {
  try {
    const {
      name, email, password, company_name, cnpj, sector, business_type,
      property, cultures, area, area_unit, street, number, complement,
      neighborhood, city, state, zip_code, analyst_id, is_active, dashboard_url
    } = req.body;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Prepare cultures JSON
    const culturesJson = cultures ? JSON.stringify(cultures) : null;

    const result = await executeQuery(
      `INSERT INTO companies (
        name, email, password, company_name, cnpj, sector, business_type,
        property, cultures, area, area_unit, street, number, complement,
        neighborhood, city, state, zip_code, analyst_id, is_active, dashboard_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        safeValue(name),
        safeValue(email),
        hashedPassword,
        safeValue(company_name),
        safeValue(cnpj),
        safeValue(sector),
        safeValue(business_type),
        safeValue(property),
        culturesJson,
        safeValue(area),
        safeValue(area_unit),
        safeValue(street),
        safeValue(number),
        safeValue(complement),
        safeValue(neighborhood),
        safeValue(city),
        safeValue(state),
        safeValue(zip_code),
        safeValue(analyst_id),
        safeValue(is_active),
        safeValue(dashboard_url)
      ]
    );

    // Get created company
    const [company] = await executeQuery(
      `SELECT 
        c.*, u.name as analyst_name, u.email as analyst_email
       FROM companies c
       LEFT JOIN users u ON c.analyst_id = u.id
       WHERE c.id = ?`,
      [result.insertId]
    );

    // Parse cultures
    if (company.cultures) {
      try {
        company.cultures = JSON.parse(company.cultures);
      } catch (e) {
        company.cultures = [];
      }
    }

    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      data: company
    });

  } catch (error) {
    next(error);
  }
};

// Update company
const updateCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const {
      name, email, company_name, cnpj, sector, business_type,
      property, cultures, area, area_unit, street, number, complement,
      neighborhood, city, state, zip_code, analyst_id, is_active, dashboard_url
    } = req.body;
    console.log('USERRR ' + JSON.stringify(req.user));
    // Check if company exists
    const [existingCompany] = await executeQuery(
      'SELECT id FROM companies WHERE id = ?',
      [companyId]
    );

    if (!existingCompany) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Prepare cultures JSON - handle undefined values
    const culturesJson = cultures ? JSON.stringify(cultures) : null;

    // Update company
    await executeQuery(
      `UPDATE companies SET 
        name = ?, email = ?, company_name = ?, cnpj = ?, sector = ?, business_type = ?,
        property = ?, cultures = ?, area = ?, area_unit = ?, street = ?, number = ?, 
        complement = ?, neighborhood = ?, city = ?, state = ?, zip_code = ?, dashboard_url = ?,
        analyst_id = ?, is_active = ?
       WHERE id = ?`,
      [
        safeValue(name),
        safeValue(email),
        safeValue(company_name),
        safeValue(cnpj),
        safeValue(sector),
        safeValue(business_type),
        safeValue(property),
        culturesJson,
        safeValue(area),
        safeValue(area_unit),
        safeValue(street),
        safeValue(number),
        safeValue(complement),
        safeValue(neighborhood),
        safeValue(city),
        safeValue(state),
        safeValue(zip_code),
        safeValue(dashboard_url),
        safeValue(analyst_id),
        1, //is_active = true
        companyId
      ]
    );

    // Get updated company
    const [company] = await executeQuery(
      `SELECT 
        c.*, u.name as analyst_name, u.email as analyst_email
       FROM companies c
       LEFT JOIN users u ON c.analyst_id = u.id
       WHERE c.id = ?`,
      [companyId]
    );

    // Parse cultures
    if (company.cultures) {
      try {
        company.cultures = JSON.parse(company.cultures);
      } catch (e) {
        company.cultures = [];
      }
    }

    res.json({
      success: true,
      message: 'Company updated successfully',
      data: company
    });

  } catch (error) {
    next(error);
  }
};

// Delete company
const toggleStatusCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { is_active
    } = req.body;

    // Check if company exists
    const [company] = await executeQuery(
      'SELECT id FROM companies WHERE id = ?',
      [companyId]
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Soft delete - set is_active to false
    await executeQuery(
      `UPDATE companies SET is_active = ? 
      WHERE id = ?`,
      [
        safeValue(is_active),
        companyId
      ]
    );

    res.json({
      success: true,
      message: 'Company updated successfully'
    });

  } catch (error) {
    next(error);
  }
};

const deleteCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    // Check if company exists
    const [company] = await executeQuery(
      'SELECT id FROM companies WHERE id = ?',
      [companyId]
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Soft delete - set is_active to false
    await executeQuery(
      'UPDATE companies SET is_active = FALSE WHERE id = ?',
      [companyId]
    );

    res.json({
      success: true,
      message: 'Company deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Get company dashboard data
const getCompanyDashboard = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    console.log('Getting dashboard for company ID:', companyId);

    // Get company basic info
    const [company] = await executeQuery(
      'SELECT id, name, company_name, sector, business_type FROM companies WHERE id = ?',
      [companyId]
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    console.log('Company found:', company);

    // Get charts with recent data
    const charts = await executeQuery(
      `SELECT 
        cc.id, cc.title, cc.type, cc.category, cc.data_count,
        COUNT(de.id) as entries_count,
        MAX(de.created_at) as last_entry
       FROM custom_charts cc
       LEFT JOIN data_entries de ON cc.id = de.chart_id
       WHERE cc.company_id = ? AND cc.is_active = TRUE
       GROUP BY cc.id
       ORDER BY cc.created_at DESC`,
      [companyId]
    );

    console.log('Charts found:', charts.length);

    // Get goals progress
    const goals = await executeQuery(
      `SELECT 
        id, title, target_value, current_value, unit, deadline, category,
        ROUND((current_value / target_value) * 100, 2) as progress_percentage
       FROM goals 
       WHERE company_id = ? 
       ORDER BY deadline ASC`,
      [companyId]
    );

    console.log('Goals found:', goals.length);

    // Get recent alerts
    const alerts = await executeQuery(
      'SELECT * FROM alerts WHERE company_id = ? ORDER BY created_at DESC LIMIT 5',
      [companyId]
    );

    console.log('Alerts found:', alerts.length);

    // Get recent insights
    const insights = await executeQuery(
      'SELECT * FROM insights WHERE company_id = ? ORDER BY created_at DESC LIMIT 5',
      [companyId]
    );

    console.log('Insights found:', insights.length);

    const dashboardData = {
      company,
      charts,
      goals,
      alerts,
      insights
    };

    console.log('Dashboard data prepared successfully');

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Error in getCompanyDashboard:', error);
    next(error);
  }
};

module.exports = {
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  toggleStatusCompany,
  deleteCompany,
  getCompanyDashboard
};