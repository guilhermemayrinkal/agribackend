const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { executeQuery } = require('../config/database');


// Helper function to convert undefined to null for MySQL compatibility
const safeValue = (value) => value === undefined ? null : value;

// remove arquivo silenciosamente
function safeUnlink(absPath) {
  try {
    if (absPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch (_) { }
}

// Update profile for any user type
const updateProfile = async (req, res, next) => {
  try {
    const { id: authId, role, userType } = req.user;

    // Só permite client(company) OU company_user
    if (!((role === 'client' && userType === 'company') || role === 'company_user')) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    // Define tabela/colunas permitidas por tipo
    let table, selectable, allowedFields;

    if (role === 'client' && userType === 'company') {
      table = 'companies';
      allowedFields = ['name', 'email']; // adicione outras colunas da empresa aqui se existirem (ex: phone)
      selectable = 'id, name, email, avatar, created_at, updated_at';
    } else { // company_user
      table = 'company_users';
      allowedFields = ['name', 'email', 'phone', 'bio'];
      selectable = 'id, name, email, phone, bio, avatar, created_at, updated_at';
    }

    // Busca registro atual
    const [existing] = await executeQuery(
      `SELECT ${selectable} FROM ${table} WHERE id = ?`,
      [authId]
    );

    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Trata avatar: novo upload ou remoção explícita
    const removeAvatar =
      req.body.remove_avatar === '1' ||
      req.body.remove_avatar === 'true' ||
      req.body.remove_avatar === true;

    // Suporta upload.single('avatar') ou upload.fields([{name:'avatar'}])
    const uploadedFile = (req.files?.avatar?.[0]) || req.file || null;

    let newAvatarPath = existing.avatar || null;

    if (uploadedFile) {
      // apaga antigo
      if (existing.avatar) {
        const oldAbs = path.join(__dirname, '../../', existing.avatar.replace(/^\//, ''));
        safeUnlink(oldAbs);
      }
      newAvatarPath = `/uploads/avatars/${uploadedFile.filename}`;
    } else if (removeAvatar) {
      if (existing.avatar) {
        const oldAbs = path.join(__dirname, '../../', existing.avatar.replace(/^\//, ''));
        safeUnlink(oldAbs);
      }
      newAvatarPath = null;
    }

    // Monta SET dinâmico apenas com campos presentes no body
    const fields = [];
    const values = [];

    for (const key of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        // string vazia vira NULL (opcional; remova se não quiser esse comportamento)
        values.push(req.body[key] === '' ? null : req.body[key]);
        fields.push(`${key} = ?`);
      }
    }

    if (uploadedFile || removeAvatar) {
      fields.push('avatar = ?');
      values.push(newAvatarPath);
    }

    if (fields.length === 0) {
      // nada para atualizar
      return res.json({ success: true, message: 'Nothing to update', data: existing });
    }

    fields.push('updated_at = NOW()');
    values.push(authId);

    const sql = `UPDATE ${table} SET ${fields.join(', ')} WHERE id = ?`;
    await executeQuery(sql, values);

    const [updated] = await executeQuery(
      `SELECT ${selectable} FROM ${table} WHERE id = ?`,
      [authId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        ...updated,
        role,      // devolve o role do token
        userType   // devolve o userType do token
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update password for any user type
const updateProfilePassword = async (req, res, next) => {
  try {
    const { id, role, userType } = req.user;
    const { currentPassword, newPassword } = req.body;

    let selectQuery = '';
    let updateQuery = '';

    // Determine which table to query based on user type
    if (role === 'client' && userType === 'company') {
      selectQuery = 'SELECT password FROM companies WHERE id = ?';
      updateQuery = 'UPDATE companies SET password = ? WHERE id = ?';
    } else if (role === 'company_user') {
      selectQuery = 'SELECT password FROM company_users WHERE id = ?';
      updateQuery = 'UPDATE company_users SET password = ? WHERE id = ?';
    } else {
      selectQuery = 'SELECT password FROM users WHERE id = ?';
      updateQuery = 'UPDATE users SET password = ? WHERE id = ?';
    }

    // Get current password
    const [user] = await executeQuery(selectQuery, [id]);

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
    await executeQuery(updateQuery, [hashedNewPassword, id]);

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateProfile,
  updateProfilePassword
};