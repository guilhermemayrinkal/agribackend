const { executeQuery, executeTransaction } = require('../config/database');

// Get data entries for a chart
const getDataEntries = async (req, res, next) => {
  try {
    const { chartId } = req.params;
    const { page = 1, limit = 50, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    // Check if chart exists and user has access
    const [chart] = await executeQuery(
      `SELECT cc.*, c.analyst_id 
       FROM custom_charts cc
       JOIN companies c ON cc.company_id = c.id
       WHERE cc.id = ? AND cc.is_active = TRUE`,
      [chartId]
    );

    if (!chart) {
      return res.status(404).json({
        success: false,
        message: 'Chart not found'
      });
    }

    // Check access
    if (req.user.role === 'analyst' && chart.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (req.user.role === 'client' && chart.company_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Build query
    let whereClause = 'WHERE de.chart_id = ?';
    let params = [chartId];

    if (startDate) {
      whereClause += ' AND de.entry_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND de.entry_date <= ?';
      params.push(endDate);
    }

    // Get data entries
    const dataEntries = await executeQuery(
      `SELECT 
        de.*, 
        u.name as analyst_name
       FROM data_entries de
       LEFT JOIN users u ON de.analyst_id = u.id
       ${whereClause}
       ORDER BY de.entry_date DESC, de.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total FROM data_entries de ${whereClause}`,
      params
    );

    // Parse data JSON for each entry
    dataEntries.forEach(entry => {
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
      data: {
        entries: dataEntries,
        chart: {
          id: chart.id,
          title: chart.title,
          type: chart.type,
          fields: chart.fields ? JSON.parse(chart.fields) : []
        },
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

// Create data entry
const createDataEntry = async (req, res, next) => {
  try {
    const { chartId } = req.params;
    const { data, entry_date } = req.body;
    const { id: analyst_id } = req.user;

    console.log('Creating data entry:', { chartId, data, entry_date, analyst_id });

    // Validate required fields
    if (!data || !entry_date) {
      return res.status(400).json({
        success: false,
        message: 'Data and entry_date are required'
      });
    }

    // Check if chart exists and user has access
    const [chart] = await executeQuery(
      `SELECT cc.*, c.analyst_id 
       FROM custom_charts cc
       JOIN companies c ON cc.company_id = c.id
       WHERE cc.id = ? AND cc.is_active = TRUE`,
      [chartId]
    );

    if (!chart) {
      return res.status(404).json({
        success: false,
        message: 'Chart not found'
      });
    }

    // Check access (only analysts can create data)
    if (req.user.role !== 'admin' && chart.analyst_id !== analyst_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Validate data against chart fields
    let chartFields = [];
    try {
      chartFields = chart.fields ? JSON.parse(chart.fields) : [];
    } catch (e) {
      console.error('Error parsing chart fields:', e);
      chartFields = [];
    }

    // Check required fields
    for (const field of chartFields) {
      if (field.required && (!data[field.id] || data[field.id] === '')) {
        return res.status(400).json({
          success: false,
          message: `Field '${field.name}' is required`
        });
      }
    }

    // Prepare data JSON
    const dataJson = JSON.stringify(data);

    console.log('Inserting data entry with:', {
      chartId,
      company_id: chart.company_id,
      analyst_id,
      dataJson,
      entry_date
    });

    const result = await executeQuery(
      'INSERT INTO data_entries (chart_id, company_id, analyst_id, data, entry_date) VALUES (?, ?, ?, ?, ?)',
      [chartId, chart.company_id, analyst_id, dataJson, entry_date]
    );

    // Update chart data count
    await executeQuery(
      'UPDATE custom_charts SET data_count = data_count + 1 WHERE id = ?',
      [chartId]
    );

    // Get created entry
    const [createdEntry] = await executeQuery(
      `SELECT 
        de.*, 
        u.name as analyst_name
       FROM data_entries de
       LEFT JOIN users u ON de.analyst_id = u.id
       WHERE de.id = ?`,
      [result.insertId]
    );

    if (!createdEntry) {
      return res.status(500).json({
        success: false,
        message: 'Data entry was created but could not be retrieved'
      });
    }

    // Parse data JSON
    if (createdEntry.data) {
      try {
        createdEntry.data = JSON.parse(createdEntry.data);
      } catch (e) {
        console.error('Error parsing created entry data:', e);
        createdEntry.data = {};
      }
    }

    console.log('Data entry created successfully:', createdEntry);

    res.status(201).json({
      success: true,
      message: 'Data entry created successfully',
      data: createdEntry
    });

  } catch (error) {
    console.error('Error in createDataEntry:', error);
    next(error);
  }
};

// Create multiple data entries
const createMultipleDataEntries = async (req, res, next) => {
  try {
    const { chartId } = req.params;
    const { entries } = req.body; // Array of { data, entry_date }
    const { id: analyst_id } = req.user;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Entries array is required'
      });
    }

    // Check if chart exists and user has access
    const [chart] = await executeQuery(
      `SELECT cc.*, c.analyst_id 
       FROM custom_charts cc
       JOIN companies c ON cc.company_id = c.id
       WHERE cc.id = ? AND cc.is_active = TRUE`,
      [chartId]
    );

    if (!chart) {
      return res.status(404).json({
        success: false,
        message: 'Chart not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin' && chart.analyst_id !== analyst_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Validate data against chart fields
    let chartFields = [];
    try {
      chartFields = chart.fields ? JSON.parse(chart.fields) : [];
    } catch (e) {
      chartFields = [];
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

      for (const field of chartFields) {
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
      query: 'INSERT INTO data_entries (chart_id, company_id, analyst_id, data, entry_date) VALUES (?, ?, ?, ?, ?)',
      params: [chartId, chart.company_id, analyst_id, JSON.stringify(entry.data), entry.entry_date]
    }));

    // Add chart data count update
    queries.push({
      query: 'UPDATE custom_charts SET data_count = data_count + ? WHERE id = ?',
      params: [entries.length, chartId]
    });

    // Execute transaction
    await executeTransaction(queries);

    res.status(201).json({
      success: true,
      message: `${entries.length} data entries created successfully`,
      data: {
        count: entries.length,
        chartId: chartId
      }
    });

  } catch (error) {
    next(error);
  }
};

// Update data entry
const updateDataEntry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, entry_date } = req.body;

    // Check if entry exists and user has access
    const [entry] = await executeQuery(
      `SELECT de.*, cc.fields, c.analyst_id
       FROM data_entries de
       JOIN custom_charts cc ON de.chart_id = cc.id
       JOIN companies c ON de.company_id = c.id
       WHERE de.id = ?`,
      [id]
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Data entry not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin' && entry.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Validate data against chart fields
    let chartFields = [];
    try {
      chartFields = entry.fields ? JSON.parse(entry.fields) : [];
    } catch (e) {
      chartFields = [];
    }

    // Check required fields
    for (const field of chartFields) {
      if (field.required && (!data[field.id] || data[field.id] === '')) {
        return res.status(400).json({
          success: false,
          message: `Field '${field.name}' is required`
        });
      }
    }

    // Update entry
    await executeQuery(
      'UPDATE data_entries SET data = ?, entry_date = ? WHERE id = ?',
      [JSON.stringify(data), entry_date, id]
    );

    // Get updated entry
    const [updatedEntry] = await executeQuery(
      `SELECT 
        de.*, 
        u.name as analyst_name
       FROM data_entries de
       LEFT JOIN users u ON de.analyst_id = u.id
       WHERE de.id = ?`,
      [id]
    );

    // Parse data JSON
    if (updatedEntry && updatedEntry.data) {
      try {
        updatedEntry.data = JSON.parse(updatedEntry.data);
      } catch (e) {
        updatedEntry.data = {};
      }
    }

    res.json({
      success: true,
      message: 'Data entry updated successfully',
      data: updatedEntry
    });

  } catch (error) {
    next(error);
  }
};

// Delete data entry
const deleteDataEntry = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if entry exists and user has access
    const [entry] = await executeQuery(
      `SELECT de.*, c.analyst_id, de.chart_id
       FROM data_entries de
       JOIN companies c ON de.company_id = c.id
       WHERE de.id = ?`,
      [id]
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Data entry not found'
      });
    }

    // Check access
    if (req.user.role !== 'admin' && entry.analyst_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete entry and update chart count
    const queries = [
      {
        query: 'DELETE FROM data_entries WHERE id = ?',
        params: [id]
      },
      {
        query: 'UPDATE custom_charts SET data_count = GREATEST(data_count - 1, 0) WHERE id = ?',
        params: [entry.chart_id]
      }
    ];

    await executeTransaction(queries);

    res.json({
      success: true,
      message: 'Data entry deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Get data summary for chart
const getDataSummary = async (req, res, next) => {
  try {
    const { chartId } = req.params;

    // Check if chart exists and user has access
    const [chart] = await executeQuery(
      `SELECT cc.*, c.analyst_id 
       FROM custom_charts cc
       JOIN companies c ON cc.company_id = c.id
       WHERE cc.id = ? AND cc.is_active = TRUE`,
      [chartId]
    );

    if (!chart) {
      return res.status(404).json({
        success: false,
        message: 'Chart not found'
      });
    }

    // Get data summary
    const [summary] = await executeQuery(
      `SELECT 
        COUNT(*) as total_entries,
        MIN(entry_date) as first_entry_date,
        MAX(entry_date) as last_entry_date,
        COUNT(DISTINCT entry_date) as unique_dates
       FROM data_entries 
       WHERE chart_id = ?`,
      [chartId]
    );

    // Get entries by month
    const monthlyData = await executeQuery(
      `SELECT 
        DATE_FORMAT(entry_date, '%Y-%m') as month,
        COUNT(*) as entries_count
       FROM data_entries 
       WHERE chart_id = ?
       GROUP BY DATE_FORMAT(entry_date, '%Y-%m')
       ORDER BY month DESC
       LIMIT 12`,
      [chartId]
    );

    res.json({
      success: true,
      data: {
        summary,
        monthlyData,
        chart: {
          id: chart.id,
          title: chart.title,
          type: chart.type
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

// Export data entries
const exportDataEntries = async (req, res, next) => {
  try {
    const { chartId } = req.params;
    const { format = 'json', startDate, endDate } = req.query;

    // Check if chart exists and user has access
    const [chart] = await executeQuery(
      `SELECT cc.*, c.analyst_id 
       FROM custom_charts cc
       JOIN companies c ON cc.company_id = c.id
       WHERE cc.id = ? AND cc.is_active = TRUE`,
      [chartId]
    );

    if (!chart) {
      return res.status(404).json({
        success: false,
        message: 'Chart not found'
      });
    }

    // Build query
    let whereClause = 'WHERE chart_id = ?';
    let params = [chartId];

    if (startDate) {
      whereClause += ' AND entry_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND entry_date <= ?';
      params.push(endDate);
    }

    // Get all data entries
    const dataEntries = await executeQuery(
      `SELECT * FROM data_entries ${whereClause} ORDER BY entry_date DESC`,
      params
    );

    // Parse data JSON
    const processedEntries = dataEntries.map(entry => {
      let parsedData = {};
      try {
        parsedData = entry.data ? JSON.parse(entry.data) : {};
      } catch (e) {
        parsedData = {};
      }

      return {
        id: entry.id,
        entry_date: entry.entry_date,
        created_at: entry.created_at,
        ...parsedData
      };
    });

    if (format === 'csv') {
      // Convert to CSV
      if (processedEntries.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No data to export'
        });
      }

      const headers = Object.keys(processedEntries[0]);
      const csvContent = [
        headers.join(','),
        ...processedEntries.map(entry => 
          headers.map(header => `"${entry[header] || ''}"`).join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="chart_${chartId}_data.csv"`);
      res.send(csvContent);
    } else {
      // Return JSON
      res.json({
        success: true,
        data: {
          chart: {
            id: chart.id,
            title: chart.title,
            type: chart.type
          },
          entries: processedEntries,
          total: processedEntries.length,
          exported_at: new Date().toISOString()
        }
      });
    }

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDataEntries,
  createDataEntry,
  createMultipleDataEntries,
  updateDataEntry,
  deleteDataEntry,
  getDataSummary,
  exportDataEntries
};