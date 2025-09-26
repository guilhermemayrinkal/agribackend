const { executeQuery } = require('../config/database');
const { createNotificationEvent } = require('./notificationController');
// Get insights
const getInsights = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, severity, is_read, company_id } = req.query;
    const { role, id: userId } = req.user;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];

    // Filter by user role
    if (role === 'analyst') {
      whereClause += ' AND i.analyst_id = ?';
      params.push(userId);
    } else if (role === 'client') {
      whereClause += ' AND i.company_id = ?';
      params.push(userId);
    }

    if (type) {
      whereClause += ' AND i.type = ?';
      params.push(type);
    }

    if (severity) {
      whereClause += ' AND i.severity = ?';
      params.push(severity);
    }

    if (is_read !== undefined) {
      whereClause += ' AND i.is_read = ?';
      params.push(is_read === 'true');
    }

    if (company_id) {
      whereClause += ' AND i.company_id = ?';
      params.push(company_id);
    }

    const insights = await executeQuery(
      `SELECT 
        i.*,
        c.company_name,
        u.name as analyst_name
       FROM insights i
       LEFT JOIN companies c ON i.company_id = c.id
       LEFT JOIN users u ON i.analyst_id = u.id
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total 
       FROM insights i
       ${whereClause}`,
      params
    );

    // Parse data_source JSON
    insights.forEach(insight => {
      if (insight.data_source) {
        try {
          insight.data_source = JSON.parse(insight.data_source);
        } catch (e) {
          insight.data_source = null;
        }
      }
    });

    res.json({
      success: true,
      data: {
        insights,
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

// Get insight by ID
const getInsightById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [insight] = await executeQuery(
      `SELECT 
        i.*,
        c.company_name,
        u.name as analyst_name
       FROM insights i
       LEFT JOIN companies c ON i.company_id = c.id
       LEFT JOIN users u ON i.analyst_id = u.id
       WHERE i.id = ?`,
      [id]
    );

    if (!insight) {
      return res.status(404).json({
        success: false,
        message: 'Insight not found'
      });
    }

    // Parse data_source JSON
    if (insight.data_source) {
      try {
        insight.data_source = JSON.parse(insight.data_source);
      } catch (e) {
        insight.data_source = null;
      }
    }

    res.json({
      success: true,
      data: insight
    });

  } catch (error) {
    next(error);
  }
};

// Create new insight
const createInsight = async (req, res, next) => {
  try {
    const {
      company_id, title, description, type, severity = 'medium', data_source
    } = req.body;
    const { id: analyst_id } = req.user;

    // Prepare data_source JSON
    const dataSourceJson = data_source ? JSON.stringify(data_source) : null;

    const result = await executeQuery(
      `INSERT INTO insights (
        company_id, analyst_id, title, description, type, severity, data_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [company_id, analyst_id, title, description, type, severity, dataSourceJson]
    );

    // Get created insight
    const [insight] = await executeQuery(
      `SELECT 
        i.*,
        c.company_name,
        u.name as analyst_name
       FROM insights i
       LEFT JOIN companies c ON i.company_id = c.id
       LEFT JOIN users u ON i.analyst_id = u.id
       WHERE i.id = ?`,
      [result.insertId]
    );

    // Parse data_source JSON
    if (insight.data_source) {
      try {
        insight.data_source = JSON.parse(insight.data_source);
      } catch (e) {
        insight.data_source = null;
      }
    }

    res.status(201).json({
      success: true,
      message: 'Insight created successfully',
      data: insight
    });

  } catch (error) {
    next(error);
  }
};

// Update insight
const updateInsight = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, type, severity, data_source } = req.body;

    // Check if insight exists and user has access
    const [existingInsight] = await executeQuery(
      'SELECT analyst_id FROM insights WHERE id = ?',
      [id]
    );

    if (!existingInsight) {
      return res.status(404).json({
        success: false,
        message: 'Insight not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin' && existingInsight.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Prepare data_source JSON
    const dataSourceJson = data_source ? JSON.stringify(data_source) : null;

    // Update insight
    await executeQuery(
      `UPDATE insights SET 
        title = ?, description = ?, type = ?, severity = ?, data_source = ?
       WHERE id = ?`,
      [title, description, type, severity, dataSourceJson, id]
    );

    // Get updated insight
    const [insight] = await executeQuery(
      `SELECT 
        i.*,
        c.company_name,
        u.name as analyst_name
       FROM insights i
       LEFT JOIN companies c ON i.company_id = c.id
       LEFT JOIN users u ON i.analyst_id = u.id
       WHERE i.id = ?`,
      [id]
    );

    // Parse data_source JSON
    if (insight.data_source) {
      try {
        insight.data_source = JSON.parse(insight.data_source);
      } catch (e) {
        insight.data_source = null;
      }
    }

    res.json({
      success: true,
      message: 'Insight updated successfully',
      data: insight
    });

  } catch (error) {
    next(error);
  }
};

// Mark insight as read
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if insight exists
    const [insight] = await executeQuery(
      'SELECT id FROM insights WHERE id = ?',
      [id]
    );

    if (!insight) {
      return res.status(404).json({
        success: false,
        message: 'Insight not found'
      });
    }

    // Mark as read
    await executeQuery(
      'UPDATE insights SET is_read = TRUE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Insight marked as read'
    });

  } catch (error) {
    next(error);
  }
};

// Delete insight
const deleteInsight = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if insight exists and user has access
    const [insight] = await executeQuery(
      'SELECT analyst_id FROM insights WHERE id = ?',
      [id]
    );

    if (!insight) {
      return res.status(404).json({
        success: false,
        message: 'Insight not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin' && insight.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete insight
    await executeQuery(
      'DELETE FROM insights WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Insight deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Get insights summary
const getInsightsSummary = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    let whereClause = 'WHERE 1=1';
    let params = [];

    // Filter by user role
    if (role === 'analyst') {
      whereClause += ' AND analyst_id = ?';
      params.push(userId);
    } else if (role === 'client') {
      whereClause += ' AND company_id = ?';
      params.push(userId);
    }

    // Get summary by type
    const typesSummary = await executeQuery(
      `SELECT 
        type,
        COUNT(*) as total,
        SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) as unread
       FROM insights
       ${whereClause}
       GROUP BY type`,
      params
    );

    // Get summary by severity
    const severitySummary = await executeQuery(
      `SELECT 
        severity,
        COUNT(*) as total,
        SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) as unread
       FROM insights
       ${whereClause}
       GROUP BY severity`,
      params
    );

    // Get recent insights
    const recentInsights = await executeQuery(
      `SELECT 
        i.id, i.title, i.type, i.severity, i.created_at, i.is_read,
        c.company_name
       FROM insights i
       LEFT JOIN companies c ON i.company_id = c.id
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT 5`,
      params
    );

    res.json({
      success: true,
      data: {
        byType: typesSummary,
        bySeverity: severitySummary,
        recent: recentInsights
      }
    });

  } catch (error) {
    next(error);
  }
};

// Generate automatic insights (placeholder for AI/ML integration)
const generateInsights = async (req, res, next) => {
  try {
    const { company_id, chart_id } = req.body;
    const { id: analyst_id } = req.user;

    // This is a placeholder for automatic insight generation
    // In a real implementation, this would analyze data patterns and generate insights

    // For now, we'll create a sample insight
    const sampleInsights = [
      {
        title: 'Tendência de Crescimento Detectada',
        description: 'Os dados mostram um crescimento consistente de 15% nos últimos 3 meses.',
        type: 'trend',
        severity: 'medium'
      },
      {
        title: 'Anomalia nos Dados',
        description: 'Detectada variação atípica nos valores do último período.',
        type: 'anomaly',
        severity: 'high'
      },
      {
        title: 'Oportunidade de Melhoria',
        description: 'Identificada oportunidade de otimização baseada nos padrões atuais.',
        type: 'opportunity',
        severity: 'low'
      }
    ];

    const randomInsight = sampleInsights[Math.floor(Math.random() * sampleInsights.length)];

    const result = await executeQuery(
      `INSERT INTO insights (
        company_id, analyst_id, title, description, type, severity, data_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id,
        analyst_id,
        randomInsight.title,
        randomInsight.description,
        randomInsight.type,
        randomInsight.severity,
        JSON.stringify({ chart_id, generated: true, timestamp: new Date().toISOString() })
      ]
    );

    // Get created insight
    const [insight] = await executeQuery(
      `SELECT 
        i.*,
        c.company_name
       FROM insights i
       LEFT JOIN companies c ON i.company_id = c.id
       WHERE i.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Insight generated successfully',
      data: insight
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInsights,
  getInsightById,
  createInsight,
  updateInsight,
  markAsRead,
  deleteInsight,
  getInsightsSummary,
  generateInsights
};