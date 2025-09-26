const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { generateToken, generateRefreshToken } = require('../config/jwt');
const { executeQuery, executeTransaction } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
// const { executeQuery, executeTransaction } = require('../config/database'); // já deve existir no arquivo

const buildVerifyUrl = (token) =>
  `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}`;


// Email configuration
const createEmailTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: false,                // 587 = STARTTLS
    requireTLS: true,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    auth: {
      user: process.env.BREVO_SMTP_USER, // ex: 'guilherme.mayrink@outlook.com'
      pass: process.env.BREVO_SMTP_PASS  // sua senha SMTP da Brevo
    },
    connectionTimeout: 20_000
  });
};

// Login user or company
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check in users table first (admin, analyst)
    let user = null;
    let userType = null;

    const [userRecord] = await executeQuery(
      'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
      [email]
    );

    if (userRecord) {
      user = userRecord;
      userType = 'user';
    } else {
      // Check in company_users table (company internal users)
      const [companyUserRecord] = await executeQuery(
        `SELECT 
          cu.*,
          c.company_name,
          c.cnpj,
          c.sector,
          c.business_type,
          c.analyst_id
         FROM company_users cu
         JOIN companies c ON cu.company_id = c.id
         WHERE cu.email = ? AND cu.is_active = TRUE AND c.is_active = TRUE`,
        [email]
      );

      if (companyUserRecord) {
        user = companyUserRecord;
        userType = 'company_user';
      } else {
        // Check in companies table (main company clients)
        const [companyRecord] = await executeQuery(
          'SELECT * FROM companies WHERE email = ? AND is_active = TRUE',
          [email]
        );

        if (companyRecord) {
          user = companyRecord;
          userType = 'company';
        }
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (userType === 'company' && !user.email_verified) {
      // dispara e-mail de verificação (evita dependência do front)
      try { await sendEmailVerification(user); } catch (_) { }

      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Você precisa confirmar seu e-mail para continuar. Enviamos um link de verificação.'
      });
    }

    // Generate tokens
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: userType === 'company' ? 'client' :
        userType === 'company_user' ? 'company_user' : user.role,
      userType: userType,
      companyId: userType === 'company_user' ? user.company_id :
        userType === 'company' ? user.id : null
    };

    const accessToken = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store refresh token in database
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Store refresh token in database with correct field mapping
    if (userType === 'company') {
      await executeQuery(
        `INSERT INTO sessions (id, company_id, refresh_token, user_agent, ip_address, expires_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          user.id,
          refreshToken,
          req.get('User-Agent') || null,
          req.ip || req.connection.remoteAddress,
          expiresAt
        ]
      );
    } else if (userType === 'company_user') {
      // For company users, we store a special session without foreign key constraints
      // We'll use a custom approach since company_users aren't in the users table
      await executeQuery(
        `INSERT INTO sessions (id, refresh_token, user_agent, ip_address, expires_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          sessionId,
          refreshToken,
          req.get('User-Agent') || null,
          req.ip || req.connection.remoteAddress,
          expiresAt
        ]
      );
    } else {
      // Regular users (admin, analyst)
      await executeQuery(
        `INSERT INTO sessions (id, user_id, refresh_token, user_agent, ip_address, expires_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          user.id,
          refreshToken,
          req.get('User-Agent') || null,
          req.ip || req.connection.remoteAddress,
          expiresAt
        ]
      );
    }

    // Prepare user data for response
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: userType === 'company' ? 'client' :
        userType === 'company_user' ? 'company_user' : user.role,
      avatar: user.avatar,
      createdAt: user.created_at,
      userType: userType
    };

    // Add company-specific data if client or company user
    if (userType === 'company' || userType === 'company_user') {
      userData.companyName = user.company_name;
      userData.cnpj = user.cnpj;
      userData.sector = user.sector;
      userData.businessType = user.business_type;
      userData.analystId = user.analyst_id;

      // Add company user specific data
      if (userType === 'company_user') {
        userData.companyId = user.company_id;
        userData.companyRole = user.role; // admin or user within company
        userData.permissions = {
          canViewReports: user.can_view_reports,
          canEditReports: user.can_edit_reports,
          canViewCharts: user.can_view_charts,
          canViewGoals: user.can_view_goals,
          canViewAlerts: user.can_view_alerts,
          canViewInsights: user.can_view_insights,
          canViewFinancialData: user.can_view_financial_data,
          canExportData: user.can_export_data
        };
      }
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    next(error);
  }
};

// Refresh access token
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    // Find session
    const [session] = await executeQuery(
      'SELECT * FROM sessions WHERE refresh_token = ? AND expires_at > NOW()',
      [refreshToken]
    );

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Get user data
    let user = null;
    let userType = null;

    if (session.user_id) {
      // Regular users (admin, analyst)
      const [userRecord] = await executeQuery(
        'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
        [session.user_id]
      );

      if (userRecord) {
        user = userRecord;
        userType = 'user';
      }
    } else if (session.company_id) {
      // Company clients
      const [companyRecord] = await executeQuery(
        'SELECT * FROM companies WHERE id = ? AND is_active = TRUE',
        [session.company_id]
      );
      user = companyRecord;
      userType = 'company';
    } else {
      // Company users - need to find by refresh token since we don't have foreign key
      // We'll need to decode the token to get the user info
      try {
        const { verifyToken } = require('../config/jwt');
        const decoded = verifyToken(refreshToken);

        if (decoded.userType === 'company_user') {
          const [companyUserRecord] = await executeQuery(
            `SELECT 
              cu.*,
              c.company_name,
              c.cnpj,
              c.sector,
              c.business_type,
              c.analyst_id
             FROM company_users cu
             JOIN companies c ON cu.company_id = c.id
             WHERE cu.id = ? AND cu.is_active = TRUE AND c.is_active = TRUE`,
            [decoded.id]
          );

          if (companyUserRecord) {
            user = companyUserRecord;
            userType = 'company_user';
          }
        }
      } catch (tokenError) {
        console.error('Error decoding refresh token:', tokenError);
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new access token
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: userType === 'company' ? 'client' :
        userType === 'company_user' ? 'company_user' : user.role,
      userType: userType,
      companyId: userType === 'company_user' ? user.company_id :
        userType === 'company' ? user.id : null
    };

    const accessToken = generateToken(tokenPayload);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken
      }
    });

  } catch (error) {
    next(error);
  }
};

// Logout user
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Remove refresh token from database
      await executeQuery(
        'DELETE FROM sessions WHERE refresh_token = ?',
        [refreshToken]
      );
    }

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    next(error);
  }
};

// Get current user profile
const getProfile = async (req, res, next) => {
  try {
    const { id, role, userType, companyId } = req.user;

    let user = null;

    if (role === 'client' && userType === 'company') {
      const [company] = await executeQuery(
        'SELECT * FROM companies WHERE id = ?',
        [id]
      );
      user = company;
    } else if (role === 'company_user') {
      const [companyUser] = await executeQuery(
        `SELECT 
          cu.*,
          c.company_name,
          c.cnpj,
          c.sector,
          c.business_type,
          c.analyst_id
         FROM company_users cu
         JOIN companies c ON cu.company_id = c.id
         WHERE cu.id = ?`,
        [id]
      );
      user = companyUser;
    } else {
      const [userRecord] = await executeQuery(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      user = userRecord;
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prepare user data
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: role,
      avatar: user.avatar,
      createdAt: user.created_at,
      userType: userType || (role === 'client' ? 'company' : 'user')
    };

    // Add company-specific data if client or company user
    if (role === 'client' || role === 'company_user') {
      userData.companyName = user.company_name;
      userData.cnpj = user.cnpj;
      userData.sector = user.sector;
      userData.businessType = user.business_type;
      userData.analystId = user.analyst_id;

      // Get subscription permissions for clients
      if (role === 'client') {
        try {
          const [subscription] = await executeQuery(
            `SELECT sp.permissions 
             FROM subscriptions s
             JOIN subscription_plans sp ON s.plan_id = sp.id
             WHERE s.company_id = ? AND s.status IN ('active', 'trialing')
             ORDER BY s.created_at DESC LIMIT 1`,
            [user.id]
          );

          console.log('SUBBB PERMI ' + subscription.permissions);

          if (subscription && subscription.permissions) {
            try {
              userData.subscriptionPermissions = JSON.parse(subscription.permissions);
            } catch (e) {
              // Default permissions if parsing fails
              userData.subscriptionPermissions = {
                canViewGoals: true,
                canViewAlerts: true,
                canViewInsights: false,
                canViewReports: true,
                canViewInventory: false,
                canViewArticles: true,
                canViewSubscription: true
              };
            }
          }
        } catch (error) {
          console.error('Error fetching subscription permissions:', error);
        }
      }

      // Add company user specific data
      if (role === 'company_user') {
        userData.companyId = user.company_id;
        userData.companyRole = user.role; // admin or user within company
        userData.permissions = {
          canViewReports: user.can_view_reports,
          canEditReports: user.can_edit_reports,
          canViewCharts: user.can_view_charts,
          canViewGoals: user.can_view_goals,
          canViewAlerts: user.can_view_alerts,
          canViewInsights: user.can_view_insights,
          canViewFinancialData: user.can_view_financial_data,
          canExportData: user.can_export_data
        };

        // Get subscription permissions for company users too
        try {
          const [subscription] = await executeQuery(
            `SELECT sp.permissions 
             FROM subscriptions s
             JOIN subscription_plans sp ON s.plan_id = sp.id
             WHERE s.company_id = ? AND s.status IN ('active', 'trialing')
             ORDER BY s.created_at DESC LIMIT 1`,
            [user.company_id]
          );

          if (subscription && subscription.permissions) {
            try {
              userData.subscriptionPermissions = JSON.parse(subscription.permissions);
            } catch (e) {
              userData.subscriptionPermissions = {
                canViewGoals: true,
                canViewAlerts: true,
                canViewInsights: false,
                canViewReports: true,
                canViewInventory: false,
                canViewArticles: true,
                canViewSubscription: false // Company users can't manage subscription
              };
            }
          }
        } catch (error) {
          console.error('Error fetching subscription permissions:', error);
        }
      }
    }

    res.json({
      success: true,
      data: userData
    });

  } catch (error) {
    next(error);
  }
};




const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Procura usuário nas três tabelas
    let user = null;
    let userType = null;

    const [userRecord] = await executeQuery(
      'SELECT id, name, email FROM users WHERE email = ? AND is_active = TRUE',
      [email]
    );

    if (userRecord) {
      user = userRecord;
      userType = 'user';
    } else {
      const [companyRecord] = await executeQuery(
        'SELECT id, name, email FROM companies WHERE email = ? AND is_active = TRUE',
        [email]
      );
      if (companyRecord) {
        user = companyRecord;
        userType = 'company';
      } else {
        const [companyUserRecord] = await executeQuery(
          'SELECT id, name, email FROM company_users WHERE email = ? AND is_active = TRUE',
          [email]
        );
        if (companyUserRecord) {
          user = companyUserRecord;
          userType = 'company_user';
        }
      }
    }

    // Sempre responde sucesso para não vazar existência de e-mail
    if (!user) {
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    // Gera token e hash
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    // Remove tokens antigos
    await executeQuery('DELETE FROM password_reset_tokens WHERE email = ?', [email]);

    // Salva novo token
    await executeQuery(
      `INSERT INTO password_reset_tokens (email, token, user_type, user_id, expires_at) 
       VALUES (?, ?, ?, ?, ?)`,
      [email, hashedToken, userType, user.id, expiresAt]
    );

    // Monta e envia e-mail (via Brevo)
    try {
      const transporter = createEmailTransporter();
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

      const appName = process.env.APP_NAME || 'AGRIPLAN';
      const fromEmail = process.env.MAIL_FROM || 'no-reply@agriplan.com.br'; // ideal: domínio verificado na Brevo

      const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #000; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">AGRIPLAN</h1>
              <p style="margin: 5px 0 0 0; font-size: 12px; letter-spacing: 2px;">CONSULTORIA</p>
            </div>
            
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333; margin-bottom: 20px;">Recuperação de Senha</h2>
              
              <p style="color: #666; line-height: 1.6;">
                Olá <strong>${user.name}</strong>,
              </p>
              
              <p style="color: #666; line-height: 1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta no AGRIPLAN.
                Se você não fez esta solicitação, pode ignorar este email.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background: #000; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                  Redefinir Senha
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px; line-height: 1.6;">
                Este link expira em 1 hora por segurança.<br>
                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                <a href="${resetUrl}" style="color: #007bff; word-break: break-all;">${resetUrl}</a>
              </p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              
              <p style="color: #999; font-size: 12px; text-align: center;">
                AGRIPLAN Consultoria - Inteligência Estruturada para o Campo<br>
                Este é um email automático, não responda.
              </p>
            </div>
          </div>
        `

      const text = `${appName} – Recuperação de Senha

Olá${user?.name ? `, ${user.name}` : ''}!

Recebemos uma solicitação para redefinir sua senha. Acesse o link abaixo (expira em 1 hora):

${resetUrl}

Se você não solicitou, ignore este e-mail.`;

      await transporter.sendMail({
        from: `${appName} <${fromEmail}>`,
        to: email,
        subject: `${appName} - Recuperação de Senha`,
        text,
        html,
        replyTo: fromEmail,
        headers: { 'X-App': appName, 'X-Template': 'password-reset' }
      });
      console.log(`Password reset email requested for: ${email}`);
    } catch (emailError) {
      console.error('Error sending reset email:', emailError?.message || emailError);
      // Mantém a resposta como sucesso por segurança
    }

    return res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });
  } catch (error) {
    next(error);
  }
};



