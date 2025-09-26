const { executeQuery, executeTransaction } = require('../config/database');

// Helper function to convert undefined to null for MySQL compatibility
const safeValue = (value) => value === undefined ? null : value;

// ===== STOCKS CONTROLLERS =====

// Get stocks by company
const getStocksByCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    const stocks = await executeQuery(
      `SELECT 
        s.*,
        u.name as analyst_name,
        cr.title as report_title,
        COUNT(ii.id) as items_count,
        SUM(current_quantity * unit_cost) as total_value
       FROM inventory_stocks s
       LEFT JOIN users u ON s.analyst_id = u.id
       LEFT JOIN company_reports cr ON s.report_id = cr.id
       LEFT JOIN inventory_items ii ON s.id = ii.stock_id
       WHERE s.company_id = ? AND s.is_active = TRUE
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [companyId]
    );

    res.json({
      success: true,
      data: stocks
    });

  } catch (error) {
    next(error);
  }
};

// Get stock by ID
const getStockById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [stock] = await executeQuery(
      `SELECT 
        s.*,
        u.name as analyst_name,
        c.company_name,
        cr.title as report_title
       FROM inventory_stocks s
       LEFT JOIN users u ON s.analyst_id = u.id
       LEFT JOIN companies c ON s.company_id = c.id
       LEFT JOIN company_reports cr ON s.report_id = cr.id
       WHERE s.id = ?`,
      [id]
    );

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: 'Stock not found'
      });
    }

    // Get items in this stock
    const items = await executeQuery(
      `SELECT * FROM inventory_items WHERE stock_id = ? ORDER BY item_name`,
      [id]
    );

    stock.items = items;

    res.json({
      success: true,
      data: stock
    });

  } catch (error) {
    next(error);
  }
};

// Create new stock
const createStock = async (req, res, next) => {
  try {
    const {
      company_id, report_id, name, description, location, stock_type
    } = req.body;
    const { id: analyst_id } = req.user;

    // Verify company access
    const [company] = await executeQuery(
      'SELECT id FROM companies WHERE id = ? AND (analyst_id = ? OR ? = "admin")',
      [company_id, analyst_id, req.user.role]
    );

    if (!company) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this company'
      });
    }

    // Verify report exists and belongs to company
    const [report] = await executeQuery(
      'SELECT id FROM company_reports WHERE id = ? AND company_id = ?',
      [report_id, company_id]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found or does not belong to this company'
      });
    }

    const result = await executeQuery(
      `INSERT INTO inventory_stocks (
        company_id, analyst_id, report_id, name, description, location, stock_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [company_id, analyst_id, report_id, name, description, location, stock_type]
    );

    // Get created stock
    const [stock] = await executeQuery(
      `SELECT 
        s.*,
        u.name as analyst_name,
        cr.title as report_title
       FROM inventory_stocks s
       LEFT JOIN users u ON s.analyst_id = u.id
       LEFT JOIN company_reports cr ON s.report_id = cr.id
       WHERE s.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Stock created successfully',
      data: stock
    });

  } catch (error) {
    next(error);
  }
};

// Update stock
const updateStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, location, stock_type, is_active } = req.body;

    // Check if stock exists and user has access
    const [existingStock] = await executeQuery(
      'SELECT analyst_id FROM inventory_stocks WHERE id = ?',
      [id]
    );

    if (!existingStock) {
      return res.status(404).json({
        success: false,
        message: 'Stock not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin' && existingStock.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await executeQuery(
      `UPDATE inventory_stocks SET 
        name = ?, description = ?, location = ?, stock_type = ?, is_active = ?
       WHERE id = ?`,
      [name, description, location, stock_type, is_active, id]
    );

    // Get updated stock
    const [stock] = await executeQuery(
      `SELECT 
        s.*,
        u.name as analyst_name,
        cr.title as report_title
       FROM inventory_stocks s
       LEFT JOIN users u ON s.analyst_id = u.id
       LEFT JOIN company_reports cr ON s.report_id = cr.id
       WHERE s.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Stock updated successfully',
      data: stock
    });

  } catch (error) {
    next(error);
  }
};

