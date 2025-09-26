// backend/src/controllers/notificationController.js
const { v4: uuidv4 } = require('uuid');
const { executeQuery } = require('../config/database');

// Mapeia o tipo -> permissão do plano (quando destinatário for empresa)
const TYPE_TO_PERMISSION = {
  goal: 'canViewGoals',
  alert: 'canViewAlerts',
  insight: 'canViewInsights',
  report: 'canViewReports',
  inventory: 'canViewInventory',
  article: 'canViewArticles',
  subscription: 'canViewSubscription',
  system: null, // sempre permitido
};

// Busca permissões do plano ativo/trial da empresa (retorna objeto com booleans)
async function getCompanyPlanPermissions(companyId) {
  // Ajuste os nomes de colunas conforme seu schema
  const [row] = await executeQuery(
    `SELECT sp.permissions
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.company_id = ?
        AND s.status IN ('active','trialing')
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [companyId]
  );

  if (!row || !row.permissions) {
    // fallback permissivo para não quebrar funcionalidades antigas
    return {
      canViewGoals: true,
      canViewAlerts: true,
      canViewInsights: true,
      canViewReports: true,
      canViewInventory: true,
      canViewArticles: true,
      canViewSubscription: true
    };
  }

  try {
    return JSON.parse(row.permissions);
  } catch {
    return {
      canViewGoals: true,
      canViewAlerts: true,
      canViewInsights: true,
      canViewReports: true,
      canViewInventory: true,
      canViewArticles: true,
      canViewSubscription: true
    };
  }
}

/**
 * Cria um evento + entregas (para um ou mais destinatários).
 * recipients: array de objetos { recipient_type: 'company'|'company_user'|'analyst', recipient_id: string }
 */
async function createNotificationEvent({
  companyId = null,
  analystId = null,
  createdByType = 'system',
  createdById = null,
  type,
  title,
  message = '',
  linkUrl = null,
  data = null,
  recipients = []
}) {
  // Se o destinatário é empresa e o tipo exige permissão, checa o plano
  if (companyId && TYPE_TO_PERMISSION[type]) {
    const perms = await getCompanyPlanPermissions(companyId);
    const needed = TYPE_TO_PERMISSION[type];
    if (!perms[needed]) {
      // Plano não permite -> não cria entrega para empresa (mas pode notificar analista)
      recipients = recipients.filter(r => !(r.recipient_type === 'company' && r.recipient_id === companyId));
    }
  }

  // Se depois do filtro não sobrou ninguém, não cria nada
  if (!recipients.length) return null;

  // Cria evento
  const eventId = uuidv4();
  await executeQuery(
    `INSERT INTO notification_events
      (id, company_id, analyst_id, created_by_type, created_by_id, type, title, message, link_url, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      companyId,
      analystId,
      createdByType,
      createdById,
      type,
      title,
      message,
      linkUrl,
      data ? JSON.stringify(data) : null
    ]
  );

  // Cria entregas
  for (const r of recipients) {
    await executeQuery(
      `INSERT INTO notification_deliveries (id, event_id, recipient_type, recipient_id)
       VALUES (?, ?, ?, ?)`,
      [uuidv4(), eventId, r.recipient_type, r.recipient_id]
    );
  }

  return eventId;
}

// ============ ROTAS PÚBLICAS (para o app) ============

// Lista notificações do usuário logado
const listMyNotifications = async (req, res, next) => {
  try {
    const { role, id: userId, companyId } = req.user;
    const { unreadOnly, limit = 30, before } = req.query;

    const recipients = [];
    if (role === 'client') {
      // cliente (logado como empresa)
      recipients.push({ type: 'company', id: userId });
    } else if (role === 'company_user') {
      // company_user vê as dele e as da empresa
      recipients.push({ type: 'company_user', id: userId });
      if (companyId) recipients.push({ type: 'company', id: companyId });
    } else if (role === 'analyst') {
      recipients.push({ type: 'analyst', id: userId });
    } else if (role === 'admin') {
      // admin não tem recipient direto; pode ver nada ou tudo — aqui retornamos vazio por padrão
      return res.json({ success: true, data: [], pagination: { hasMore: false } });
    }

    // Monta WHERE para recipients
    const whereParts = recipients.map((r) => `(nd.recipient_type = ? AND nd.recipient_id = ?)`);
    const params = recipients.flatMap((r) => [r.type, r.id]);

    if (unreadOnly === '1') {
      whereParts.push(`nd.is_read = FALSE AND nd.is_archived = FALSE`);
    } else {
      whereParts.push(`nd.is_archived = FALSE`);
    }

    if (before) {
      whereParts.push(`nd.created_at < ?`);
      params.push(new Date(before));
    }

    const sql = `
      SELECT
        nd.id as delivery_id,
        nd.is_read, nd.read_at, nd.created_at as delivered_at,
        ne.id as event_id, ne.type, ne.title, ne.message, ne.link_url, ne.data, ne.created_at as event_created_at
      FROM notification_deliveries nd
      JOIN notification_events ne ON ne.id = nd.event_id
      WHERE ${whereParts.join(' AND ')}
      ORDER BY nd.created_at DESC
      LIMIT ?
    `;

    params.push(Number(limit));

    const rows = await executeQuery(sql, params);

    // Parse data JSON
    rows.forEach(r => {
      try { r.data = r.data ? JSON.parse(r.data) : null; } catch { r.data = null; }
    });

    res.json({
      success: true,
      data: rows,
      pagination: { hasMore: rows.length === Number(limit) }
    });
  } catch (err) {
    next(err);
  }
};

