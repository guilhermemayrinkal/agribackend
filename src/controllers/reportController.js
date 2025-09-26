const { executeQuery, executeTransaction } = require('../config/database');

// Helper function to convert undefined to null for MySQL compatibility
const safeValue = (value) => value === undefined ? null : value;

// Report Templates Controllers
const getReportTemplates = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    let whereClause = 'WHERE is_active = TRUE';
    let params = [];

    // Analysts can only see their own templates
    if (role === 'analyst') {
      whereClause += ' AND analyst_id = ?';
      params.push(userId);
    }

    const templates = await executeQuery(
      `SELECT * FROM report_templates ${whereClause} ORDER BY created_at DESC`,
      params
    );

    // Parse fields JSON
    templates.forEach(template => {
      if (template.fields) {
        try {
          template.fields = JSON.parse(template.fields);
        } catch (e) {
          template.fields = [];
        }
      }
    });

    res.json({
      success: true,
      data: templates
    });

  } catch (error) {
    next(error);
  }
};

const getReportTemplateById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    let whereClause = 'WHERE id = ?';
    let params = [id];

    // Analysts can only see their own templates
    if (role === 'analyst') {
      whereClause += ' AND analyst_id = ?';
      params.push(userId);
    }

    const [template] = await executeQuery(
      `SELECT * FROM report_templates ${whereClause}`,
      params
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Report template not found'
      });
    }

    // Parse fields JSON
    if (template.fields) {
      try {
        template.fields = JSON.parse(template.fields);
      } catch (e) {
        template.fields = [];
      }
    }

    res.json({
      success: true,
      data: template
    });

  } catch (error) {
    next(error);
  }
};

const createReportTemplate = async (req, res, next) => {
  try {
    const { title, description, fields } = req.body;
    const { id: analyst_id } = req.user;

    // Validate fields
    if (!Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one field is required'
      });
    }

    // Prepare fields JSON
    const fieldsJson = JSON.stringify(fields);

    const result = await executeQuery(
      `INSERT INTO report_templates (title, description, analyst_id, fields) 
       VALUES (?, ?, ?, ?)`,
      [title, description, analyst_id, fieldsJson]
    );

    // Get created template
    const [template] = await executeQuery(
      'SELECT * FROM report_templates WHERE id = ?',
      [result.insertId]
    );

    // Parse fields JSON
    if (template.fields) {
      try {
        template.fields = JSON.parse(template.fields);
      } catch (e) {
        template.fields = [];
      }
    }

    res.status(201).json({
      success: true,
      message: 'Report template created successfully',
      data: template
    });

  } catch (error) {
    next(error);
  }
};

const updateReportTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, fields } = req.body;
    const { role, id: userId } = req.user;

    // Check if template exists and user has access
    const [existingTemplate] = await executeQuery(
      'SELECT analyst_id FROM report_templates WHERE id = ?',
      [id]
    );

    if (!existingTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Report template not found'
      });
    }

    // Check access
    if (role !== 'admin' && existingTemplate.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Prepare fields JSON if provided
    const fieldsJson = fields ? JSON.stringify(fields) : null;

    // Update template
    await executeQuery(
      `UPDATE report_templates SET 
        title = ?, description = ?, fields = ?
       WHERE id = ?`,
      [
        safeValue(title),
        safeValue(description),
        fieldsJson,
        id
      ]
    );

    // Get updated template
    const [template] = await executeQuery(
      'SELECT * FROM report_templates WHERE id = ?',
      [id]
    );

    // Parse fields JSON
    if (template.fields) {
      try {
        template.fields = JSON.parse(template.fields);
      } catch (e) {
        template.fields = [];
      }
    }

    res.json({
      success: true,
      message: 'Report template updated successfully',
      data: template
    });

  } catch (error) {
    next(error);
  }
};

const deleteReportTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    // Check if template exists and user has access
    const [existingTemplate] = await executeQuery(
      'SELECT analyst_id FROM report_templates WHERE id = ?',
      [id]
    );

    if (!existingTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Report template not found'
      });
    }

    // Check access
    if (role !== 'admin' && existingTemplate.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete template (cascade will delete associated reports and entries)
    await executeQuery(
      'DELETE FROM report_templates WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Report template deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Company Reports Controllers
const getCompanyReports = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const { role, id: userId } = req.user;

    // Build where clause based on user role
    let whereClause = 'WHERE cr.company_id = ? AND cr.is_active = TRUE';
    let params = [companyId];

    // If user is a client, only show visible reports
    if (role === 'client' || role === 'company_user') {
      whereClause += ' AND (cr.client_visible = TRUE OR cr.client_visible = FALSE)';
    }

    const reports = await executeQuery(
      `SELECT 
        cr.*,
        c.company_name,
        (SELECT COUNT(*) FROM report_entries WHERE report_id = cr.id) as entries_count
       FROM company_reports cr
       JOIN companies c ON cr.company_id = c.id
       ${whereClause}
       ORDER BY cr.created_at DESC`,
      params
    );

    // Get template details for each report
    for (let report of reports) {
      const [template] = await executeQuery(
        `SELECT id, title, description, fields FROM report_templates WHERE id = ?`,
        [report.template_id]
      );

      if (template) {
        // Parse fields JSON
        if (template.fields) {
          try {
            template.fields = JSON.parse(template.fields);
          } catch (e) {
            template.fields = [];
          }
        }

        report.template = template;
      }
    }

    res.json({
      success: true,
      data: reports
    });

  } catch (error) {
    next(error);
  }
};

const getCompanyReportById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    // Get report with company info
    const [report] = await executeQuery(
      `SELECT 
        cr.*,
        c.company_name,
        c.analyst_id,
        (SELECT COUNT(*) FROM report_entries WHERE report_id = cr.id) as entries_count
       FROM company_reports cr
       JOIN companies c ON cr.company_id = c.id
       WHERE cr.id = ?`,
      [id]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check access
    if (role === 'client' && report.company_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (role === 'analyst' && report.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get template details
    const [template] = await executeQuery(
      `SELECT id, title, description, fields FROM report_templates WHERE id = ?`,
      [report.template_id]
    );

    if (template) {
      // Parse fields JSON
      if (template.fields) {
        try {
          template.fields = JSON.parse(template.fields);
        } catch (e) {
          template.fields = [];
        }
      }

      report.template = template;
    }

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    next(error);
  }
};

const createCompanyReport = async (req, res, next) => {
  try {
    const { template_id, company_id, title, description, client_can_edit, client_visible = true } = req.body;
    const { role, id: userId } = req.user;

    // Check if template exists
    const [template] = await executeQuery(
      'SELECT id FROM report_templates WHERE id = ?',
      [template_id]
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Report template not found'
      });
    }

    // Check if company exists and user has access
    const [company] = await executeQuery(
      'SELECT id, analyst_id FROM companies WHERE id = ?',
      [company_id]
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Check access
    if (role === 'analyst' && company.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this company'
      });
    }

    const result = await executeQuery(
      `INSERT INTO company_reports (template_id, company_id, title, description, client_can_edit, client_visible) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [template_id, company_id, title, description, client_can_edit, client_visible]
    );

    // Get created report
    const [report] = await executeQuery(
      `SELECT 
        cr.*,
        c.company_name
       FROM company_reports cr
       JOIN companies c ON cr.company_id = c.id
       WHERE cr.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Company report created successfully',
      data: report
    });

  } catch (error) {
    next(error);
  }
};

const updateCompanyReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, client_can_edit, client_visible } = req.body;
    const { role, id: userId } = req.user;

    // Check if report exists
    const [report] = await executeQuery(
      `SELECT cr.*, c.analyst_id 
       FROM company_reports cr
       JOIN companies c ON cr.company_id = c.id
       WHERE cr.id = ?`,
      [id]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check access
    if (role === 'analyst' && report.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update report
    await executeQuery(
      `UPDATE company_reports SET 
        title = ?, description = ?, client_can_edit = ?, client_visible = ?
       WHERE id = ?`,
      [
        safeValue(title),
        safeValue(description),
        safeValue(client_can_edit),
        safeValue(client_visible),
        id
      ]
    );

    // Get updated report
    const [updatedReport] = await executeQuery(
      `SELECT 
        cr.*,
        c.company_name
       FROM company_reports cr
       JOIN companies c ON cr.company_id = c.id
       WHERE cr.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Company report updated successfully',
      data: updatedReport
    });

  } catch (error) {
    next(error);
  }
};

const deleteCompanyReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    // Check if report exists
    const [report] = await executeQuery(
      `SELECT cr.*, c.analyst_id 
       FROM company_reports cr
       JOIN companies c ON cr.company_id = c.id
       WHERE cr.id = ?`,
      [id]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check access
    if (role === 'analyst' && report.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete report (cascade will delete entries)
    await executeQuery(
      'DELETE FROM company_reports WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Company report deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Report Entries Controllers
const getReportEntries = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { role, id: userId } = req.user;

    // Check if report exists and user has access
    const [report] = await executeQuery(
      `SELECT cr.*, c.analyst_id 
       FROM company_reports cr
       JOIN companies c ON cr.company_id = c.id
       WHERE cr.id = ?`,
      [reportId]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check access
    if (role === 'client' && report.company_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (role === 'analyst' && report.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get entries
    const entries = await executeQuery(
      `SELECT 
        re.*,
        u.name as approved_by_name
       FROM report_entries re
       LEFT JOIN users u ON re.approved_by = u.id
       WHERE re.report_id = ? 
       ORDER BY re.entry_date DESC, re.created_at DESC`,
      [reportId]
    );

    // Parse data JSON
    entries.forEach(entry => {
      if (entry.data) {
        try {
          entry.data = JSON.parse(entry.data);
        } catch (e) {
          entry.data = {};
        }
      }
    });

    res.json({
      success: true,
      data: entries
    });

  } catch (error) {
    next(error);
  }
};

const createReportEntry = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { data, entry_date } = req.body;
    const { role, id: userId } = req.user;

    // Check if report exists and user has access
    const [report] = await executeQuery(
      `SELECT cr.*, c.analyst_id 
       FROM company_reports cr
       JOIN companies c ON cr.company_id = c.id
       WHERE cr.id = ?`,
      [reportId]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check access
    if (role === 'client') {
      if (report.company_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      if (!report.client_can_edit) {
        return res.status(403).json({
          success: false,
          message: 'Clients are not allowed to edit this report'
        });
      }
    } else if (role === 'analyst' && report.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get template fields for validation
    const [template] = await executeQuery(
      'SELECT fields FROM report_templates WHERE id = ?',
      [report.template_id]
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Report template not found'
      });
    }

    // Parse fields JSON
    let fields = [];
    try {
      fields = JSON.parse(template.fields);
    } catch (e) {
      fields = [];
    }

    // Validate required fields
    for (const field of fields) {
      if (field.required && (!data[field.id] || data[field.id] === '')) {
        return res.status(400).json({
          success: false,
          message: `Field '${field.name}' is required`
        });
      }
    }

    // Prepare data JSON
    const dataJson = JSON.stringify(data);

    // Create entry
    const result = await executeQuery(
      `INSERT INTO report_entries (report_id, data, created_by, is_client, entry_date) 
       VALUES (?, ?, ?, ?, ?)`,
      [reportId, dataJson, userId, role === 'client', entry_date]
    );

    // Auto-approve if created by analyst, set as pending if created by client
    // Set approval status based on who created the entry
    if (role !== 'client') {
      // Auto-approve entries from analysts
      await executeQuery(
        `UPDATE report_entries SET 
          approval_status = 'approved', 
          approved_by = ?, 
          approved_at = NOW()
         WHERE id = ?`,
        [userId, result.insertId]
      );
    }
    // Client entries remain with default 'pending' status

    // Get created entry
    const [entry] = await executeQuery(
      `SELECT 
        re.*,
        u.name as approved_by_name
       FROM report_entries re
       LEFT JOIN users u ON re.approved_by = u.id
       WHERE re.id = ?`,
      [result.insertId]
    );

    // Parse data JSON
    if (entry.data) {
      try {
        entry.data = JSON.parse(entry.data);
      } catch (e) {
        entry.data = {};
      }
    }

    res.status(201).json({
      success: true,
      message: 'Report entry created successfully',
      data: entry
    });

  } catch (error) {
    next(error);
  }
};

const createMultipleReportEntries = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { entries } = req.body;
    const { id: userId } = req.user;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Entries array is required'
      });
    }

    // Check if report exists and user has access
    const [report] = await executeQuery(
      `SELECT cr.*, c.analyst_id 
       FROM company_reports cr
       JOIN companies c ON cr.company_id = c.id
       WHERE cr.id = ?`,
      [reportId]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Get template fields for validation
    const [template] = await executeQuery(
      'SELECT fields FROM report_templates WHERE id = ?',
      [report.template_id]
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Report template not found'
      });
    }

    // Parse fields JSON
    let fields = [];
    try {
      fields = JSON.parse(template.fields);
    } catch (e) {
      fields = [];
    }

    // Validate all entries
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      if (!entry.data || !entry.entry_date) {
        return res.status(400).json({
          success: false,
          message: `Entry ${i + 1}: data and entry_date are required`
        });
      }

      for (const field of fields) {
        if (field.required && (!entry.data[field.id] || entry.data[field.id] === '')) {
          return res.status(400).json({
            success: false,
            message: `Entry ${i + 1}: Field '${field.name}' is required`
          });
        }
      }
    }

    // Prepare transaction queries
    const queries = entries.map(entry => ({
      query: `INSERT INTO report_entries (report_id, data, created_by, is_client, entry_date) 
              VALUES (?, ?, ?, ?, ?)`,
      params: [reportId, JSON.stringify(entry.data), userId, false, entry.entry_date]
    }));

    // Execute transaction
    await executeTransaction(queries);

    res.status(201).json({
      success: true,
      message: `${entries.length} report entries created successfully`,
      data: {
        count: entries.length,
        reportId: reportId
      }
    });

  } catch (error) {
    next(error);
  }
};

const updateReportEntry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, entry_date } = req.body;
    const { role, id: userId } = req.user;

    // Check if entry exists
    const [entry] = await executeQuery(
      `SELECT re.*, cr.template_id, cr.company_id, c.analyst_id
       FROM report_entries re
       JOIN company_reports cr ON re.report_id = cr.id
       JOIN companies c ON cr.company_id = c.id
       WHERE re.id = ?`,
      [id]
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Report entry not found'
      });
    }

    // Check access
    if (role === 'client') {
      if (entry.company_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      if (!entry.is_client || entry.created_by !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only edit your own entries'
        });
      }
    } else if (role === 'analyst' && entry.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get template fields for validation
    const [template] = await executeQuery(
      'SELECT fields FROM report_templates WHERE id = ?',
      [entry.template_id]
    );

    // Parse fields JSON
    let fields = [];
    try {
      fields = JSON.parse(template.fields);
    } catch (e) {
      fields = [];
    }

    // Validate required fields
    for (const field of fields) {
      if (field.required && (!data[field.id] || data[field.id] === '')) {
        return res.status(400).json({
          success: false,
          message: `Field '${field.name}' is required`
        });
      }
    }

    // Prepare data JSON
    const dataJson = JSON.stringify(data);

    // Update entry
    await executeQuery(
      'UPDATE report_entries SET data = ?, entry_date = ? WHERE id = ?',
      [dataJson, entry_date, id]
    );

    // Get updated entry
    const [updatedEntry] = await executeQuery(
      'SELECT * FROM report_entries WHERE id = ?',
      [id]
    );

    // Parse data JSON
    if (updatedEntry.data) {
      try {
        updatedEntry.data = JSON.parse(updatedEntry.data);
      } catch (e) {
        updatedEntry.data = {};
      }
    }

    res.json({
      success: true,
      message: 'Report entry updated successfully',
      data: updatedEntry
    });

  } catch (error) {
    next(error);
  }
};

const deleteReportEntry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    // Check if entry exists
    const [entry] = await executeQuery(
      `SELECT re.*, cr.company_id, c.analyst_id
       FROM report_entries re
       JOIN company_reports cr ON re.report_id = cr.id
       JOIN companies c ON cr.company_id = c.id
       WHERE re.id = ?`,
      [id]
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Report entry not found'
      });
    }

    // Check access
    if (role === 'client') {
      if (entry.company_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      if (!entry.is_client || entry.created_by !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only delete your own entries'
        });
      }
    } else if (role === 'analyst' && entry.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete entry
    await executeQuery(
      'DELETE FROM report_entries WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Report entry deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Approve report entry
const approveReportEntry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    // Check if entry exists
    const [entry] = await executeQuery(
      `SELECT re.*, cr.company_id, c.analyst_id
       FROM report_entries re
       JOIN company_reports cr ON re.report_id = cr.id
       JOIN companies c ON cr.company_id = c.id
       WHERE re.id = ?`,
      [id]
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Report entry not found'
      });
    }

    // Check access (analyst can only approve entries from their companies)
    if (req.user.role === 'analyst' && entry.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Approve entry
    await executeQuery(
      `UPDATE report_entries SET 
        approval_status = 'approved', 
        approved_by = ?, 
        approved_at = NOW()
       WHERE id = ?`,
      [userId, id]
    );

    // Get updated entry
    const [updatedEntry] = await executeQuery(
      `SELECT 
        re.*,
        u.name as approved_by_name
       FROM report_entries re
       LEFT JOIN users u ON re.approved_by = u.id
       WHERE re.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Report entry approved successfully',
      data: updatedEntry
    });

  } catch (error) {
    next(error);
  }
};

