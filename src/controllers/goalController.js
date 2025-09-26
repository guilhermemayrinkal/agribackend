const { v4: uuidv4 } = require('uuid');
const { executeQuery } = require('../config/database');
const { createNotificationEvent } = require('./notificationController');

// Get goals by company
const getGoalsByCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { category, status } = req.query;

    let whereClause = 'WHERE company_id = ?';
    let params = [companyId];

    if (category) {
      whereClause += ' AND category = ?';
      params.push(category);
    }

    if (status === 'completed') {
      whereClause += ' AND is_completed = TRUE';
    } else if (status === 'active') {
      whereClause += ' AND is_completed = FALSE AND deadline >= CURDATE()';
    } else if (status === 'overdue') {
      whereClause += ' AND is_completed = FALSE AND deadline < CURDATE()';
    }

    const goals = await executeQuery(
      `SELECT 
        *,
        ROUND((current_value / target_value) * 100, 2) as progress_percentage,
        CASE 
          WHEN is_completed = TRUE THEN 'completed'
          WHEN deadline < CURDATE() THEN 'overdue'
          WHEN deadline <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'approaching'
          ELSE 'active'
        END as status
       FROM goals 
       ${whereClause}
       ORDER BY deadline ASC`,
      params
    );

    res.json({
      success: true,
      data: goals
    });

  } catch (error) {
    next(error);
  }
};

// Get goal by ID
const getGoalById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [goal] = await executeQuery(
      `SELECT 
        g.*,
        c.company_name,
        ROUND((g.current_value / g.target_value) * 100, 2) as progress_percentage,
        CASE 
          WHEN g.is_completed = TRUE THEN 'completed'
          WHEN g.deadline < CURDATE() THEN 'overdue'
          WHEN g.deadline <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'approaching'
          ELSE 'active'
        END as status
       FROM goals g
       JOIN companies c ON g.company_id = c.id
       WHERE g.id = ?`,
      [id]
    );

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }

    res.json({
      success: true,
      data: goal
    });

  } catch (error) {
    next(error);
  }
};


