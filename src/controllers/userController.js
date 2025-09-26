const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { executeQuery } = require('../config/database');

// helper para deletar arquivo com segurança
function safeUnlink(absPath) {
  try {
    if (absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch (_) { }
}

// Get all users (admin only)
const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];

    if (role) {
      whereClause += ' AND role = ?';
      params.push(role);
    }

    if (search) {
      whereClause += ' AND (name LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Get users with pagination
    const users = await executeQuery(
      `SELECT id, name, email, role, avatar, is_active, created_at, updated_at 
       FROM users ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        users,
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

// Get user by ID
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [user] = await executeQuery(
      'SELECT id, name, email, role, avatar, is_active, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    next(error);
  }
};

// Create new user
const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, avatar } = req.body;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await executeQuery(
      'INSERT INTO users (name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role, avatar || null]
    );

    // Get created user
    const [user] = await executeQuery(
      'SELECT id, name, email, role, avatar, is_active, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });

  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Se NÃO for admin, só permite editar o próprio perfil
    // (ajuste conforme sua auth: req.user.id / req.user.role)
    if (req.user && req.user.role !== 'admin' && String(req.user.id) !== String(id)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Busca usuário atual (precisamos do avatar antigo)
    const [existing] = await executeQuery(
      'SELECT id, name, email, role, avatar, is_active, phone, bio FROM users WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Dados do body (multipart + campos de texto)
    const {
      name,
      email,        // se quiser permitir alteração de email: só admin, ver abaixo
      role,         // também TIPICAMENTE só admin
      is_active,    // idem (admin)
      phone,
      bio,
      remove_avatar // '1' para remover avatar sem enviar outro
    } = req.body;

    // Lida com avatar novo / remoção
    let avatarPath = existing.avatar || null;

    // Se veio um novo arquivo
    if (req.file) {
      // Remove antigo, se houver
      if (existing.avatar) {
        const oldAbs = path.join(__dirname, '../../', existing.avatar.replace(/^\//, ''));
        safeUnlink(oldAbs);
      }
      avatarPath = `/uploads/avatars/${req.file.filename}`;
    } else if (remove_avatar === '1') {
      // Remoção explícita
      if (existing.avatar) {
        const oldAbs = path.join(__dirname, '../../', existing.avatar.replace(/^\//, ''));
        safeUnlink(oldAbs);
      }
      avatarPath = null;
    }

    // Monta atualização SOMENTE com os campos presentes
    const fields = [];
    const params = [];

    if (name !== undefined) { fields.push('name = ?'); params.push(name); }

    // Por segurança: email/role/is_active normalmente só admin pode alterar
    if (email !== undefined) {
      if (req.user && req.user.role === 'admin') { fields.push('email = ?'); params.push(email); }
      // se não for admin, ignora o email do body
    }
    if (role !== undefined) {
      if (req.user && req.user.role === 'admin') { fields.push('role = ?'); params.push(role); }
    }
    if (is_active !== undefined) {
      if (req.user && req.user.role === 'admin') { fields.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    }

    if (phone !== undefined) { fields.push('phone = ?'); params.push(phone); }
    if (bio !== undefined) { fields.push('bio = ?'); params.push(bio); }

    // Avatar pode ser null (remoção) ou string (novo caminho)
    if (req.file || remove_avatar === '1') {
      fields.push('avatar = ?');
      params.push(avatarPath);
    }

    if (fields.length === 0) {
      return res.json({ success: true, message: 'Nothing to update', data: existing });
    }

    fields.push('updated_at = NOW()');

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    params.push(id);

    await executeQuery(sql, params);

    const [user] = await executeQuery(
      'SELECT id, name, email, role, avatar, is_active, phone, bio, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// Update user
const updateUserOLLD = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role, avatar, is_active } = req.body;

    // Check if user exists
    const [existingUser] = await executeQuery(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user
    await executeQuery(
      'UPDATE users SET name = ?, email = ?, role = ?, avatar = ?, is_active = ? WHERE id = ?',
      [name, email, role, avatar || null, is_active, id]
    );

    // Get updated user
    const [user] = await executeQuery(
      'SELECT id, name, email, role, avatar, is_active, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });

  } catch (error) {
    next(error);
  }
};

// Update user password
const updatePassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const [user] = await executeQuery(
      'SELECT password FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await executeQuery(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedNewPassword, id]
    );

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Delete user
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const [user] = await executeQuery(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Soft delete - set is_active to false
    await executeQuery(
      'UPDATE users SET is_active = FALSE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};
const toggleUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    let { is_active } = req.body;

    if (typeof is_active === 'undefined') {
      return res.status(400).json({ success: false, message: 'is_active é obrigatório' });
    }

    // normaliza para 0/1
    const isActiveNum = (is_active === true || is_active === 'true' || is_active === 1 || is_active === '1') ? 1 : 0;

    const [user] = await executeQuery('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // ORDEM CORRETA: primeiro valor do SET, depois o id do WHERE
    await executeQuery('UPDATE users SET is_active = ? WHERE id = ?', [isActiveNum, id]);

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso.',
      data: { id, is_active: !!isActiveNum }
    });
  } catch (error) {
    next(error);
  }
};


// Update user's last seen timestamp
const updateLastSeen = async (req, res, next) => {
  try {
    const { id } = req.user;

    // Update last_seen timestamp
    await executeQuery(
      'UPDATE users SET last_seen = NOW() WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Last seen updated successfully'
    });

  } catch (error) {
    next(error);
  }
};


const getAnalysts = async (req, res, next) => {
  try {
    // Get analysts with online status and additional info
    const analysts = await executeQuery(
      `SELECT 
        id, name, email, avatar, phone, bio, last_seen,
        CASE 
          WHEN last_seen IS NULL THEN FALSE
          WHEN last_seen >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN TRUE 
          ELSE FALSE 
        END as is_online,
        (SELECT COUNT(*) FROM companies WHERE analyst_id = users.id AND is_active = TRUE) as companies_count
       FROM users 
       WHERE role = ? AND is_active = TRUE 
       ORDER BY is_online DESC, name ASC`,
      ['analyst']
    );

    res.json({
      success: true,
      data: analysts
    });

  } catch (error) {
    next(error);
  }
};

// Get analysts for assignment
const getAnalystsOLD = async (req, res, next) => {
  try {
    const analysts = await executeQuery(
      'SELECT id, name, email FROM users WHERE role = ? AND is_active = TRUE ORDER BY name',
      ['analyst']
    );

    res.json({
      success: true,
      data: analysts
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updatePassword,
  deleteUser,
  toggleUser,
  updateLastSeen,
  getAnalysts
};