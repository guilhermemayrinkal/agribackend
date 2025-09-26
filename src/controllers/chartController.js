const { executeQuery, executeTransaction } = require('../config/database');

// Helper function to convert undefined to null for MySQL compatibility
const safeValue = (value) => value === undefined ? null : value;

// Get chart templates
const getChartTemplates = async (req, res, next) => {
  try {
    const { category, type } = req.query;

    let whereClause = 'WHERE is_active = TRUE';
    let params = [];

    if (category) {
      whereClause += ' AND category = ?';
      params.push(category);
    }

    if (type) {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    const templates = await executeQuery(
      `SELECT * FROM chart_templates ${whereClause} ORDER BY category, name`,
      params
    );

    // Parse fields JSON for each template
    templates.forEach(template => {
      if (template.fields) {
        try {
          template.fields = JSON.parse(template.fields);
        } catch (e) {
          template.fields = [];
        }
      }
      if (template.config) {
        try {
          template.config = JSON.parse(template.config);
        } catch (e) {
          template.config = {};
        }
      }
    });

    res.json({
      success: true,
      data: templates
    });

  } catch (error) {
    next(error);
  }
};

// Get charts by company
const getChartsByCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { category, type } = req.query;

    let whereClause = 'WHERE cc.company_id = ? AND cc.is_active = TRUE';
    let params = [companyId];

    if (category) {
      whereClause += ' AND cc.category = ?';
      params.push(category);
    }

    if (type) {
      whereClause += ' AND cc.type = ?';
      params.push(type);
    }

    const charts = await executeQuery(
      `SELECT 
        cc.*, 
        u.name as analyst_name,
        ct.name as template_name,
        COUNT(de.id) as entries_count,
        MAX(de.created_at) as last_entry
       FROM custom_charts cc
       LEFT JOIN users u ON cc.analyst_id = u.id
       LEFT JOIN chart_templates ct ON cc.template_id = ct.id
       LEFT JOIN data_entries de ON cc.id = de.chart_id
       ${whereClause}
       GROUP BY cc.id
       ORDER BY cc.created_at DESC`,
      params
    );

    // Parse JSON fields
    charts.forEach(chart => {
      if (chart.fields) {
        try {
          chart.fields = JSON.parse(chart.fields);
        } catch (e) {
          chart.fields = [];
        }
      }
      if (chart.config) {
        try {
          chart.config = JSON.parse(chart.config);
        } catch (e) {
          chart.config = {};
        }
      }
    });

    res.json({
      success: true,
      data: charts
    });

  } catch (error) {
    next(error);
  }
};

// Get chart by ID
const getChartById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [chart] = await executeQuery(
      `SELECT 
        cc.*, 
        u.name as analyst_name,
        c.company_name,
        ct.name as template_name
       FROM custom_charts cc
       LEFT JOIN users u ON cc.analyst_id = u.id
       LEFT JOIN companies c ON cc.company_id = c.id
       LEFT JOIN chart_templates ct ON cc.template_id = ct.id
       WHERE cc.id = ?`,
      [id]
    );

    if (!chart) {
      return res.status(404).json({
        success: false,
        message: 'Chart not found'
      });
    }

    // Parse JSON fields
    if (chart.fields) {
      try {
        chart.fields = JSON.parse(chart.fields);
      } catch (e) {
        chart.fields = [];
      }
    }
    if (chart.config) {
      try {
        chart.config = JSON.parse(chart.config);
      } catch (e) {
        chart.config = {};
      }
    }

    // Get recent data entries
    const dataEntries = await executeQuery(
      'SELECT * FROM data_entries WHERE chart_id = ? ORDER BY entry_date DESC, created_at DESC LIMIT 10',
      [id]
    );

    // Parse data JSON for each entry
    dataEntries.forEach(entry => {
      if (entry.data) {
        try {
          entry.data = JSON.parse(entry.data);
        } catch (e) {
          entry.data = {};
        }
      }
    });

    chart.recent_data = dataEntries;

    res.json({
      success: true,
      data: chart
    });

  } catch (error) {
    next(error);
  }
};

