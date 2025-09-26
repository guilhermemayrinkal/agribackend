const { executeQuery, executeTransaction } = require('../config/database');

// Helper function to convert undefined to null for MySQL compatibility
const safeValue = (value) => value === undefined ? null : value;

// Get adjustment requests
const getAdjustmentRequests = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, company_id } = req.query;
    const { role, id: userId, companyId } = req.user;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];

    // Filter by user role
    if (role === 'analyst') {
      whereClause += ' AND c.analyst_id = ?';
      params.push(userId);
    } else if (role === 'client') {
      whereClause += ' AND iar.company_id = ?';
      params.push(userId);
    } else if (role === 'company_user') {
      whereClause += ' AND iar.company_id = ?';
      params.push(companyId);
    }

    if (status) {
      whereClause += ' AND iar.status = ?';
      params.push(status);
    }

    if (company_id) {
      whereClause += ' AND iar.company_id = ?';
      params.push(company_id);
    }

    const requests = await executeQuery(
      `SELECT 
        iar.*,
        ii.item_name,
        ii.current_quantity,
        ii.unit,
        s.name as stock_name,
        c.company_name,
        cu.name as requested_by_name,
        cu.email as requested_by_email,
        u.name as approved_by_name,
        c.name as approved_by_name_comp,
        id_from.name as from_destination_name,
        id_to.name as to_destination_name,
        im.id as movement_created
       FROM inventory_adjustment_requests iar
       JOIN inventory_items ii ON iar.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       JOIN companies c ON iar.company_id = c.id
       JOIN company_users cu ON iar.requested_by = cu.id
       LEFT JOIN users u ON iar.approved_by = u.id
       LEFT JOIN inventory_destinations id_from ON iar.destination_id = id_from.id
       LEFT JOIN inventory_destinations id_to ON iar.destination_id = id_to.id
       LEFT JOIN inventory_movements im ON iar.movement_id = im.id
       ${whereClause}
       ORDER BY iar.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total 
       FROM inventory_adjustment_requests iar
       JOIN companies c ON iar.company_id = c.id
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        requests: requests,
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

// Get adjustment request by ID
const getAdjustmentRequestById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [request] = await executeQuery(
      `SELECT 
        iar.*,
        ii.item_name,
        ii.current_quantity,
        ii.unit,
        s.name as stock_name,
        c.company_name,
        cu.name as requested_by_name,
        cu.email as requested_by_email,
        u.name as approved_by_name,
        c.name as approved_by_name_comp
       FROM inventory_adjustment_requests iar
       JOIN inventory_items ii ON iar.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       JOIN companies c ON iar.company_id = c.id
       JOIN company_users cu ON iar.requested_by = cu.id
       LEFT JOIN users u ON iar.approved_by = u.id
       WHERE iar.id = ?`,
      [id]
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Adjustment request not found'
      });
    }

    res.json({
      success: true,
      data: request
    });

  } catch (error) {
    next(error);
  }
};

// Create new adjustment request
const createAdjustmentRequest = async (req, res, next) => {
  try {
    const {
      item_id, movement_type, quantity, unit_cost, to_stock_id,
      destination_id, destination_details, movement_date, reference_number,
      notes, reason
    } = req.body;
    const { role, id: userId, companyId } = req.user;

    // Only company users can create adjustment requests
    if (role !== 'company_user') {
      return res.status(403).json({
        success: false,
        message: 'Only company users can create adjustment requests'
      });
    }

    // Get item details
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

    // Check if user belongs to the same company as the item
    if (item.company_id !== companyId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this item'
      });
    }

    // Validate quantity for exit/transfer operations
    if (['exit', 'transfer_out'].includes(movement_type) && quantity > item.current_quantity) {
      return res.status(400).json({
        success: false,
        message: `Quantity cannot exceed current stock (${item.current_quantity})`
      });
    }

    // Calculate total cost if unit cost is provided
    const totalCost = unit_cost ? quantity * unit_cost : null;

    const result = await executeQuery(
      `INSERT INTO inventory_adjustment_requests (
        item_id, company_id, requested_by, movement_type, quantity, unit_cost, total_cost,
        to_stock_id, destination_id, destination_details, movement_date, reference_number,
        notes, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item_id, companyId, userId, movement_type, quantity, safeValue(unit_cost), safeValue(totalCost),
        safeValue(to_stock_id), safeValue(destination_id), safeValue(destination_details),
        movement_date, safeValue(reference_number), safeValue(notes), reason
      ]
    );

    // Get created request with details
    const [request] = await executeQuery(
      `SELECT 
        iar.*,
        ii.item_name,
        ii.current_quantity,
        ii.unit,
        s.name as stock_name,
        c.company_name,
        cu.name as requested_by_name
       FROM inventory_adjustment_requests iar
       JOIN inventory_items ii ON iar.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       JOIN companies c ON iar.company_id = c.id
       JOIN company_users cu ON iar.requested_by = cu.id
       WHERE iar.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Adjustment request created successfully. Awaiting approval.',
      data: request
    });

  } catch (error) {
    next(error);
  }
};

const approveAdjustmentRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId, companyId } = req.user;

    // Busca a solicitação + info necessária
    const [request] = await executeQuery(
      `SELECT iar.*, c.analyst_id, ii.current_quantity
       FROM inventory_adjustment_requests iar
       JOIN companies c ON iar.company_id = c.id
       JOIN inventory_items ii ON iar.item_id = ii.id
       WHERE iar.id = ?`,
      [id]
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Adjustment request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Request has already been processed'
      });
    }

    // Autorização
    let canApprove = false;
    if (role === 'admin') {
      canApprove = true;
    } else if (role === 'analyst' && request.analyst_id === userId) {
      canApprove = true;
    } else if (role === 'client' && companyId && request.company_id === companyId) {
      canApprove = true;
    }

    if (!canApprove) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only company owner or assigned analyst can approve.'
      });
    }

    // Revalida quantidade para saídas/transferências
    if (['exit', 'transfer_out'].includes(request.movement_type) &&
      request.quantity > request.current_quantity) {
      return res.status(400).json({
        success: false,
        message: `Cannot approve: quantity exceeds current stock (${request.current_quantity})`
      });
    }

    // Calcula nova quantidade com base no tipo de movimento
    let newQuantity = request.current_quantity;
    if (request.movement_type === 'entry') {
      newQuantity += request.quantity;
    } else if (['exit', 'transfer_out'].includes(request.movement_type)) {
      newQuantity -= request.quantity;
    } else if (request.movement_type === 'adjustment') {
      newQuantity = request.quantity; // ajuste direto
    }

    console.log('USER IDDD ' + userId);

    // Gera ID do movimento (UUID) e flags
    const movementId = require('crypto').randomUUID();
    const isClient = role === 'client';

    // Garante uma data de movimento
    const movementDate = request.movement_date || new Date();

    // se admin/analyst, referencia users.id; se client, deixa NULL (evita quebrar a FK)
    const approverUserId = (role === 'admin' || role === 'analyst') ? userId : null;


    // Executa TUDO em transação: inserção do movimento + update do item + update da solicitação
    await executeTransaction([
      {
        query: `INSERT INTO inventory_movements (
          id, item_id, movement_type, quantity, unit_cost, total_cost,
          from_stock_id, to_stock_id, destination_id, destination_details,
          movement_date, reference_number, notes, created_by, is_client
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          movementId,
          request.item_id, request.movement_type, request.quantity,
          request.unit_cost, request.total_cost, request.from_stock_id,
          request.to_stock_id, request.destination_id, request.destination_details,
          movementDate, request.reference_number,
          `${request.notes || ''}\n[Aprovado via solicitação #${request.id}]`,
          userId, isClient
        ]
      },
      {
        // Atualiza o saldo do item
        query: 'UPDATE inventory_items SET current_quantity = ? WHERE id = ?',
        params: [newQuantity, request.item_id]
      },
      {
        // Marca a solicitação como aprovada e referencia o movimento criado
        query: `UPDATE inventory_adjustment_requests SET 
                 status = 'approved', approved_by = ?, approved_at = NOW(), movement_id = ?
                 WHERE id = ?`,
        params: [userId, movementId, id]
      }
    ]);

    // Busca a versão atualizada para retornar
    const [updatedRequest] = await executeQuery(
      `SELECT 
        iar.*,
        ii.item_name,
        s.name as stock_name,
        c.company_name,
        cu.name as requested_by_name,
        u.name as approved_by_name,
        c.name as approved_by_name_comp
       FROM inventory_adjustment_requests iar
       JOIN inventory_items ii ON iar.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       JOIN companies c ON iar.company_id = c.id
       JOIN company_users cu ON iar.requested_by = cu.id
       LEFT JOIN users u ON iar.approved_by = u.id
       WHERE iar.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Adjustment request approved and movement created successfully',
      data: updatedRequest
    });
  } catch (error) {
    next(error);
  }
};


// Approve adjustment request
const approveAdjustmentRequestBKPPP = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId, companyId } = req.user;

    // Get request details
    const [request] = await executeQuery(
      `SELECT iar.*, c.analyst_id, ii.current_quantity
       FROM inventory_adjustment_requests iar
       JOIN companies c ON iar.company_id = c.id
       JOIN inventory_items ii ON iar.item_id = ii.id
       WHERE iar.id = ?`,
      [id]
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Adjustment request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Request has already been processed'
      });
    }

    // Check authorization
    let canApprove = false;

    if (role === 'admin') {
      canApprove = true;
    } else if (role === 'analyst' && request.analyst_id === userId) {
      canApprove = true;
      // } else if (role === 'client' && request.company_id === userId) {
    } else if (role === 'client' && companyId && request.company_id === companyId) {

      canApprove = true;
    }

    if (!canApprove) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only company owner or assigned analyst can approve.'
      });
    }

    // Validate quantity again (in case stock changed)
    if (['exit', 'transfer_out'].includes(request.movement_type) &&
      request.quantity > request.current_quantity) {
      return res.status(400).json({
        success: false,
        message: `Cannot approve: quantity exceeds current stock (${request.current_quantity})`
      });
    }

    // Create the actual movement
    const movementResult = await executeQuery(
      `INSERT INTO inventory_movements (
        item_id, movement_type, quantity, unit_cost, total_cost,
        from_stock_id, to_stock_id, destination_id, destination_details,
        movement_date, reference_number, notes, created_by, is_client
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.item_id, request.movement_type, request.quantity,
        request.unit_cost, request.total_cost, request.from_stock_id,
        request.to_stock_id, request.destination_id, request.destination_details,
        request.movement_date, request.reference_number,
        `${request.notes || ''}\n[Aprovado via solicitação #${request.id}]`,
        userId, false
      ]
    );

    // Update item quantity based on movement type
    let newQuantity = request.current_quantity;

    if (request.movement_type === 'entry') {
      newQuantity += request.quantity;
    } else if (['exit', 'transfer_out'].includes(request.movement_type)) {
      newQuantity -= request.quantity;
    } else if (request.movement_type === 'adjustment') {
      newQuantity = request.quantity;
    }

    // Update item quantity and request status in transaction
    const queries = [
      {
        query: 'UPDATE inventory_items SET current_quantity = ? WHERE id = ?',
        params: [newQuantity, request.item_id]
      },
      {
        query: `UPDATE inventory_adjustment_requests SET 
                 status = 'approved', approved_by = ?, approved_at = NOW(), movement_id = ?
                 WHERE id = ?`,
        params: [userId, movementResult.insertId, id]
      }
    ];

    await executeTransaction(queries);

    // Get updated request
    const [updatedRequest] = await executeQuery(
      `SELECT 
        iar.*,
        ii.item_name,
        s.name as stock_name,
        c.company_name,
        cu.name as requested_by_name,
        u.name as approved_by_name
       FROM inventory_adjustment_requests iar
       JOIN inventory_items ii ON iar.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       JOIN companies c ON iar.company_id = c.id
       JOIN company_users cu ON iar.requested_by = cu.id
       LEFT JOIN users u ON iar.approved_by = u.id
       WHERE iar.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Adjustment request approved and movement created successfully',
      data: updatedRequest
    });

  } catch (error) {
    next(error);
  }
};

// Reject adjustment request
const rejectAdjustmentRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const { role, id: userId } = req.user;

    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    // Get request details
    const [request] = await executeQuery(
      `SELECT iar.*, c.analyst_id
       FROM inventory_adjustment_requests iar
       JOIN companies c ON iar.company_id = c.id
       WHERE iar.id = ?`,
      [id]
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Adjustment request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Request has already been processed'
      });
    }

    // Check authorization
    let canReject = false;

    if (role === 'admin') {
      canReject = true;
    } else if (role === 'analyst' && request.analyst_id === userId) {
      canReject = true;
    } else if (role === 'client' && request.company_id === userId) {
      canReject = true;
    }

    if (!canReject) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only company owner or assigned analyst can reject.'
      });
    }

    // Reject request
    await executeQuery(
      `UPDATE inventory_adjustment_requests SET 
        status = 'rejected', approved_by = ?, approved_at = NOW(), rejection_reason = ?
       WHERE id = ?`,
      [userId, rejection_reason, id]
    );

    // Get updated request
    const [updatedRequest] = await executeQuery(
      `SELECT 
        iar.*,
        ii.item_name,
        s.name as stock_name,
        c.company_name,
        cu.name as requested_by_name,
        u.name as approved_by_name,
        c.name as approved_by_name_comp
       FROM inventory_adjustment_requests iar
       JOIN inventory_items ii ON iar.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       JOIN companies c ON iar.company_id = c.id
       JOIN company_users cu ON iar.requested_by = cu.id
       LEFT JOIN users u ON iar.approved_by = u.id
       WHERE iar.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Adjustment request rejected successfully',
      data: updatedRequest
    });

  } catch (error) {
    next(error);
  }
};