// Request password reset
const requestPasswordResetBKP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    console.log('USERDemailemailemailS ' + email);

    // Find user in all tables
    let user = null;
    let userType = null;

    // Check users table (admin, analyst)
    const [userRecord] = await executeQuery(
      'SELECT id, name, email FROM users WHERE email = ? AND is_active = TRUE',
      [email]
    );

    if (userRecord) {
      user = userRecord;
      userType = 'user';
    } else {
      // Check companies table (clients)
      const [companyRecord] = await executeQuery(
        'SELECT id, name, email FROM companies WHERE email = ? AND is_active = TRUE',
        [email]
      );

      if (companyRecord) {
        user = companyRecord;
        userType = 'company';
      } else {
        // Check company_users table
        const [companyUserRecord] = await executeQuery(
          'SELECT id, name, email FROM company_users WHERE email = ? AND is_active = TRUE',
          [email]
        );

        if (companyUserRecord) {
          user = companyUserRecord;
          userType = 'company_user';
        }
      }
    }
    console.log('USERDS ' + JSON.stringify(user));
    // Always return success for security (don't reveal if email exists)
    if (!user) {
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing tokens for this user
    await executeQuery(
      'DELETE FROM password_reset_tokens WHERE email = ?',
      [email]
    );

    // Store reset token
    await executeQuery(
      `INSERT INTO password_reset_tokens (email, token, user_type, user_id, expires_at) 
       VALUES (?, ?, ?, ?, ?)`,
      [email, hashedToken, userType, user.id, expiresAt]
    );

    // Send email
    try {
      const transporter = createEmailTransporter();
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

      const mailOptions = {
        from: process.env.EMAIL_USER || 'noreply@agriplan.com.br',
        to: email,
        subject: 'AGRIPLAN - Recuperação de Senha',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #000; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">AGRIPLAN</h1>
              <p style="margin: 5px 0 0 0; font-size: 12px; letter-spacing: 2px;">CONSULTORIA</p>
            </div>
            
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333; margin-bottom: 20px;">Recuperação de Senha</h2>
              
              <p style="color: #666; line-height: 1.6;">
                Olá <strong>${user.name}</strong>,
              </p>
              
              <p style="color: #666; line-height: 1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta no AGRIPLAN.
                Se você não fez esta solicitação, pode ignorar este email.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background: #000; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                  Redefinir Senha
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px; line-height: 1.6;">
                Este link expira em 1 hora por segurança.<br>
                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                <a href="${resetUrl}" style="color: #007bff; word-break: break-all;">${resetUrl}</a>
              </p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              
              <p style="color: #999; font-size: 12px; text-align: center;">
                AGRIPLAN Consultoria - Inteligência Estruturada para o Campo<br>
                Este é um email automático, não responda.
              </p>
            </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`Password reset email sent to: ${email}`);
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      // Don't fail the request if email fails, for security
    }

    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });

  } catch (error) {
    next(error);
  }
};

