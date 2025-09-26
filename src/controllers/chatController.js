const { executeQuery, executeTransaction } = require('../config/database');
const { emitNewMessage, emitRead } = require('../sockets/chatSocket');

// ajuda a entender quem é o ator no sistema
function getActor(req) {
  const { role, id: userId, companyId } = req.user || {};
  // Observações:
  // - role === 'analyst' -> userId = users.id
  // - role === 'client'  -> userId = companies.id (pelo seu padrão atual)
  // - role === 'company_user' -> userId = company_users.id, companyId = companies.id
  if (role === 'analyst') return { type: 'analyst', userId };
  if (role === 'client') return { type: 'company', companyId: userId }; // aqui userId = companies.id
  if (role === 'company_user') return { type: 'company_user', userId, companyId };
  if (role === 'admin') return { type: 'admin', userId };
  return { type: 'unknown' };
}

// garante que o usuário tem acesso à conversa
async function assertConversationAccess(conversationId, actor) {
  const [conv] = await executeQuery(
    `SELECT cc.*, c.company_name, u.name AS analyst_name
     FROM chat_conversations cc
     JOIN companies c ON c.id = cc.company_id
     JOIN users u ON u.id = cc.analyst_id
     WHERE cc.id = ?`,
    [conversationId]
  );
  if (!conv) return { error: 'Conversation not found' };

  const isAnalyst = actor.type === 'analyst' && actor.userId === conv.analyst_id;
  const isCompany = (actor.type === 'company' && actor.companyId === conv.company_id);
  const isCompanyUser = (actor.type === 'company_user' && actor.companyId === conv.company_id);
  const isAdmin = actor.type === 'admin';

  if (!isAnalyst && !isCompany && !isCompanyUser && !isAdmin) {
    return { error: 'Access denied' };
  }
  return { conv };
}