// Contagem de não lidas
const unreadCount = async (req, res, next) => {
  try {
    const { role, id: userId, companyId } = req.user;

    const recipients = [];
    if (role === 'client') {
      recipients.push({ type: 'company', id: userId });
    } else if (role === 'company_user') {
      recipients.push({ type: 'company_user', id: userId });
      if (companyId) recipients.push({ type: 'company', id: companyId });
    } else if (role === 'analyst') {
      recipients.push({ type: 'analyst', id: userId });
    } else {
      return res.json({ success: true, data: { count: 0 } });
    }

    const whereParts = recipients.map((r) => `(recipient_type = ? AND recipient_id = ?)`);
    const params = recipients.flatMap((r) => [r.type, r.id]);
    const sql = `
      SELECT COUNT(*) as cnt
        FROM notification_deliveries
       WHERE (${whereParts.join(' OR ')})
         AND is_archived = FALSE
         AND is_read = FALSE
    `;

    const [row] = await executeQuery(sql, params);
    res.json({ success: true, data: { count: row ? row.cnt : 0 } });
  } catch (err) {
    next(err);
  }
};

// Marcar como lida
const markAsRead = async (req, res, next) => {
  try {
    const { role, id: userId, companyId } = req.user;
    const { id } = req.params; // delivery_id

    // Garante que essa entrega pertence ao usuário
    const [d] = await executeQuery(
      `SELECT recipient_type, recipient_id FROM notification_deliveries WHERE id = ?`,
      [id]
    );
    if (!d) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const permitted =
      (role === 'client' && d.recipient_type === 'company' && d.recipient_id === userId) ||
      (role === 'company_user' && (
        (d.recipient_type === 'company_user' && d.recipient_id === userId) ||
        (d.recipient_type === 'company' && d.recipient_id === companyId)
      )) ||
      (role === 'analyst' && d.recipient_type === 'analyst' && d.recipient_id === userId);

    if (!permitted) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await executeQuery(
      `UPDATE notification_deliveries SET is_read = TRUE, read_at = NOW() WHERE id = ?`,
      [id]
    );

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    next(err);
  }
};

// Marcar todas como lidas
const markAllAsRead = async (req, res, next) => {
  try {
    const { role, id: userId, companyId } = req.user;

    const recipients = [];
    if (role === 'client') {
      recipients.push({ type: 'company', id: userId });
    } else if (role === 'company_user') {
      recipients.push({ type: 'company_user', id: userId });
      if (companyId) recipients.push({ type: 'company', id: companyId });
    } else if (role === 'analyst') {
      recipients.push({ type: 'analyst', id: userId });
    } else {
      return res.json({ success: true, message: 'No notifications' });
    }

    const whereParts = recipients.map((r) => `(recipient_type = ? AND recipient_id = ?)`);
    const params = recipients.flatMap((r) => [r.type, r.id]);

    const sql = `
      UPDATE notification_deliveries
         SET is_read = TRUE, read_at = NOW()
       WHERE (${whereParts.join(' OR ')})
         AND is_archived = FALSE
         AND is_read = FALSE
    `;

    await executeQuery(sql, params);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
};

// Arquivar (soft-delete)
const archiveNotification = async (req, res, next) => {
  try {
    const { role, id: userId, companyId } = req.user;
    const { id } = req.params;

    const [d] = await executeQuery(
      `SELECT recipient_type, recipient_id FROM notification_deliveries WHERE id = ?`,
      [id]
    );
    if (!d) return res.status(404).json({ success: false, message: 'Notification not found' });

    const permitted =
      (role === 'client' && d.recipient_type === 'company' && d.recipient_id === userId) ||
      (role === 'company_user' && (
        (d.recipient_type === 'company_user' && d.recipient_id === userId) ||
        (d.recipient_type === 'company' && d.recipient_id === companyId)
      )) ||
      (role === 'analyst' && d.recipient_type === 'analyst' && d.recipient_id === userId);

    if (!permitted) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await executeQuery(
      `UPDATE notification_deliveries SET is_archived = TRUE WHERE id = ?`,
      [id]
    );

    res.json({ success: true, message: 'Notification archived' });
  } catch (err) {
    next(err);
  }
};

// (Opcional) endpoint para criar eventos manualmente (útil para testes)
const createManual = async (req, res, next) => {
  try {
    const {
      companyId, analystId, createdByType = 'system', createdById = null,
      type, title, message, linkUrl, data, recipients
    } = req.body;

    const eventId = await createNotificationEvent({
      companyId, analystId, createdByType, createdById,
      type, title, message, linkUrl, data, recipients: recipients || []
    });

    res.status(201).json({ success: true, data: { eventId } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listMyNotifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  archiveNotification,
  // helper p/ outros controllers chamarem
  createNotificationEvent,
  // teste manual
  createManual,
};
