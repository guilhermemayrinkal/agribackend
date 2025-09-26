const { executeQuery } = require('../config/database');

// Helper function to convert undefined to null for MySQL compatibility
const safeValue = (value) => value === undefined ? null : value;

// Get all categories
const getCategories = async (req, res, next) => {
  try {
    const { include_inactive = false } = req.query;

    let whereClause = '';
    let params = [];

    if (!include_inactive) {
      whereClause = 'WHERE is_active = TRUE';
    }

    const categories = await executeQuery(
      `SELECT * FROM article_categories ${whereClause} ORDER BY sort_order ASC, name ASC`,
      params
    );

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    next(error);
  }
};

// Get category by ID
const getCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [category] = await executeQuery(
      'SELECT * FROM article_categories WHERE id = ?',
      [id]
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Get articles count for this category
    const [{ articles_count }] = await executeQuery(
      'SELECT COUNT(*) as articles_count FROM articles WHERE category = ? AND is_published = TRUE',
      [category.name]
    );

    category.articles_count = articles_count;

    res.json({
      success: true,
      data: category
    });

  } catch (error) {
    next(error);
  }
};

// Create new category
const createCategory = async (req, res, next) => {
  try {
    const { name, description, color = '#3B82F6', sort_order } = req.body;

    // Get next sort order if not provided
    let finalSortOrder = sort_order;
    if (!finalSortOrder) {
      const [{ max_order }] = await executeQuery(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 as max_order FROM article_categories'
      );
      finalSortOrder = max_order;
    }

    const result = await executeQuery(
      `INSERT INTO article_categories (name, description, color, sort_order) 
       VALUES (?, ?, ?, ?)`,
      [name, description, color, finalSortOrder]
    );

    // Get created category
    const [category] = await executeQuery(
      'SELECT * FROM article_categories WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });

  } catch (error) {
    next(error);
  }
};

// Update category
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, color, sort_order, is_active } = req.body;

    // Check if category exists
    const [existingCategory] = await executeQuery(
      'SELECT id, name FROM article_categories WHERE id = ?',
      [id]
    );

    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Update category
    await executeQuery(
      `UPDATE article_categories SET 
        name = ?, description = ?, color = ?, sort_order = ?, is_active = ?
       WHERE id = ?`,
      [
        safeValue(name),
        safeValue(description),
        safeValue(color),
        safeValue(sort_order),
        safeValue(is_active),
        id
      ]
    );

    // If category name changed, update articles
    if (name && name !== existingCategory.name) {
      await executeQuery(
        'UPDATE articles SET category = ? WHERE category = ?',
        [name, existingCategory.name]
      );
    }

    // Get updated category
    const [category] = await executeQuery(
      'SELECT * FROM article_categories WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: category
    });

  } catch (error) {
    next(error);
  }
};

// Delete category
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const [category] = await executeQuery(
      'SELECT name FROM article_categories WHERE id = ?',
      [id]
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category has articles
    const [{ articles_count }] = await executeQuery(
      'SELECT COUNT(*) as articles_count FROM articles WHERE category = ?',
      [category.name]
    );

    if (articles_count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category with ${articles_count} articles. Please move or delete the articles first.`
      });
    }

    // Delete category
    await executeQuery(
      'DELETE FROM article_categories WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Reorder categories
const reorderCategories = async (req, res, next) => {
  try {
    const { categories } = req.body; // Array of { id, sort_order }

    if (!Array.isArray(categories)) {
      return res.status(400).json({
        success: false,
        message: 'Categories array is required'
      });
    }

    // Update sort order for each category
    for (const category of categories) {
      await executeQuery(
        'UPDATE article_categories SET sort_order = ? WHERE id = ?',
        [category.sort_order, category.id]
      );
    }

    res.json({
      success: true,
      message: 'Categories reordered successfully'
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories
};