// cria ou retorna a conversa entre analista e empresa
// body: { companyId?, analystId? }
const ensureConversation = async (req, res, next) => {
  try {
    const actor = getActor(req);
    let { companyId, analystId } = req.body || {};

    if (actor.type === 'analyst') {
      if (!companyId) {
        return res.status(400).json({ success: false, message: 'companyId is required' });
      }
      analystId = actor.userId;
    } else if (actor.type === 'company') {
      // cliente logado: pegar analyst_id da empresa
      const [company] = await executeQuery('SELECT analyst_id FROM companies WHERE id = ?', [actor.companyId]);
      if (!company || !company.analyst_id) {
        return res.status(400).json({ success: false, message: 'Company has no analyst assigned' });
      }
      companyId = actor.companyId;
      analystId = company.analyst_id;
    } else if (actor.type === 'company_user') {
      const [company] = await executeQuery('SELECT analyst_id FROM companies WHERE id = ?', [actor.companyId]);
      if (!company || !company.analyst_id) {
        return res.status(400).json({ success: false, message: 'Company has no analyst assigned' });
      }
      companyId = actor.companyId;
      analystId = company.analyst_id;
    } else if (actor.type === 'admin') {
      if (!companyId || !analystId) {
        return res.status(400).json({ success: false, message: 'companyId and analystId are required' });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // tenta buscar existente
    const [existing] = await executeQuery(
      `SELECT * FROM chat_conversations 
       WHERE company_id = ? AND analyst_id = ? LIMIT 1`,
      [companyId, analystId]
    );

    if (existing) {
      return res.json({ success: true, data: existing });
    }

    // cria
    const result = await executeQuery(
      `INSERT INTO chat_conversations (company_id, analyst_id, title, last_message_at, is_active)
       VALUES (?, ?, 'Conversa', NOW(), TRUE)`,
      [companyId, analystId]
    );

    const [conv] = await executeQuery('SELECT * FROM chat_conversations WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: conv });
  } catch (error) {
    next(error);
  }
};


// SUBSTITUA a função listConversations por esta
const listConversations = async (req, res, next) => {
  try {
    const actor = getActor(req);

    // helper: cria conversas faltantes para um analista (uma por empresa)
    const ensureConversationsForAnalyst = async (analystId) => {
      const companies = await executeQuery(
        `SELECT id, company_name, email 
           FROM companies 
          WHERE analyst_id = ? 
            AND (is_active IS NULL OR is_active = TRUE)`,
        [analystId]
      );

      if (!companies.length) return;

      const existing = await executeQuery(
        `SELECT company_id 
           FROM chat_conversations 
          WHERE analyst_id = ?`,
        [analystId]
      );

      const existingSet = new Set(existing.map(r => r.company_id));
      const missing = companies.filter(c => !existingSet.has(c.id));

      if (missing.length) {
        const queries = missing.map(c => ({
          query: `INSERT INTO chat_conversations 
                    (company_id, analyst_id, title, last_message_at, is_active) 
                  VALUES (?, ?, 'Conversa', NOW(), TRUE)`,
          params: [c.id, analystId]
        }));
        await executeTransaction(queries);
      }
    };

    let rows = [];

    if (actor.type === 'analyst') {
      // 1) Garante que existe uma conversa para cada cliente do analista
      await ensureConversationsForAnalyst(actor.userId);

      // 2) Retorna a lista já com contadores/unread e último texto
      rows = await executeQuery(
        `SELECT cc.*, 
                c.company_name, c.email AS company_email,c.avatar AS company_logo_url,
                (SELECT content 
                   FROM chat_messages 
                  WHERE conversation_id = cc.id 
                  ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT created_at 
                   FROM chat_messages 
                  WHERE conversation_id = cc.id 
                  ORDER BY created_at DESC LIMIT 1) AS last_message_time,
                (SELECT COUNT(*) 
                   FROM chat_messages m 
                  WHERE m.conversation_id = cc.id 
                    AND m.is_read = FALSE 
                    AND m.sender_type IN ('company','company_user')) AS unread_count
           FROM chat_conversations cc
           JOIN companies c ON c.id = cc.company_id
          WHERE cc.analyst_id = ?
          ORDER BY COALESCE(last_message_time, cc.created_at) DESC`,
        [actor.userId]
      );

      return res.json({ success: true, data: rows });
    }

    if (actor.type === 'company' || actor.type === 'company_user') {
      // cliente/company_user: garante a conversa única com seu analista
      const companyId = actor.type === 'company' ? actor.companyId : actor.companyId;

      const [company] = await executeQuery(
        'SELECT analyst_id FROM companies WHERE id = ?',
        [companyId]
      );

      if (!company || !company.analyst_id) {
        return res.status(400).json({ success: false, message: 'Company has no analyst assigned' });
      }

      const [existing] = await executeQuery(
        `SELECT * 
           FROM chat_conversations 
          WHERE company_id = ? AND analyst_id = ? 
          LIMIT 1`,
        [companyId, company.analyst_id]
      );

      if (!existing) {
        await executeQuery(
          `INSERT INTO chat_conversations 
            (company_id, analyst_id, title, last_message_at, is_active)
           VALUES (?, ?, 'Conversa', NOW(), TRUE)`,
          [companyId, company.analyst_id]
        );
      }

      rows = await executeQuery(
        `SELECT cc.*, 
                u.name AS analyst_name, u.email AS analyst_email, u.avatar AS analyst_avatar,
                (SELECT content 
                   FROM chat_messages 
                  WHERE conversation_id = cc.id 
                  ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT created_at 
                   FROM chat_messages 
                  WHERE conversation_id = cc.id 
                  ORDER BY created_at DESC LIMIT 1) AS last_message_time,
                (SELECT COUNT(*) 
                   FROM chat_messages m 
                  WHERE m.conversation_id = cc.id 
                    AND m.is_read = FALSE 
                    AND m.sender_type = 'analyst') AS unread_count
           FROM chat_conversations cc
           JOIN users u ON u.id = cc.analyst_id
          WHERE cc.company_id = ?
          ORDER BY COALESCE(last_message_time, cc.created_at) DESC`,
        [companyId]
      );

      return res.json({ success: true, data: rows });
    }

    if (actor.type === 'admin') {
      rows = await executeQuery(
        `SELECT cc.*, c.company_name, u.name AS analyst_name
           FROM chat_conversations cc
           JOIN companies c ON c.id = cc.company_id
           JOIN users u ON u.id = cc.analyst_id
          ORDER BY cc.last_message_at DESC`
      );
      return res.json({ success: true, data: rows });
    }

    return res.status(403).json({ success: false, message: 'Unauthorized' });
  } catch (error) {
    next(error);
  }
};

// lista conversas do usuário logado
const listConversationsOLDA = async (req, res, next) => {
  try {
    const actor = getActor(req);

    let rows = [];
    if (actor.type === 'analyst') {
      rows = await executeQuery(
        `SELECT cc.*, c.company_name, c.email AS company_email,
                (SELECT content FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT created_at FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) AS last_message_time,
                (SELECT COUNT(*) FROM chat_messages m 
                  WHERE m.conversation_id = cc.id 
                    AND m.is_read = FALSE 
                    AND m.sender_type IN ('company','company_user')) AS unread_count
         FROM chat_conversations cc
         JOIN companies c ON c.id = cc.company_id
         WHERE cc.analyst_id = ?
         ORDER BY COALESCE(last_message_time, cc.created_at) DESC`,
        [actor.userId]
      );
    } else if (actor.type === 'company' || actor.type === 'company_user') {
      const companyId = actor.type === 'company' ? actor.companyId : actor.companyId;
      rows = await executeQuery(
        `SELECT cc.*, u.name AS analyst_name, u.email AS analyst_email,
                (SELECT content FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT created_at FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) AS last_message_time,
                (SELECT COUNT(*) FROM chat_messages m 
                  WHERE m.conversation_id = cc.id 
                    AND m.is_read = FALSE 
                    AND m.sender_type = 'analyst') AS unread_count
         FROM chat_conversations cc
         JOIN users u ON u.id = cc.analyst_id
         WHERE cc.company_id = ?
         ORDER BY COALESCE(last_message_time, cc.created_at) DESC`,
        [companyId]
      );
    } else if (actor.type === 'admin') {
      rows = await executeQuery(
        `SELECT cc.*, c.company_name, u.name AS analyst_name
         FROM chat_conversations cc
         JOIN companies c ON c.id = cc.company_id
         JOIN users u ON u.id = cc.analyst_id
         ORDER BY cc.last_message_at DESC`
      );
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const listMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const actor = getActor(req);

    const access = await assertConversationAccess(conversationId, actor);
    if (access.error) {
      return res.status(access.error === 'Conversation not found' ? 404 : 403).json({ success: false, message: access.error });
    }

    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const before = req.query.before ? new Date(req.query.before) : null;

    const params = [conversationId];
    let where = 'WHERE conversation_id = ?';
    if (before && !isNaN(before.getTime())) {
      where += ' AND created_at < ?';
      params.push(before);
    }

    const rows = await executeQuery(
      `SELECT * FROM chat_messages
       ${where}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
      params
    );

    res.json({ success: true, data: rows.reverse() });
  } catch (error) {
    next(error);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { message_type = 'text', content = '', file_url = null, file_name = null, file_size = null, reply_to_id = null } = req.body || {};
    const actor = getActor(req);

    const access = await assertConversationAccess(conversationId, actor);
    if (access.error) {
      return res.status(access.error === 'Conversation not found' ? 404 : 403).json({ success: false, message: access.error });
    }

    if (!content && !file_url) {
      return res.status(400).json({ success: false, message: 'Message content or file_url is required' });
    }

    const sender_type = actor.type === 'analyst' ? 'analyst'
      : actor.type === 'company' ? 'company'
        : actor.type === 'company_user' ? 'company_user'
          : 'analyst'; // admin envia como analyst por padrão (pode ajustar)

    const sender_id = actor.type === 'analyst' ? actor.userId
      : actor.type === 'company' ? access.conv.company_id
        : actor.type === 'company_user' ? actor.userId
          : actor.userId;

    const result = await executeQuery(
      `INSERT INTO chat_messages (conversation_id, sender_id, sender_type, message_type, content, file_url, file_name, file_size, reply_to_id, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [conversationId, sender_id, sender_type, message_type, content, file_url, file_name, file_size, reply_to_id]
    );

    // atualiza last_message_at
    await executeQuery(`UPDATE chat_conversations SET last_message_at = NOW() WHERE id = ?`, [conversationId]);

    const [msg] = await executeQuery(`SELECT * FROM chat_messages WHERE id = ?`, [result.insertId]);

    // emite pelo socket
    emitNewMessage(conversationId, msg);

    res.status(201).json({ success: true, data: msg });
  } catch (error) {
    next(error);
  }
};

// marca mensagens como lidas (as do "outro lado")
const markAsRead = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const actor = getActor(req);

    const access = await assertConversationAccess(conversationId, actor);
    if (access.error) {
      return res.status(access.error === 'Conversation not found' ? 404 : 403).json({ success: false, message: access.error });
    }

    // quem é o "outro lado"?
    let whereSender;
    if (actor.type === 'analyst') {
      whereSender = `sender_type IN ('company','company_user')`;
    } else if (actor.type === 'company' || actor.type === 'company_user') {
      whereSender = `sender_type = 'analyst'`;
    } else if (actor.type === 'admin') {
      // admin marca todas como lidas
      whereSender = `1=1`;
    } else {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const sql = `
      UPDATE chat_messages 
      SET is_read = TRUE, read_at = NOW()
      WHERE conversation_id = ?
        AND is_read = FALSE
        AND ${whereSender}
    `;
    await executeQuery(sql, [conversationId]);

    emitRead(conversationId, { conversationId, by: actor.type });

    res.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    next(error);
  }
};

const addCompanyUserParticipant = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const actor = getActor(req);

    if (actor.type !== 'company_user' && actor.type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only company_user or admin can join as participant' });
    }

    const access = await assertConversationAccess(conversationId, actor);
    if (access.error) {
      return res.status(access.error === 'Conversation not found' ? 404 : 403).json({ success: false, message: access.error });
    }

    // vincula
    await executeQuery(
      `INSERT IGNORE INTO chat_participants (conversation_id, user_id, user_type, joined_at, is_active)
       VALUES (?, ?, 'company_user', NOW(), TRUE)`,
      [conversationId, actor.userId]
    );

    res.json({ success: true, message: 'Participant added' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  ensureConversation,
  listConversations,
  listMessages,
  sendMessage,
  markAsRead,
  addCompanyUserParticipant,
};
