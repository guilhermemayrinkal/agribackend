const { executeQuery } = require('../config/database');

// Get alerts
const getAlerts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, priority, is_read, company_id } = req.query;
    const { role, id: userId } = req.user;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];

    // Filter by user role
    if (role === 'analyst') {
      whereClause += ' AND (a.analyst_id = ? OR c.analyst_id = ?)';
      params.push(userId, userId);
    } else if (role === 'client') {
      whereClause += ' AND a.company_id = ?';
      params.push(userId);
    }

    if (type) {
      whereClause += ' AND a.type = ?';
      params.push(type);
    }

    if (priority) {
      whereClause += ' AND a.priority = ?';
      params.push(priority);
    }

    if (is_read !== undefined) {
      whereClause += ' AND a.is_read = ?';
      params.push(is_read === 'true');
    }

    if (company_id) {
      whereClause += ' AND a.company_id = ?';
      params.push(company_id);
    }

    // Remove expired alerts
    whereClause += ' AND (a.expires_at IS NULL OR a.expires_at > NOW())';

    const alerts = await executeQuery(
      `SELECT 
        a.*,
        c.company_name,
        u.name as analyst_name
       FROM alerts a
       LEFT JOIN companies c ON a.company_id = c.id
       LEFT JOIN users u ON a.analyst_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total 
       FROM alerts a
       LEFT JOIN companies c ON a.company_id = c.id
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        alerts,
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

// Get alert by ID
const getAlertById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [alert] = await executeQuery(
      `SELECT 
        a.*,
        c.company_name,
        u.name as analyst_name
       FROM alerts a
       LEFT JOIN companies c ON a.company_id = c.id
       LEFT JOIN users u ON a.analyst_id = u.id
       WHERE a.id = ?`,
      [id]
    );

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    res.json({
      success: true,
      data: alert
    });

  } catch (error) {
    next(error);
  }
};

// Create new alert
const createAlert = async (req, res, next) => {
  try {
    const {
      company_id, type, title, message, priority = 'medium',
      category, expires_at
    } = req.body;

    const { id: analyst_id } = req.user;

    const result = await executeQuery(
      `INSERT INTO alerts (
        company_id, analyst_id, type, title, message, priority, category, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_id, analyst_id, type, title, message, priority, category, expires_at]
    );

    // Get created alert
    const [alert] = await executeQuery(
      `SELECT 
        a.*,
        c.company_name,
        u.name as analyst_name
       FROM alerts a
       LEFT JOIN companies c ON a.company_id = c.id
       LEFT JOIN users u ON a.analyst_id = u.id
       WHERE a.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Alert created successfully',
      data: alert
    });

  } catch (error) {
    next(error);
  }
};

// Update alert
const updateAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, message, type, priority, category, expires_at } = req.body;

    // Check if alert exists
    const [existingAlert] = await executeQuery(
      'SELECT id FROM alerts WHERE id = ?',
      [id]
    );

    if (!existingAlert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    // Update alert
    await executeQuery(
      `UPDATE alerts SET 
        title = ?, message = ?, type = ?, priority = ?, category = ?, expires_at = ?
       WHERE id = ?`,
      [title, message, type, priority, category, expires_at, id]
    );

    // Get updated alert
    const [alert] = await executeQuery(
      `SELECT 
        a.*,
        c.company_name,
        u.name as analyst_name
       FROM alerts a
       LEFT JOIN companies c ON a.company_id = c.id
       LEFT JOIN users u ON a.analyst_id = u.id
       WHERE a.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Alert updated successfully',
      data: alert
    });

  } catch (error) {
    next(error);
  }
};

// Mark alert as read
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if alert exists
    const [alert] = await executeQuery(
      'SELECT id FROM alerts WHERE id = ?',
      [id]
    );

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    // Mark as read
    await executeQuery(
      'UPDATE alerts SET is_read = TRUE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Alert marked as read'
    });

  } catch (error) {
    next(error);
  }
};

// Mark multiple alerts as read
const markMultipleAsRead = async (req, res, next) => {
  try {
    const { alertIds } = req.body;

    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Alert IDs array is required'
      });
    }

    // Create placeholders for IN clause
    const placeholders = alertIds.map(() => '?').join(',');

    await executeQuery(
      `UPDATE alerts SET is_read = TRUE WHERE id IN (${placeholders})`,
      alertIds
    );

    res.json({
      success: true,
      message: `${alertIds.length} alerts marked as read`
    });

  } catch (error) {
    next(error);
  }
};

// Delete alert
const deleteAlert = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if alert exists
    const [alert] = await executeQuery(
      'SELECT id FROM alerts WHERE id = ?',
      [id]
    );

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    // Delete alert
    await executeQuery(
      'DELETE FROM alerts WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Alert deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Get unread alerts count
const getUnreadCount = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    let whereClause = 'WHERE a.is_read = FALSE AND (a.expires_at IS NULL OR a.expires_at > NOW())';
    let params = [];

    // Filter by user role
    if (role === 'analyst') {
      whereClause += ' AND (a.analyst_id = ? OR c.analyst_id = ?)';
      params.push(userId, userId);
    } else if (role === 'client') {
      whereClause += ' AND a.company_id = ?';
      params.push(userId);
    }

    const [{ count }] = await executeQuery(
      `SELECT COUNT(*) as count 
       FROM alerts a
       LEFT JOIN companies c ON a.company_id = c.id
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: { unreadCount: count }
    });

  } catch (error) {
    next(error);
  }
};

// Get alerts summary
const getAlertsSummary = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    let whereClause = 'WHERE (a.expires_at IS NULL OR a.expires_at > NOW())';
    let params = [];

    // Filter by user role
    if (role === 'analyst') {
      whereClause += ' AND (a.analyst_id = ? OR c.analyst_id = ?)';
      params.push(userId, userId);
    } else if (role === 'client') {
      whereClause += ' AND a.company_id = ?';
      params.push(userId);
    }

    // Get summary by type
    const typesSummary = await executeQuery(
      `SELECT 
        a.type,
        COUNT(*) as total,
        SUM(CASE WHEN a.is_read = FALSE THEN 1 ELSE 0 END) as unread
       FROM alerts a
       LEFT JOIN companies c ON a.company_id = c.id
       ${whereClause}
       GROUP BY a.type`,
      params
    );

    // Get summary by priority
    const prioritySummary = await executeQuery(
      `SELECT 
        a.priority,
        COUNT(*) as total,
        SUM(CASE WHEN a.is_read = FALSE THEN 1 ELSE 0 END) as unread
       FROM alerts a
       LEFT JOIN companies c ON a.company_id = c.id
       ${whereClause}
       GROUP BY a.priority`,
      params
    );

    res.json({
      success: true,
      data: {
        byType: typesSummary,
        byPriority: prioritySummary
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAlerts,
  getAlertById,
  createAlert,
  updateAlert,
  markAsRead,
  markMultipleAsRead,
  deleteAlert,
  getUnreadCount,
  getAlertsSummary
};