// Delete stock
const deleteStock = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if stock exists and user has access
    const [stock] = await executeQuery(
      'SELECT analyst_id FROM inventory_stocks WHERE id = ?',
      [id]
    );

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: 'Stock not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin' && stock.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Soft delete
    await executeQuery(
      'UPDATE inventory_stocks SET is_active = FALSE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Stock deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Sync stock with report data (create items from report entries)
const syncStockWithReport = async (req, res, next) => {
  try {
    const { id: stockId } = req.params;
    const { report_id } = req.body;

    // Get stock info
    const [stock] = await executeQuery(
      'SELECT * FROM inventory_stocks WHERE id = ?',
      [stockId]
    );

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: 'Stock not found'
      });
    }

    // Get report entries
    const reportEntries = await executeQuery(
      'SELECT * FROM report_entries WHERE report_id = ? AND approval_status = "approved"',
      [report_id || stock.report_id]
    );

    // Get report template to understand fields
    const [report] = await executeQuery(
      `SELECT cr.*, rt.fields 
       FROM company_reports cr
       JOIN report_templates rt ON cr.template_id = rt.id
       WHERE cr.id = ?`,
      [report_id || stock.report_id]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    let fields = [];
    try {
      fields = JSON.parse(report.fields);
    } catch (e) {
      fields = [];
    }

    // Create items from report entries
    let itemsCreated = 0;

    for (const entry of reportEntries) {
      let entryData = {};
      try {
        entryData = JSON.parse(entry.data);
      } catch (e) {
        continue;
      }

      // Find name and quantity fields
      const nameField = fields.find(f =>
        f.name.toLowerCase().includes('nome') ||
        f.name.toLowerCase().includes('item') ||
        f.name.toLowerCase().includes('produto') ||
        f.name.toLowerCase().includes('máquina')
      );

      const quantityField = fields.find(f =>
        f.name.toLowerCase().includes('qtd') ||
        f.name.toLowerCase().includes('quantidade') ||
        f.name.toLowerCase().includes('volume')
      );

      const valueField = fields.find(f =>
        f.name.toLowerCase().includes('valor') &&
        !f.name.toLowerCase().includes('total')
      );

      if (!nameField) continue;

      const itemName = entryData[nameField.id] || 'Item sem nome';
      const quantity = quantityField ? parseFloat(entryData[quantityField.id]) || 0 : 1;
      const unitCost = valueField ? parseFloat(entryData[valueField.id]) || 0 : 0;

      // Check if item already exists
      const [existingItem] = await executeQuery(
        'SELECT id FROM inventory_items WHERE stock_id = ? AND report_entry_id = ?',
        [stockId, entry.id]
      );

      if (!existingItem) {
        await executeQuery(
          `INSERT INTO inventory_items (
            stock_id, report_entry_id, item_name, current_quantity, unit_cost, unit
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            stockId,
            entry.id,
            itemName,
            quantity,
            unitCost,
            quantityField?.unit || 'unidades'
          ]
        );
        itemsCreated++;
      }
    }

    res.json({
      success: true,
      message: `${itemsCreated} items synchronized successfully`,
      data: { count: itemsCreated }
    });

  } catch (error) {
    next(error);
  }
};

// ===== ITEMS CONTROLLERS =====
const getItemsByStock = async (req, res, next) => {
  try {
    const { stockId } = req.params;

    const items = await executeQuery(
      `SELECT 
        ii.*,
        s.name as stock_name,
        (ii.current_quantity * COALESCE(ii.unit_cost, 0)) as total_value,
        CASE 
          WHEN ii.current_quantity <= ii.minimum_quantity THEN TRUE 
          ELSE FALSE 
        END as low_stock
       FROM inventory_items ii
       JOIN inventory_stocks s ON ii.stock_id = s.id
       WHERE ii.stock_id = ?
       ORDER BY ii.item_name`,
      [stockId]
    );

    res.json({
      success: true,
      data: items
    });

  } catch (error) {
    next(error);
  }
};
// Get items by stock
const getItemsByStockBKP = async (req, res, next) => {
  try {
    const { stockId } = req.params;

    const items = await executeQuery(
      `SELECT 
        ii.*,
        s.name as stock_name,
        CASE 
          WHEN ii.current_quantity <= ii.minimum_quantity THEN TRUE 
          ELSE FALSE 
        END as low_stock
       FROM inventory_items ii
       JOIN inventory_stocks s ON ii.stock_id = s.id
       WHERE ii.stock_id = ?
       ORDER BY ii.item_name`,
      [stockId]
    );

    res.json({
      success: true,
      data: items
    });

  } catch (error) {
    next(error);
  }
};

// Get all items by company
const getItemsByCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    const items = await executeQuery(
      `SELECT 
        ii.*,
        s.name as stock_name,
        (ii.current_quantity * COALESCE(ii.unit_cost, 0)) as total_value,
        CASE 
          WHEN ii.current_quantity <= ii.minimum_quantity THEN TRUE 
          ELSE FALSE 
        END as low_stock
       FROM inventory_items ii
       JOIN inventory_stocks s ON ii.stock_id = s.id
       WHERE s.company_id = ? AND s.is_active = TRUE
       ORDER BY s.name, ii.item_name`,
      [companyId]
    );

    res.json({
      success: true,
      data: items
    });

  } catch (error) {
    next(error);
  }
};
// Get all items by company
const getItemsByCompanyBKP = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    const items = await executeQuery(
      `SELECT 
        ii.*,
        s.name as stock_name,
        CASE 
          WHEN ii.current_quantity <= ii.minimum_quantity THEN TRUE 
          ELSE FALSE 
        END as low_stock
       FROM inventory_items ii
       JOIN inventory_stocks s ON ii.stock_id = s.id
       WHERE s.company_id = ? AND s.is_active = TRUE
       ORDER BY s.name, ii.item_name`,
      [companyId]
    );

    res.json({
      success: true,
      data: items
    });

  } catch (error) {
    next(error);
  }
};

// Get item by ID
const getItemById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [item] = await executeQuery(
      `SELECT 
        ii.*,
        s.name as stock_name,
        s.location as stock_location
       FROM inventory_items ii
       JOIN inventory_stocks s ON ii.stock_id = s.id
       WHERE ii.id = ?`,
      [id]
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    res.json({
      success: true,
      data: item
    });

  } catch (error) {
    next(error);
  }
};

// ===== DESTINATIONS CONTROLLERS =====

// Get destinations by company
const getDestinationsByCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    const destinations = await executeQuery(
      `SELECT * FROM inventory_destinations 
       WHERE company_id = ? AND is_active = TRUE 
       ORDER BY type, name`,
      [companyId]
    );

    res.json({
      success: true,
      data: destinations
    });

  } catch (error) {
    next(error);
  }
};

// Create destination
const createDestination = async (req, res, next) => {
  try {
    const { company_id, name, type, description, location } = req.body;

    const result = await executeQuery(
      `INSERT INTO inventory_destinations (
        company_id, name, type, description, location
      ) VALUES (?, ?, ?, ?, ?)`,
      [company_id, name, type, description, location]
    );

    const [destination] = await executeQuery(
      'SELECT * FROM inventory_destinations WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Destination created successfully',
      data: destination
    });

  } catch (error) {
    next(error);
  }
};

// Update destination
const updateDestination = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, type, description, location, is_active } = req.body;

    await executeQuery(
      `UPDATE inventory_destinations SET 
        name = ?, type = ?, description = ?, location = ?, is_active = ?
       WHERE id = ?`,
      [name, type, description, location, is_active, id]
    );

    const [destination] = await executeQuery(
      'SELECT * FROM inventory_destinations WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Destination updated successfully',
      data: destination
    });

  } catch (error) {
    next(error);
  }
};

// Delete destination
const deleteDestination = async (req, res, next) => {
  try {
    const { id } = req.params;

    await executeQuery(
      'UPDATE inventory_destinations SET is_active = FALSE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Destination deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// ===== MOVEMENTS CONTROLLERS =====

// Get movements
const getMovements = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, stock_id, movement_type,
      start_date, end_date, search
    } = req.query;
    const { role, id: userId, companyId } = req.user;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];

    // Filter by user role
    if (role === 'analyst') {
      whereClause += ' AND s.analyst_id = ?';
      params.push(userId);
    } else if (role === 'client' || role === 'company_user') {
      const targetCompanyId = role === 'company_user' ? companyId : userId;
      whereClause += ' AND s.company_id = ?';
      params.push(targetCompanyId);
    }

    if (stock_id) {
      whereClause += ' AND im.item_id IN (SELECT id FROM inventory_items WHERE stock_id = ?)';
      params.push(stock_id);
    }

    if (movement_type) {
      whereClause += ' AND im.movement_type = ?';
      params.push(movement_type);
    }

    if (start_date) {
      whereClause += ' AND im.movement_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND im.movement_date <= ?';
      params.push(end_date);
    }

    if (search) {
      whereClause += ' AND (ii.item_name LIKE ? OR im.notes LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const movements = await executeQuery(
      `SELECT 
        im.*,
        ii.item_name,
        s.name as stock_name,
        fs.name as from_stock_name,
        ts.name as to_stock_name,
        id.name as destination_name,
        CASE 
          WHEN im.is_client = TRUE THEN c.name
          ELSE u.name
        END as creator_name
       FROM inventory_movements im
       JOIN inventory_items ii ON im.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       LEFT JOIN inventory_stocks fs ON im.from_stock_id = fs.id
       LEFT JOIN inventory_stocks ts ON im.to_stock_id = ts.id
       LEFT JOIN inventory_destinations id ON im.destination_id = id.id
       LEFT JOIN companies c ON im.created_by = c.id AND im.is_client = TRUE
       LEFT JOIN users u ON im.created_by = u.id AND im.is_client = FALSE
       ${whereClause}
       ORDER BY im.movement_date DESC, im.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total 
       FROM inventory_movements im
       JOIN inventory_items ii ON im.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        movements,
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

// Create movement
const createMovement = async (req, res, next) => {
  try {
    const {
      item_id, movement_type, quantity, unit_cost,
      from_stock_id, to_stock_id, destination_id, destination_details,
      movement_date, reference_number, notes
    } = req.body;
    const { id: created_by, role } = req.user;

    // Get item info
    const [item] = await executeQuery(
      `SELECT ii.*, s.company_id 
       FROM inventory_items ii
       JOIN inventory_stocks s ON ii.stock_id = s.id
       WHERE ii.id = ?`,
      [item_id]
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Validate quantity for exits and transfers
    if (['exit', 'transfer_out'].includes(movement_type)) {
      if (quantity > item.current_quantity) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient quantity in stock'
        });
      }
    }

    const total_cost = unit_cost ? quantity * unit_cost : null;
    const is_client = ['client', 'company_user'].includes(role);

    // Garantir que todos os parâmetros sejam null em vez de undefined
    const safeParams = [
      item_id,
      movement_type,
      quantity,
      unit_cost === undefined ? null : unit_cost,
      total_cost,
      from_stock_id === undefined ? null : from_stock_id,
      to_stock_id === undefined ? null : to_stock_id,
      destination_id === undefined ? null : destination_id,
      destination_details === undefined ? null : destination_details,
      movement_date === undefined ? null : movement_date,
      reference_number === undefined ? null : reference_number,
      notes === undefined ? null : notes,
      created_by,
      is_client
    ];

    // Create movement and update item quantity in transaction
    const queries = [
      {
        query: `INSERT INTO inventory_movements (
          item_id, movement_type, quantity, unit_cost, total_cost,
          from_stock_id, to_stock_id, destination_id, destination_details,
          movement_date, reference_number, notes, created_by, is_client
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: safeParams
      }
    ];

    // Update item quantity based on movement type
    let quantityChange = 0;
    switch (movement_type) {
      case 'entry':
        quantityChange = quantity;
        break;
      case 'exit':
      case 'transfer_out':
        quantityChange = -quantity;
        break;
      case 'transfer_in':
        quantityChange = quantity;
        break;
      case 'adjustment':
        quantityChange = quantity - item.current_quantity;
        break;
    }

    queries.push({
      query: 'UPDATE inventory_items SET current_quantity = current_quantity + ? WHERE id = ?',
      params: [quantityChange, item_id]
    });

    // If it's a transfer, also update the destination item
    if (movement_type === 'transfer_out' && to_stock_id) {
      // This would require more complex logic to handle transfers between stocks
      // For now, we'll just record the movement
    }

    const result = await executeTransaction(queries);
    const insertId = result[0].insertId;

    // Get created movement with details
    const [movement] = await executeQuery(
      `SELECT 
        im.*,
        ii.item_name,
        s.name as stock_name,
        fs.name as from_stock_name,
        ts.name as to_stock_name,
        id.name as destination_name
       FROM inventory_movements im
       JOIN inventory_items ii ON im.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       LEFT JOIN inventory_stocks fs ON im.from_stock_id = fs.id
       LEFT JOIN inventory_stocks ts ON im.to_stock_id = ts.id
       LEFT JOIN inventory_destinations id ON im.destination_id = id.id
       WHERE im.id = ?`,
      [insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Movement created successfully',
      data: movement
    });

  } catch (error) {
    next(error);
  }
};

// Get movement history for item
const getMovementHistory = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const movements = await executeQuery(
      `SELECT 
        im.*,
        ii.item_name,
        s.name as stock_name,
        fs.name as from_stock_name,
        ts.name as to_stock_name,
        id.name as destination_name,
        CASE 
          WHEN im.is_client = TRUE THEN c.name
          ELSE u.name
        END as creator_name
       FROM inventory_movements im
       JOIN inventory_items ii ON im.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       LEFT JOIN inventory_stocks fs ON im.from_stock_id = fs.id
       LEFT JOIN inventory_stocks ts ON im.to_stock_id = ts.id
       LEFT JOIN inventory_destinations id ON im.destination_id = id.id
       LEFT JOIN companies c ON im.created_by = c.id AND im.is_client = TRUE
       LEFT JOIN users u ON im.created_by = u.id AND im.is_client = FALSE
       WHERE im.item_id = ?
       ORDER BY im.movement_date DESC, im.created_at DESC`,
      [itemId]
    );

    res.json({
      success: true,
      data: movements
    });

  } catch (error) {
    next(error);
  }
};

// ===== SUMMARY CONTROLLERS =====

// Get inventory summary
const getInventorySummary = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    // Get stocks summary
    const [stocksSummary] = await executeQuery(
      `SELECT 
        COUNT(*) as total_stocks,
        SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active_stocks
       FROM inventory_stocks 
       WHERE company_id = ?`,
      [companyId]
    );

    // Get items summary
    const [itemsSummary] = await executeQuery(
      `SELECT 
        COUNT(*) as total_items,
        SUM(current_quantity) as total_quantity,
        SUM(current_quantity * unit_cost) as total_value,
        SUM(CASE WHEN current_quantity <= minimum_quantity THEN 1 ELSE 0 END) as low_stock_items
       FROM inventory_items ii
       JOIN inventory_stocks s ON ii.stock_id = s.id
       WHERE s.company_id = ? AND s.is_active = TRUE`,
      [companyId]
    );

    // Get recent movements
    const recentMovements = await executeQuery(
      `SELECT 
        im.*,
        ii.item_name,
        s.name as stock_name
       FROM inventory_movements im
       JOIN inventory_items ii ON im.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       WHERE s.company_id = ?
       ORDER BY im.created_at DESC
       LIMIT 10`,
      [companyId]
    );

    // Get movements by type
    const movementsByType = await executeQuery(
      `SELECT 
        im.movement_type,
        COUNT(*) as count,
        SUM(im.quantity) as total_quantity
       FROM inventory_movements im
       JOIN inventory_items ii ON im.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       WHERE s.company_id = ?
       GROUP BY im.movement_type`,
      [companyId]
    );

    res.json({
      success: true,
      data: {
        stocks: stocksSummary,
        items: itemsSummary,
        recentMovements,
        movementsByType
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Stocks
  getStocksByCompany,
  getStockById,
  createStock,
  updateStock,
  deleteStock,
  syncStockWithReport,

  // Items
  getItemsByStock,
  getItemsByCompany,
  getItemById,

  // Destinations
  getDestinationsByCompany,
  createDestination,
  updateDestination,
  deleteDestination,

  // Movements
  getMovements,
  createMovement,
  getMovementHistory,

  // Summary
  getInventorySummary
};