const createGoal = async (req, res, next) => {
  try {
    const {
      company_id,
      title,
      description,
      target_value,
      current_value = 0,
      unit,
      deadline,     // esperado em 'YYYY-MM-DD' (ou Date convertível)
      category
    } = req.body;

    // Gere o ID aqui (UUID), pois a tabela não é AUTO_INCREMENT
    const goalId = uuidv4();

    // Normalize valores numéricos (evita string indo pro banco)
    const targetVal = target_value != null ? Number(target_value) : null;
    const currentVal = current_value != null ? Number(current_value) : 0;

    // Opcional: normalizar data (YYYY-MM-DD)
    const deadlineSql =
      deadline ? new Date(deadline).toISOString().slice(0, 10) : null;

    // INSERT com o ID explícito
    await executeQuery(
      `INSERT INTO goals (
         id, company_id, title, description,
         target_value, current_value, unit, deadline, category
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        goalId,
        company_id,
        title,
        description || null,
        targetVal,
        currentVal,
        unit || null,
        deadlineSql,
        category || null
      ]
    );

    // Buscar o registro criado (agora usando o goalId que sabemos)
    const [goal] = await executeQuery(
      `SELECT 
         g.*,
         ROUND((g.current_value / NULLIF(g.target_value,0)) * 100, 2) AS progress_percentage
       FROM goals g
       WHERE g.id = ?`,
      [goalId]
    );

    // Cria notificação para empresa e (opcional) para o analista logado
    await createNotificationEvent({
      companyId: company_id,
      analystId: req.user?.role === 'analyst' ? req.user.id : null,
      createdByType: req.user?.role === 'analyst' ? 'analyst' : 'system',
      createdById: req.user?.id || null,
      type: 'goal',
      title: 'Nova meta criada',
      message: `A meta "${title}" foi criada.`,
      linkUrl: `${process.env.FRONTEND_URL}/client/goals/${goalId}`,
      data: { goalId },
      recipients: [
        { recipient_type: 'company', recipient_id: company_id },
        ...(req.user?.role === 'analyst'
          ? [{ recipient_type: 'analyst', recipient_id: req.user.id }]
          : [])
      ]
    });

    return res.status(201).json({
      success: true,
      message: 'Goal created successfully',
      data: goal
    });

  } catch (error) {
    next(error);
  }
};

// Create new goal
const createGoalOOOD = async (req, res, next) => {
  try {
    const {
      company_id, title, description, target_value, current_value = 0,
      unit, deadline, category
    } = req.body;

    const result = await executeQuery(
      `INSERT INTO goals (
        company_id, title, description, target_value, current_value, unit, deadline, category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_id, title, description, target_value, current_value, unit, deadline, category]
    );

    console.log('RESULL GOAL ' + JSON.stringify(result));

    // Get created goal
    const [goal] = await executeQuery(
      `SELECT 
        *,
        ROUND((current_value / target_value) * 100, 2) as progress_percentage
       FROM goals 
       WHERE id = ?`,
      [result.insertId]
    );

    await createNotificationEvent({
      companyId: company_id,
      analystId: req.user.id,             // se quiser notificar o analista também
      createdByType: 'analyst',
      createdById: req.user.id,
      type: 'goal',
      title: 'Nova meta criada',
      message: `A meta "${goal.title}" foi criada.`,
      linkUrl: `${process.env.FRONTEND_URL}/client/goals/${goal.id}`,
      data: { goalId: goal.id },
      recipients: [
        { recipient_type: 'company', recipient_id: company_id },
        { recipient_type: 'analyst', recipient_id: req.user.id }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Goal created successfully',
      data: goal
    });

  } catch (error) {
    next(error);
  }
};

// Update goal
const updateGoal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title, description, target_value, current_value, unit, deadline, category, is_completed
    } = req.body;

    // Check if goal exists
    const [existingGoal] = await executeQuery(
      'SELECT id FROM goals WHERE id = ?',
      [id]
    );

    if (!existingGoal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }

    // Update goal
    await executeQuery(
      `UPDATE goals SET 
        title = ?, description = ?, target_value = ?, current_value = ?, 
        unit = ?, deadline = ?, category = ?, is_completed = ?
       WHERE id = ?`,
      [title, description, target_value, current_value, unit, deadline, category, is_completed, id]
    );

    // Get updated goal
    const [goal] = await executeQuery(
      `SELECT 
        *,
        ROUND((current_value / target_value) * 100, 2) as progress_percentage,
        CASE 
          WHEN is_completed = TRUE THEN 'completed'
          WHEN deadline < CURDATE() THEN 'overdue'
          WHEN deadline <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'approaching'
          ELSE 'active'
        END as status
       FROM goals 
       WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Goal updated successfully',
      data: goal
    });

  } catch (error) {
    next(error);
  }
};

// Update goal progress
const updateGoalProgress = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { current_value } = req.body;

    // Check if goal exists
    const [existingGoal] = await executeQuery(
      'SELECT target_value FROM goals WHERE id = ?',
      [id]
    );

    if (!existingGoal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }

    // Check if goal should be marked as completed
    const is_completed = current_value >= existingGoal.target_value;

    // Update goal progress
    await executeQuery(
      'UPDATE goals SET current_value = ?, is_completed = ? WHERE id = ?',
      [current_value, is_completed, id]
    );

    // Get updated goal
    const [goal] = await executeQuery(
      `SELECT 
        *,
        ROUND((current_value / target_value) * 100, 2) as progress_percentage,
        CASE 
          WHEN is_completed = TRUE THEN 'completed'
          WHEN deadline < CURDATE() THEN 'overdue'
          WHEN deadline <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'approaching'
          ELSE 'active'
        END as status
       FROM goals 
       WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Goal progress updated successfully',
      data: goal
    });

  } catch (error) {
    next(error);
  }
};

// Delete goal
const deleteGoal = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if goal exists
    const [goal] = await executeQuery(
      'SELECT id FROM goals WHERE id = ?',
      [id]
    );

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }

    // Delete goal
    await executeQuery(
      'DELETE FROM goals WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Goal deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Get goal categories
const getGoalCategories = async (req, res, next) => {
  try {
    const categories = await executeQuery(
      'SELECT DISTINCT category FROM goals ORDER BY category'
    );

    res.json({
      success: true,
      data: categories.map(c => c.category)
    });

  } catch (error) {
    next(error);
  }
};

// Get goals summary
const getGoalsSummary = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    const [summary] = await executeQuery(
      `SELECT 
        COUNT(*) as total_goals,
        SUM(CASE WHEN is_completed = TRUE THEN 1 ELSE 0 END) as completed_goals,
        SUM(CASE WHEN is_completed = FALSE AND deadline >= CURDATE() THEN 1 ELSE 0 END) as active_goals,
        SUM(CASE WHEN is_completed = FALSE AND deadline < CURDATE() THEN 1 ELSE 0 END) as overdue_goals,
        AVG(current_value / target_value * 100) as average_progress
       FROM goals 
       WHERE company_id = ?`,
      [companyId]
    );

    // Get goals by category
    const categoryBreakdown = await executeQuery(
      `SELECT 
        category,
        COUNT(*) as total,
        SUM(CASE WHEN is_completed = TRUE THEN 1 ELSE 0 END) as completed,
        AVG(current_value / target_value * 100) as avg_progress
       FROM goals 
       WHERE company_id = ?
       GROUP BY category
       ORDER BY category`,
      [companyId]
    );

    res.json({
      success: true,
      data: {
        summary: {
          ...summary,
          average_progress: Math.round(summary.average_progress || 0)
        },
        categoryBreakdown
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getGoalsByCompany,
  getGoalById,
  createGoal,
  updateGoal,
  updateGoalProgress,
  deleteGoal,
  getGoalCategories,
  getGoalsSummary
};