// Create new chart
const createChart = async (req, res, next) => {
  try {
    const {
      company_id, template_id, title, description, type, category, fields, config
    } = req.body;
    const { id: analyst_id } = req.user;

    // Validate company access
    const [company] = await executeQuery(
      'SELECT id FROM companies WHERE id = ? AND (analyst_id = ? OR ? = "admin")',
      [company_id, analyst_id, req.user.role]
    );

    if (!company) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this company'
      });
    }

    // Prepare JSON fields - handle undefined values
    const fieldsJson = fields ? JSON.stringify(fields) : null;
    const configJson = config ? JSON.stringify(config) : null;

    const result = await executeQuery(
      `INSERT INTO custom_charts (
        company_id, analyst_id, template_id, title, description, type, category, fields, config
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        safeValue(company_id), 
        safeValue(analyst_id), 
        safeValue(template_id), 
        safeValue(title), 
        safeValue(description), 
        safeValue(type), 
        safeValue(category), 
        fieldsJson, 
        configJson
      ]
    );

    // Get created chart with proper error handling
    const [chart] = await executeQuery(
      `SELECT 
        cc.*, 
        u.name as analyst_name,
        c.company_name
       FROM custom_charts cc
       LEFT JOIN users u ON cc.analyst_id = u.id
       LEFT JOIN companies c ON cc.company_id = c.id
       WHERE cc.id = ?`,
      [result.insertId]
    );

    // Check if chart was found
    if (!chart) {
      return res.status(500).json({
        success: false,
        message: 'Chart was created but could not be retrieved'
      });
    }

    // Parse JSON fields safely
    if (chart.fields) {
      try {
        chart.fields = JSON.parse(chart.fields);
      } catch (e) {
        chart.fields = [];
      }
    }
    if (chart.config) {
      try {
        chart.config = JSON.parse(chart.config);
      } catch (e) {
        chart.config = {};
      }
    }

    res.status(201).json({
      success: true,
      message: 'Chart created successfully',
      data: chart
    });

  } catch (error) {
    next(error);
  }
};

// Update chart
const updateChart = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, type, category, fields, config, is_active } = req.body;

    // Check if chart exists and user has access
    const [existingChart] = await executeQuery(
      'SELECT company_id, analyst_id FROM custom_charts WHERE id = ?',
      [id]
    );

    if (!existingChart) {
      return res.status(404).json({
        success: false,
        message: 'Chart not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin' && existingChart.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Prepare JSON fields - handle undefined values
    const fieldsJson = fields ? JSON.stringify(fields) : null;
    const configJson = config ? JSON.stringify(config) : null;

    // Update chart
    await executeQuery(
      `UPDATE custom_charts SET 
        title = ?, description = ?, type = ?, category = ?, fields = ?, config = ?, is_active = ?
       WHERE id = ?`,
      [
        safeValue(title), 
        safeValue(description), 
        safeValue(type), 
        safeValue(category), 
        fieldsJson, 
        configJson, 
        safeValue(is_active), 
        id
      ]
    );

    // Get updated chart
    const [chart] = await executeQuery(
      `SELECT 
        cc.*, 
        u.name as analyst_name,
        c.company_name
       FROM custom_charts cc
       LEFT JOIN users u ON cc.analyst_id = u.id
       LEFT JOIN companies c ON cc.company_id = c.id
       WHERE cc.id = ?`,
      [id]
    );

    // Parse JSON fields
    if (chart && chart.fields) {
      try {
        chart.fields = JSON.parse(chart.fields);
      } catch (e) {
        chart.fields = [];
      }
    }
    if (chart && chart.config) {
      try {
        chart.config = JSON.parse(chart.config);
      } catch (e) {
        chart.config = {};
      }
    }

    res.json({
      success: true,
      message: 'Chart updated successfully',
      data: chart
    });

  } catch (error) {
    next(error);
  }
};

// Delete chart
const deleteChart = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if chart exists and user has access
    const [chart] = await executeQuery(
      'SELECT company_id, analyst_id FROM custom_charts WHERE id = ?',
      [id]
    );

    if (!chart) {
      return res.status(404).json({
        success: false,
        message: 'Chart not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin' && chart.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Soft delete - set is_active to false
    await executeQuery(
      'UPDATE custom_charts SET is_active = FALSE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Chart deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Get chart data for visualization
const getChartData = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, limit = 100 } = req.query;

    // Get chart info
    const [chart] = await executeQuery(
      'SELECT * FROM custom_charts WHERE id = ? AND is_active = TRUE',
      [id]
    );

    if (!chart) {
      return res.status(404).json({
        success: false,
        message: 'Chart not found'
      });
    }

    // Build query for data entries
    let whereClause = 'WHERE chart_id = ?';
    let params = [id];

    if (startDate) {
      whereClause += ' AND entry_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND entry_date <= ?';
      params.push(endDate);
    }

    const dataEntries = await executeQuery(
      `SELECT * FROM data_entries ${whereClause} 
       ORDER BY entry_date DESC, created_at DESC 
       LIMIT ?`,
      [...params, parseInt(limit)]
    );

    // Parse data JSON for each entry
    dataEntries.forEach(entry => {
      if (entry.data) {
        try {
          entry.data = JSON.parse(entry.data);
        } catch (e) {
          entry.data = {};
        }
      }
    });

    // Parse chart fields
    let chartFields = [];
    console.log('IFASSJFISA '+chart.fields);
    if (chart.fields) {
      try {
        chartFields = JSON.parse(chart.fields);
      } catch (e) {
        chartFields = [];
      }
    }

    res.json({
      success: true,
      data: {
        chart: {
          id: chart.id,
          title: chart.title,
          type: chart.type,
          category: chart.category,
          fields: chartFields
        },
        entries: dataEntries,
        total: dataEntries.length
      }
    });

  } catch (error) {
    next(error);
  }
};

// Get chart categories
const getChartCategories = async (req, res, next) => {
  try {
    const categories = await executeQuery(
      'SELECT DISTINCT category FROM chart_templates WHERE is_active = TRUE ORDER BY category'
    );

    res.json({
      success: true,
      data: categories.map(c => c.category)
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getChartTemplates,
  getChartsByCompany,
  getChartById,
  createChart,
  updateChart,
  deleteChart,
  getChartData,
  getChartCategories
};