// Get requests by company
const getRequestsByCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE iar.company_id = ?';
    let params = [companyId];

    if (status) {
      whereClause += ' AND iar.status = ?';
      params.push(status);
    }

    const requests = await executeQuery(
      `SELECT 
        iar.*,
        ii.item_name,
        ii.current_quantity,
        ii.unit,
        s.name as stock_name,
        cu.name as requested_by_name,
        u.name as approved_by_name,
        c.name as approved_by_name_comp
       FROM inventory_adjustment_requests iar
       JOIN inventory_items ii ON iar.item_id = ii.id
       JOIN inventory_stocks s ON ii.stock_id = s.id
       JOIN company_users cu ON iar.requested_by = cu.id
       LEFT JOIN users u ON iar.approved_by = u.id
       ${whereClause}
       ORDER BY iar.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total FROM inventory_adjustment_requests iar ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        requests: requests,
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

// Get requests summary
const getRequestsSummary = async (req, res, next) => {
  try {
    const { role, id: userId, companyId } = req.user;

    let whereClause = 'WHERE 1=1';
    let params = [];

    // Filter by user role
    if (role === 'analyst') {
      whereClause += ' AND c.analyst_id = ?';
      params.push(userId);
    } else if (role === 'client') {
      whereClause += ' AND iar.company_id = ?';
      params.push(userId);
    } else if (role === 'company_user') {
      whereClause += ' AND iar.company_id = ?';
      params.push(companyId);
    }

    // Get summary by status
    const statusSummary = await executeQuery(
      `SELECT 
        iar.status,
        COUNT(*) as total
       FROM inventory_adjustment_requests iar
       JOIN companies c ON iar.company_id = c.id
       ${whereClause}
       GROUP BY iar.status`,
      params
    );

    // Get summary by movement type
    const typeSummary = await executeQuery(
      `SELECT 
        iar.movement_type,
        COUNT(*) as total
       FROM inventory_adjustment_requests iar
       JOIN companies c ON iar.company_id = c.id
       ${whereClause}
       GROUP BY iar.movement_type`,
      params
    );

    // Get recent requests
    const recentRequests = await executeQuery(
      `SELECT 
        iar.id, iar.status, iar.movement_type, iar.quantity, iar.created_at,
        ii.item_name, ii.unit,
        c.company_name,
        cu.name as requested_by_name
       FROM inventory_adjustment_requests iar
       JOIN inventory_items ii ON iar.item_id = ii.id
       JOIN companies c ON iar.company_id = c.id
       JOIN company_users cu ON iar.requested_by = cu.id
       ${whereClause}
       ORDER BY iar.created_at DESC
       LIMIT 5`,
      params
    );

    res.json({
      success: true,
      data: {
        byStatus: statusSummary,
        byType: typeSummary,
        recent: recentRequests
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdjustmentRequests,
  getAdjustmentRequestById,
  createAdjustmentRequest,
  approveAdjustmentRequest,
  rejectAdjustmentRequest,
  getRequestsByCompany,
  getRequestsSummary
};