// Reject report entry
const rejectReportEntry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const { id: userId } = req.user;

    // Check if entry exists
    const [entry] = await executeQuery(
      `SELECT re.*, cr.company_id, c.analyst_id
       FROM report_entries re
       JOIN company_reports cr ON re.report_id = cr.id
       JOIN companies c ON cr.company_id = c.id
       WHERE re.id = ?`,
      [id]
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Report entry not found'
      });
    }

    // Check access
    if (req.user.role === 'analyst' && entry.analyst_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Reject entry
    await executeQuery(
      `UPDATE report_entries SET 
        approval_status = 'rejected', 
        approved_by = ?, 
        approved_at = NOW(),
        rejection_reason = ?
       WHERE id = ?`,
      [userId, rejection_reason, id]
    );

    // Get updated entry
    const [updatedEntry] = await executeQuery(
      `SELECT 
        re.*,
        u.name as approved_by_name
       FROM report_entries re
       LEFT JOIN users u ON re.approved_by = u.id
       WHERE re.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Report entry rejected successfully',
      data: updatedEntry
    });

  } catch (error) {
    next(error);
  }
};



// === IMPORTAÇÃO EM MASSA DE ENTRIES (CSV normalizado no front) ===
const importReportEntries = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { rows = [], defaultEntryDate = null } = req.body;
    const { role, id: userId, companyId } = req.user;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No rows to import' });
    }
    if (rows.length > 2000) {
      return res.status(400).json({ success: false, message: 'Too many rows. Max 2000 per import.' });
    }

    // 1) Carrega o relatório e checa acesso
    const [report] = await executeQuery(
      `SELECT cr.*, c.analyst_id 
       FROM company_reports cr
       JOIN companies c ON cr.company_id = c.id
       WHERE cr.id = ?`,
      [reportId]
    );
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const isClientLike = role === 'client' || role === 'company_user';
    const isAnalyst = role === 'analyst';
    const isAdmin = role === 'admin';

    // regras de acesso (cliente pode editar? company_user pertence à empresa?)
    if (isClientLike) {
      const sameCompany =
        (role === 'client' && report.company_id === userId) ||
        (role === 'company_user' && companyId && report.company_id === companyId);

      if (!sameCompany) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      if (!report.client_can_edit) {
        return res.status(403).json({ success: false, message: 'Clients are not allowed to edit this report' });
      }
    } else if (isAnalyst) {
      if (report.analyst_id !== userId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // 2) Carrega os campos do template
    const [template] = await executeQuery(
      'SELECT fields FROM report_templates WHERE id = ?',
      [report.template_id]
    );
    if (!template) {
      return res.status(404).json({ success: false, message: 'Report template not found' });
    }

    let fields = [];
    try { fields = JSON.parse(template.fields) || []; } catch { fields = []; }

    // Índices rápidos por id e opções válidas
    const fieldById = new Map(fields.map(f => [f.id, f]));
    const requiredFieldIds = fields.filter(f => f.required).map(f => f.id);

    // helpers de parsing
    const parseBrazilDate = (v) => {
      if (!v) return null;
      if (v instanceof Date && !isNaN(v)) return v;
      const s = String(v).trim();

      // ISO yyyy-mm-dd
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(`${s}T00:00:00Z`);
        return isNaN(d) ? null : d;
      }
      // dd/mm/yyyy
      const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) {
        const [_, dd, mm, yyyy] = m;
        const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
        return isNaN(d) ? null : d;
      }
      const d = new Date(s);
      return isNaN(d) ? null : d;
    };

    const toBoolean = (v) => {
      if (typeof v === 'boolean') return v;
      const s = String(v).trim().toLowerCase();
      return ['1', 'true', 'sim', 'yes', 'y'].includes(s) ? true
        : ['0', 'false', 'nao', 'não', 'no', 'n'].includes(s) ? false
          : null;
    };

    const coerceValue = (field, raw) => {
      if (raw === undefined || raw === null || raw === '') return { ok: true, value: '' };

      switch (field.type) {
        case 'number': {
          const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
          if (Number.isFinite(n)) return { ok: true, value: n };
          return { ok: false, err: `Campo '${field.name}' deve ser numérico` };
        }
        case 'date': {
          const d = parseBrazilDate(raw);
          if (d) return { ok: true, value: d.toISOString().split('T')[0] };
          return { ok: false, err: `Campo '${field.name}' deve ser uma data válida (yyyy-mm-dd ou dd/mm/yyyy)` };
        }
        case 'boolean': {
          const b = toBoolean(raw);
          if (b === null) return { ok: false, err: `Campo '${field.name}' deve ser Sim/Não (true/false)` };
          return { ok: true, value: b };
        }
        case 'select': {
          if (!field.options || !Array.isArray(field.options)) return { ok: true, value: String(raw) };
          const val = String(raw);
          if (field.options.includes(val)) return { ok: true, value: val };
          return { ok: false, err: `Valor inválido para '${field.name}'. Opções: ${field.options.join(', ')}` };
        }
        case 'text':
        default:
          return { ok: true, value: String(raw) };
      }
    };

    const results = {
      total: rows.length,
      inserted: 0,
      failed: 0,
      errors: [] // [{ index, message, fieldId? }]
    };

    const createdIds = [];

    // 3) processa linha a linha (aceita partial success)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};

      // formato esperado:
      //  a) { entry_date?: string, ...fieldId:value }
      //  b) { entry_date?: string, data: { fieldId:value } }
      const rawData = row.data && typeof row.data === 'object'
        ? row.data
        : Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'entry_date'));

      // valida required
      for (const fid of requiredFieldIds) {
        const v = rawData[fid];
        if (v === undefined || v === null || v === '') {
          results.failed++;
          results.errors.push({ index: i, message: `Campo obrigatório ausente: ${fieldById.get(fid)?.name || fid}` });
          continue; // passa para próximo erro? precisamos pular a linha inteira -> use uma flag
        }
      }
      // a flag de required precisa pular a linha: revalide com uma flag
      let requiredOk = true;
      for (const fid of requiredFieldIds) {
        const v = rawData[fid];
        if (v === undefined || v === null || v === '') { requiredOk = false; break; }
      }
      if (!requiredOk) continue;

      // coerção de tipos
      const coerced = {};
      let typeOk = true;
      for (const [fid, rawVal] of Object.entries(rawData)) {
        const field = fieldById.get(fid);
        if (!field) {
          // ignora colunas que não existem no template
          continue;
        }
        const r = coerceValue(field, rawVal);
        if (!r.ok) {
          typeOk = false;
          results.failed++;
          results.errors.push({ index: i, fieldId: fid, message: r.err });
          break;
        }
        coerced[fid] = r.value;
      }
      if (!typeOk) continue;

      // entry_date
      let entryDateStr = row.entry_date || defaultEntryDate;
      if (!entryDateStr) {
        // tenta um campo de data do template, se existir
        const firstDateField = fields.find(f => f.type === 'date');
        if (firstDateField && coerced[firstDateField.id]) {
          entryDateStr = coerced[firstDateField.id];
        } else {
          entryDateStr = new Date().toISOString().split('T')[0];
        }
      } else {
        const d = parseBrazilDate(entryDateStr);
        entryDateStr = d ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      }

      try {
        const dataJson = JSON.stringify(coerced);
        const insert = await executeQuery(
          `INSERT INTO report_entries (report_id, data, created_by, is_client, entry_date) 
           VALUES (?, ?, ?, ?, ?)`,
          [reportId, dataJson, userId, isClientLike, entryDateStr]
        );

        // auto-approve para analista/admin
        if (!isClientLike) {
          await executeQuery(
            `UPDATE report_entries SET 
               approval_status = 'approved',
               approved_by = ?, 
               approved_at = NOW()
             WHERE id = ?`,
            [userId, insert.insertId]
          );
        }

        results.inserted++;
        createdIds.push(insert.insertId);
      } catch (e) {
        results.failed++;
        results.errors.push({ index: i, message: e.message || 'Insert failed' });
      }
    }

    return res.status(207).json({
      success: true,
      message: `Import finished: ${results.inserted} inserted, ${results.failed} failed`,
      data: {
        summary: results,
        createdIds
      }
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  getReportTemplates,
  getReportTemplateById,
  createReportTemplate,
  updateReportTemplate,
  deleteReportTemplate,
  getCompanyReports,
  getCompanyReportById,
  createCompanyReport,
  updateCompanyReport,
  deleteCompanyReport,
  getReportEntries,
  createReportEntry,
  createMultipleReportEntries,
  updateReportEntry,
  deleteReportEntry,
  approveReportEntry,
  rejectReportEntry,
  importReportEntries
};