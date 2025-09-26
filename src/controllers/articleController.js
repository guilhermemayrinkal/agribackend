const { executeQuery, executeTransaction } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Helper function to convert undefined to null for MySQL compatibility
const safeValue = (value) => value === undefined ? null : value;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/articles');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'pdf' && file.mimetype === 'application/pdf') {
      cb(null, true);
    } else if (file.fieldname === 'cover' && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

const getArticles = async (req, res, next) => {
  try {
    // normaliza números
    const pageNum = parseInt(req.query.page ?? 1, 10);
    const limitNum = parseInt(req.query.limit ?? 12, 10);
    const { category, search } = req.query;
    const { role, id: userId, companyId } = req.user;

    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE 1=1';
    const params = [];

    // Somente publicados para não-admin
    if (role !== 'admin') {
      whereClause += ' AND a.is_published = TRUE';
    }

    // Filtro por categoria (aceita id numérico OU nome)
    if (category) {
      const cat = String(category).trim();
      const isNumericId = /^[0-9]+$/.test(cat);
      if (isNumericId) {
        whereClause += ' AND ac.id = ?';
        params.push(parseInt(cat, 10));
      } else {
        whereClause += ' AND ac.name = ?';
        params.push(cat);
      }
    }

    // Busca por título/resumo
    if (search) {
      whereClause += ' AND (a.title LIKE ? OR a.summary LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // alvo para interações
    const targetCompanyId =
      role === 'company_user' ? companyId :
        role === 'client' ? userId : null;

    const targetUserId = role === 'company_user' ? userId : null;

    // Joins fixos
    const baseJoins = `
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN article_categories ac ON a.category = ac.id
    `;

    // Join condicional de interações
    const interactionsJoin = targetCompanyId ? `
      LEFT JOIN article_interactions ai ON a.id = ai.article_id
        AND ai.company_id = ?
        ${targetUserId ? 'AND ai.company_user_id = ?' : 'AND ai.company_user_id IS NULL'}
    ` : '';

    // Se houver join de interações, os parâmetros de company/user vêm primeiro
    const headParams = [];
    if (targetCompanyId) {
      headParams.push(targetCompanyId);
      if (targetUserId) headParams.push(targetUserId);
    }

    // Query principal
    const articles = await executeQuery(
      `
      SELECT
        a.*,
        u.name AS author_name,
        ac.name AS category,            -- <<< retorna o NOME da categoria (sobrescreve o id)
        ${targetCompanyId ? `
        ai.is_favorited,
        ai.is_read,
        ai.read_at,
        ai.favorited_at
        ` : `
        FALSE AS is_favorited,
        FALSE AS is_read,
        NULL AS read_at,
        NULL AS favorited_at
        `}
      FROM articles a
      ${interactionsJoin}
      ${baseJoins}
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...headParams, ...params, limitNum, offset]
    );

    // Total para paginação (precisa do join com categorias para respeitar o filtro por nome/id)
    const [{ total }] = await executeQuery(
      `
      SELECT COUNT(*) AS total
      FROM articles a
      ${baseJoins}
      ${whereClause}
      `,
      params
    );

    res.json({
      success: true,
      data: {
        articles,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: Number(total),
          pages: Math.ceil(Number(total) / limitNum) || 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};


// Get all articles (published only for clients)
const getArticlesBKPP = async (req, res, next) => {
  try {
    const { page = 1, limit = 12, category, search } = req.query;
    const { role, id: userId, companyId } = req.user;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];

    // Only show published articles to non-admin users
    if (role !== 'admin') {
      whereClause += ' AND a.is_published = TRUE';
    }

    if (category) {
      whereClause += ' AND a.category = ?';
      params.push(category);
    }

    if (search) {
      whereClause += ' AND (a.title LIKE ? OR a.summary LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Get articles with author info and interaction status
    const targetCompanyId = role === 'company_user' ? companyId :
      role === 'client' ? userId : null;
    const targetUserId = role === 'company_user' ? userId : null;

    const articles = await executeQuery(
      `SELECT 
        a.*,
        u.name as author_name,
        ${targetCompanyId ? `
        ai.is_favorited,
        ai.is_read,
        ai.read_at,
        ai.favorited_at
        ` : `
        FALSE as is_favorited,
        FALSE as is_read,
        NULL as read_at,
        NULL as favorited_at
        `}
       FROM articles a
       LEFT JOIN users u ON a.author_id = u.id
       ${targetCompanyId ? `
       LEFT JOIN article_interactions ai ON a.id = ai.article_id 
         AND ai.company_id = '${targetCompanyId}'
         ${targetUserId ? `AND ai.company_user_id = '${targetUserId}'` : 'AND ai.company_user_id IS NULL'}
       ` : ''}
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total FROM articles a ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        articles,
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

// Get article by ID
const getArticleById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId, companyId } = req.user;

    const targetCompanyId = role === 'company_user' ? companyId :
      role === 'client' ? userId : null;
    const targetUserId = role === 'company_user' ? userId : null;

    const [article] = await executeQuery(
      `SELECT 
        a.*,
        u.name as author_name,
        ${targetCompanyId ? `
        ai.is_favorited,
        ai.is_read,
        ai.read_at,
        ai.favorited_at
        ` : `
        FALSE as is_favorited,
        FALSE as is_read,
        NULL as read_at,
        NULL as favorited_at
        `}
       FROM articles a
       LEFT JOIN users u ON a.author_id = u.id
       ${targetCompanyId ? `
       LEFT JOIN article_interactions ai ON a.id = ai.article_id 
         AND ai.company_id = '${targetCompanyId}'
         ${targetUserId ? `AND ai.company_user_id = '${targetUserId}'` : 'AND ai.company_user_id IS NULL'}
       ` : ''}
       WHERE a.id = ? ${role !== 'admin' ? 'AND a.is_published = TRUE' : ''}`,
      [id]
    );

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Increment view count
    await executeQuery(
      'UPDATE articles SET views_count = views_count + 1 WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      data: article
    });

  } catch (error) {
    next(error);
  }
};

// Create new article (admin only)
const createArticle = async (req, res, next) => {
  try {
    const { title, summary, description, category, is_published = false } = req.body;
    const { id: author_id } = req.user;

    // Handle file uploads
    let pdf_url = null;
    let cover_image = null;

    if (req.files) {
      if (req.files.pdf) {
        pdf_url = `/uploads/articles/${req.files.pdf[0].filename}`;
      }
      if (req.files.cover) {
        cover_image = `/uploads/articles/${req.files.cover[0].filename}`;
      }
    }

    const result = await executeQuery(
      `INSERT INTO articles (
        title, summary, description, pdf_url, cover_image, category, author_id, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, summary, description, pdf_url, cover_image, category, author_id, 0]
      // [title, summary, description, pdf_url, cover_image, category, author_id, is_published]
    );

    // Get created article
    const [article] = await executeQuery(
      `SELECT a.*, u.name as author_name
       FROM articles a
       LEFT JOIN users u ON a.author_id = u.id
       WHERE a.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Article created successfully',
      data: article
    });

  } catch (error) {
    next(error);
  }
};