// Reset password with token
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find valid token
    const [resetRecord] = await executeQuery(
      `SELECT * FROM password_reset_tokens 
       WHERE token = ? AND expires_at > NOW() AND used_at IS NULL`,
      [hashedToken]
    );

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password in appropriate table
    let updateQuery = '';
    if (resetRecord.user_type === 'user') {
      updateQuery = 'UPDATE users SET password = ? WHERE id = ?';
    } else if (resetRecord.user_type === 'company') {
      updateQuery = 'UPDATE companies SET password = ? WHERE id = ?';
    } else if (resetRecord.user_type === 'company_user') {
      updateQuery = 'UPDATE company_users SET password = ? WHERE id = ?';
    }

    await executeQuery(updateQuery, [hashedPassword, resetRecord.user_id]);

    // Mark token as used
    await executeQuery(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?',
      [resetRecord.id]
    );

    // Clean up expired tokens
    await executeQuery(
      'DELETE FROM password_reset_tokens WHERE expires_at < NOW()'
    );

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Envia o e-mail de verificação para a company
const sendEmailVerification = async (user) => {
  // já verificado? não reenviar (mas pode enviar se quiser, basta remover este early-return)
  console.log('USERRRRR ' + JSON.stringify(user));
  if (user.email_verified) return;
  console.log('USERRRRR ' + JSON.stringify(user.id));
  // 1) gera token (salvamos HASH no banco; enviamos token "limpo" por e-mail)
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  // 2) limpa tokens anteriores
  await executeQuery('DELETE FROM email_verification_tokens WHERE company_id = ?', [user.id]);

  // 3) persiste token
  await executeQuery(
    `INSERT INTO email_verification_tokens (email, token, company_id, expires_at) 
     VALUES (?, ?, ?, ?)`,
    [user.email, hashedToken, user.id, expiresAt]
  );

  // 4) envia e-mail
  const transporter = createEmailTransporter();
  const verifyUrl = buildVerifyUrl(rawToken);

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@agriplan.com.br',
    to: user.email,
    subject: 'Confirme seu e-mail - AGRIPLAN',
    text: `Olá ${user.name || user.company_name || ''},

Confirme seu e-mail clicando no link abaixo (válido por 24h):
${verifyUrl}

Se você não solicitou, ignore este e-mail.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
        <h2>Confirme seu e-mail</h2>
        <p>Olá ${user.name || user.company_name || ''},</p>
        <p>Para começar a usar a AGRIPLAN, confirme seu e-mail. Este link expira em 24 horas.</p>
        <p style="margin:24px 0">
          <a href="${verifyUrl}" 
             style="background:#16a34a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">
            Confirmar e-mail
          </a>
        </p>
        <p>Ou copie e cole esta URL no navegador: <br>
        <a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>Se você não solicitou, ignore este e-mail.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

// POST /auth/verify-email/request
const requestEmailVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Buscamos apenas em companies (client)
    const [company] = await executeQuery(
      `SELECT id, email, name, company_name, email_verified 
         FROM companies 
        WHERE email = ? LIMIT 1`,
      [email]
    );

    // Para evitar user enumeration, sempre respondemos success.
    if (company && !company.email_verified) {
      await sendEmailVerification(company);
    }

    return res.json({
      success: true,
      message: 'Se o e-mail existir, enviamos um link de verificação.'
    });
  } catch (err) {
    next(err);
  }
};

// POST /auth/verify-email/verify  (aceita token no body) 
// GET  /auth/verify-email/verify?token=... (também funciona)
const verifyEmailToken = async (req, res, next) => {
  try {
    const token = (req.body?.token || req.query?.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    const hashed = crypto.createHash('sha256').update(token).digest('hex');

    const [row] = await executeQuery(
      `SELECT * 
         FROM email_verification_tokens 
        WHERE token = ? 
          AND used_at IS NULL 
          AND expires_at > NOW()
        LIMIT 1`,
      [hashed]
    );

    if (!row) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // transação: marca a company como verificada e o token como utilizado
    await executeTransaction([
      {
        query: `UPDATE companies 
                   SET email_verified = TRUE, email_verified_at = NOW() 
                 WHERE id = ?`,
        params: [row.company_id]
      },
      {
        query: `UPDATE email_verification_tokens 
                   SET used_at = NOW() 
                 WHERE id = ?`,
        params: [row.id]
      },
      {
        // higiene: limpa outros tokens dessa company
        query: `DELETE FROM email_verification_tokens 
                 WHERE company_id = ? AND used_at IS NULL`,
        params: [row.company_id]
      }
    ]);

    return res.json({
      success: true,
      message: 'E-mail verificado com sucesso.'
    });
  } catch (err) {
    next(err);
  }
};



module.exports = {
  login,
  refreshToken,
  logout,
  getProfile,
  requestPasswordReset,
  resetPassword,
  sendEmailVerification,
  requestEmailVerification,
  verifyEmailToken
};