// Update article (admin only)
const updateArticle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, summary, description, category, is_published } = req.body;

    // Check if article exists
    const [existingArticle] = await executeQuery(
      'SELECT id, pdf_url, cover_image FROM articles WHERE id = ?',
      [id]
    );

    if (!existingArticle) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Handle file uploads
    let pdf_url = existingArticle.pdf_url;
    let cover_image = existingArticle.cover_image;
    let descriptioncont = existingArticle.description && description == '' ? existingArticle.description : null;
    if (req.files) {
      if (req.files.pdf) {
        // Delete old PDF if exists
        if (existingArticle.pdf_url) {
          const oldPdfPath = path.join(__dirname, '../../', existingArticle.pdf_url);
          if (fs.existsSync(oldPdfPath)) {
            fs.unlinkSync(oldPdfPath);
          }
        }
        pdf_url = `/uploads/articles/${req.files.pdf[0].filename}`;
      }
      if (req.files.cover) {
        // Delete old cover if exists
        if (existingArticle.cover_image) {
          const oldCoverPath = path.join(__dirname, '../../', existingArticle.cover_image);
          if (fs.existsSync(oldCoverPath)) {
            fs.unlinkSync(oldCoverPath);
          }
        }
        cover_image = `/uploads/articles/${req.files.cover[0].filename}`;
      }
    }

    // Update article
    await executeQuery(
      `UPDATE articles SET 
        title = ?, summary = ?, description = ?, pdf_url = ?, cover_image = ?, 
        category = ?, is_published = ?
       WHERE id = ?`,
      [title, summary, descriptioncont, pdf_url, cover_image, category, is_published, id]
    );

    // Get updated article
    const [article] = await executeQuery(
      `SELECT a.*, u.name as author_name
       FROM articles a
       LEFT JOIN users u ON a.author_id = u.id
       WHERE a.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Article updated successfully',
      data: article
    });

  } catch (error) {
    next(error);
  }
};

// Delete article (admin only)
const deleteArticle = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get article to delete files
    const [article] = await executeQuery(
      'SELECT pdf_url, cover_image FROM articles WHERE id = ?',
      [id]
    );

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Delete files
    if (article.pdf_url) {
      const pdfPath = path.join(__dirname, '../../', article.pdf_url);
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    }

    if (article.cover_image) {
      const coverPath = path.join(__dirname, '../../', article.cover_image);
      if (fs.existsSync(coverPath)) {
        fs.unlinkSync(coverPath);
      }
    }

    // Delete article (cascade will delete interactions)
    await executeQuery(
      'DELETE FROM articles WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Article deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Toggle favorite status
const toggleFavorite = async (req, res, next) => {
  try {
    const { id: articleId } = req.params;
    const { role, id: userId, companyId } = req.user;

    const targetCompanyId = role === 'company_user' ? companyId : userId;
    const targetUserId = role === 'company_user' ? userId : null;

    // Check if article exists and is published
    const [article] = await executeQuery(
      'SELECT id FROM articles WHERE id = ? AND is_published = TRUE',
      [articleId]
    );

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Check if interaction exists
    const [interaction] = await executeQuery(
      `SELECT * FROM article_interactions 
       WHERE article_id = ? AND company_id = ? 
       ${targetUserId ? 'AND company_user_id = ?' : 'AND company_user_id IS NULL'}`,
      targetUserId ? [articleId, targetCompanyId, targetUserId] : [articleId, targetCompanyId]
    );

    if (interaction) {
      // Toggle favorite status
      const newFavoriteStatus = !interaction.is_favorited;
      await executeQuery(
        `UPDATE article_interactions SET 
          is_favorited = ?, favorited_at = ?
         WHERE id = ?`,
        [newFavoriteStatus, newFavoriteStatus ? new Date() : null, interaction.id]
      );
    } else {
      // Create new interaction
      await executeQuery(
        `INSERT INTO article_interactions (
          article_id, company_id, company_user_id, is_favorited, favorited_at
        ) VALUES (?, ?, ?, ?, ?)`,
        [articleId, targetCompanyId, targetUserId, true, new Date()]
      );
    }

    res.json({
      success: true,
      message: 'Favorite status updated successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Mark article as read
const markAsRead = async (req, res, next) => {
  try {
    const { id: articleId } = req.params;
    const { role, id: userId, companyId } = req.user;

    const targetCompanyId = role === 'company_user' ? companyId : userId;
    const targetUserId = role === 'company_user' ? userId : null;

    // Check if article exists and is published
    const [article] = await executeQuery(
      'SELECT id FROM articles WHERE id = ? AND is_published = TRUE',
      [articleId]
    );

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Check if interaction exists
    const [interaction] = await executeQuery(
      `SELECT * FROM article_interactions 
       WHERE article_id = ? AND company_id = ? 
       ${targetUserId ? 'AND company_user_id = ?' : 'AND company_user_id IS NULL'}`,
      targetUserId ? [articleId, targetCompanyId, targetUserId] : [articleId, targetCompanyId]
    );

    if (interaction) {
      // Update read status
      await executeQuery(
        `UPDATE article_interactions SET 
          is_read = TRUE, read_at = ?
         WHERE id = ?`,
        [new Date(), interaction.id]
      );
    } else {
      // Create new interaction
      await executeQuery(
        `INSERT INTO article_interactions (
          article_id, company_id, company_user_id, is_read, read_at
        ) VALUES (?, ?, ?, ?, ?)`,
        [articleId, targetCompanyId, targetUserId, true, new Date()]
      );
    }

    res.json({
      success: true,
      message: 'Article marked as read'
    });

  } catch (error) {
    next(error);
  }
};

// Get article categories
const getCategories = async (req, res, next) => {
  try {
    const categories = await executeQuery(
      'SELECT DISTINCT category FROM articles WHERE is_published = TRUE ORDER BY category'
    );

    res.json({
      success: true,
      data: categories.map(c => c.category)
    });

  } catch (error) {
    next(error);
  }
};

// Get user's favorite articles
const getFavoriteArticles = async (req, res, next) => {
  try {
    const { role, id: userId, companyId } = req.user;

    const targetCompanyId = role === 'company_user' ? companyId : userId;
    const targetUserId = role === 'company_user' ? userId : null;

    const articles = await executeQuery(
      `SELECT 
        a.*,
        u.name as author_name,
        ai.favorited_at
       FROM articles a
       JOIN article_interactions ai ON a.id = ai.article_id
       LEFT JOIN users u ON a.author_id = u.id
       WHERE ai.company_id = ? 
       ${targetUserId ? 'AND ai.company_user_id = ?' : 'AND ai.company_user_id IS NULL'}
       AND ai.is_favorited = TRUE
       AND a.is_published = TRUE
       ORDER BY ai.favorited_at DESC`,
      targetUserId ? [targetCompanyId, targetUserId] : [targetCompanyId]
    );

    res.json({
      success: true,
      data: articles
    });

  } catch (error) {
    next(error);
  }
};

// Get articles statistics (admin only)
const getArticleStats = async (req, res, next) => {
  try {
    // Total articles
    const [{ total_articles }] = await executeQuery(
      'SELECT COUNT(*) as total_articles FROM articles'
    );

    // Published articles
    const [{ published_articles }] = await executeQuery(
      'SELECT COUNT(*) as published_articles FROM articles WHERE is_published = TRUE'
    );

    // Total views
    const [{ total_views }] = await executeQuery(
      'SELECT SUM(views_count) as total_views FROM articles WHERE is_published = TRUE'
    );

    // Articles by category
    const categoryStats = await executeQuery(
      `SELECT 
        category,
        COUNT(*) as total,
        SUM(CASE WHEN is_published = TRUE THEN 1 ELSE 0 END) as published,
        SUM(views_count) as total_views
       FROM articles 
       GROUP BY category 
       ORDER BY total DESC`
    );

    // Recent interactions
    const recentInteractions = await executeQuery(
      `SELECT 
        a.title,
        c.company_name,
        ai.is_favorited,
        ai.is_read,
        ai.created_at
       FROM article_interactions ai
       JOIN articles a ON ai.article_id = a.id
       JOIN companies c ON ai.company_id = c.id
       ORDER BY ai.created_at DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      data: {
        summary: {
          total_articles: total_articles || 0,
          published_articles: published_articles || 0,
          draft_articles: (total_articles || 0) - (published_articles || 0),
          total_views: total_views || 0
        },
        categoryStats,
        recentInteractions
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  upload,
  getArticles,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  toggleFavorite,
  markAsRead,
  getCategories,
  getFavoriteArticles,
  getArticleStats
};