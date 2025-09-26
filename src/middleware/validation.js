const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Auth validations
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  handleValidationErrors
];

const validateRegister = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('role')
    .isIn(['admin', 'analyst'])
    .withMessage('Role must be admin or analyst'),
  handleValidationErrors
];

// Company validations
const validateCompany = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('company_name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Company name must be between 2 and 255 characters'),
  body('cnpj')
    .trim()
    .isLength({ min: 9, max: 20 })
    .withMessage('CNPJ is required'),
  body('sector')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Sector is required'),
  body('business_type')
    .isIn(['retail', 'manufacturing', 'services', 'technology', 'healthcare', 'finance', 'agriculture', 'other'])
    .withMessage('Invalid business type'),
  handleValidationErrors
];

// Chart validations
const validateChart = [
  body('title')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Title must be between 2 and 255 characters'),
  body('type')
    .isIn(['bar', 'line', 'pie', 'area', 'scatter'])
    .withMessage('Invalid chart type'),
  body('category')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Category is required'),
  body('fields')
    .isArray({ min: 1 })
    .withMessage('At least one field is required'),
  handleValidationErrors
];

// Data entry validations
const validateDataEntry = [
  body('data')
    .isObject()
    .withMessage('Data must be an object'),
  body('entry_date')
    .isISO8601()
    .withMessage('Valid date is required'),
  handleValidationErrors
];

// Goal validations
const validateGoal = [
  body('title')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Title is required'),
  body('target_value')
    .isNumeric()
    .withMessage('Target value must be a number'),
  body('unit')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Unit is required'),
  body('deadline')
    .isISO8601()
    .withMessage('Valid deadline is required'),
  body('category')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Category is required'),
  handleValidationErrors
];

// Alert validations
const validateAlert = [
  body('type')
    .isIn(['warning', 'info', 'error', 'success'])
    .withMessage('Invalid alert type'),
  body('title')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Title is required'),
  body('message')
    .trim()
    .isLength({ min: 5 })
    .withMessage('Message is required'),
  body('priority')
    .isIn(['low', 'medium', 'high'])
    .withMessage('Invalid priority'),
  body('category')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Category is required'),
  handleValidationErrors
];

// Insight validations
const validateInsight = [
  body('title')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Title is required'),
  body('description')
    .trim()
    .isLength({ min: 10 })
    .withMessage('Description is required'),
  body('type')
    .isIn(['trend', 'anomaly', 'opportunity', 'risk'])
    .withMessage('Invalid insight type'),
  body('severity')
    .isIn(['low', 'medium', 'high'])
    .withMessage('Invalid severity'),
  handleValidationErrors
];

// Parameter validations - Corrigido para aceitar IDs do MySQL
const validateId = [
  param('id')
    .isLength({ min: 1 })
    .withMessage('Invalid ID format'),
  handleValidationErrors
];

const validateCompanyId = [
  param('companyId')
    .isLength({ min: 1 })
    .withMessage('Invalid company ID formatff'),
  handleValidationErrors
];

const validateChartId = [
  param('chartId')
    .isLength({ min: 1 })
    .withMessage('Invalid chart ID format'),
  handleValidationErrors
];

const validateReportId = [
  param('reportId')
    .isUUID() // Melhor validação para UUID
    .withMessage('Invalid report ID format')
    .notEmpty()
    .withMessage('Report ID is required'),
  handleValidationErrors
];

// Query validations
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

// Report validation
const validateReportTemplate = [
  body('title')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Title must be between 2 and 255 characters'),
  body('fields')
    .isArray({ min: 1 })
    .withMessage('At least one field is required'),
  body('fields.*.name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Field name is required'),
  body('fields.*.type')
    .isIn(['text', 'number', 'date', 'select', 'boolean'])
    .withMessage('Invalid field type'),
  handleValidationErrors
];

const validateCompanyReport = [
  body('template_id')
    .isLength({ min: 1 })
    .withMessage('Template ID is required'),
  body('company_id')
    .isLength({ min: 1 })
    .withMessage('Company ID is required'),
  body('title')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Title must be between 2 and 255 characters'),
  body('client_can_edit')
    .isBoolean()
    .withMessage('client_can_edit must be a boolean'),
  handleValidationErrors
];

const validateReportEntry = [
  body('data')
    .isObject()
    .withMessage('Data must be an object'),
  body('entry_date')
    .isISO8601()
    .withMessage('Valid date is required'),
  handleValidationErrors
];

// Company user validation
const validateCompanyUser = [
  body('company_id')
    .isLength({ min: 1 })
    .withMessage('Company ID is required'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('role')
    .isIn(['admin', 'user'])
    .withMessage('Role must be admin or user'),
  handleValidationErrors
];
const validateInventoryStock = [
  body('company_id')
    .isLength({ min: 1 })
    .withMessage('Company ID is required'),
  body('report_id')
    .isLength({ min: 1 })
    .withMessage('Report ID is required'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Stock name must be between 2 and 255 characters'),
  body('stock_type')
    .isIn(['raw_material', 'finished_product', 'parts', 'tools', 'other'])
    .withMessage('Invalid stock type'),
  handleValidationErrors
];
// Inventory validations
const validateInventoryMovement = [
  body('item_id')
    .isLength({ min: 1 })
    .withMessage('Item ID is required'),
  body('movement_type')
    .isIn(['entry', 'exit', 'transfer_out', 'transfer_in', 'adjustment'])
    .withMessage('Invalid movement type'),
  body('quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be greater than 0'),
  body('movement_date')
    .isISO8601()
    .withMessage('Valid movement date is required'),
  handleValidationErrors
];

const validateInventoryDestination = [
  body('company_id')
    .isLength({ min: 1 })
    .withMessage('Company ID is required'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Destination name must be between 2 and 255 characters'),
  body('type')
    .isIn(['farm', 'lot', 'machine', 'warehouse', 'customer', 'other'])
    .withMessage('Invalid destination type'),
  handleValidationErrors
];

const validatePublicSignup = [
  body('companyName')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Company name is required'),
  body('cnpj')
    .trim()
    .isLength({ min: 14 })
    .withMessage('Valid CNPJ is required'),
  body('responsibleName')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Responsible name is required'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('phone')
    .trim()
    .isLength({ min: 10 })
    .withMessage('Valid phone is required'),
  body('planId')
    .isUUID()
    .withMessage('Valid plan ID is required'),
  body('property')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Property name is required'),
  body('cultures')
    .isArray({ min: 1 })
    .withMessage('At least one culture is required'),
  body('area')
    .isFloat({ min: 0 })
    .withMessage('Area must be a positive number'),
  handleValidationErrors
];

const validateSubscription = [
  body('signupId')
    .isUUID()
    .withMessage('Valid signup ID is required'),
  body('paymentData')
    .isObject()
    .withMessage('Payment data is required'),
  handleValidationErrors
];

const validatePayment = [
  body('paymentIntentId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Payment intent ID is required'),
  body('subscriptionId')
    .isUUID()
    .withMessage('Valid subscription ID is required'),
  handleValidationErrors
];

const validateArticle = [
  body('title')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Title is required'),
  body('summary')
    .trim()
    .isLength({ min: 10 })
    .withMessage('Summary must be at least 10 characters'),
  body('category')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Category is required'),
  handleValidationErrors
];

const validateArticleCategory = [
  body('name')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Category name is required'),
  body('color')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Color must be a valid hex color'),
  body('sort_order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Sort order must be a positive integer'),
  handleValidationErrors
];

const validatePasswordUpdate = [
  body('currentPassword')
    .isLength({ min: 1 })
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
  handleValidationErrors
];

const validateProfileUpdate = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  // body('email')
  //   .isEmail()
  //   .normalizeEmail()
  //   .withMessage('Valid email is required'),
  body('phone')
    .optional()
    .matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)
    .withMessage('Phone must be in format (11) 99999-9999'),
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio must be less than 500 characters'),
  handleValidationErrors
];

// Password reset validations
const validatePasswordReset = [
  body('email')
    .isEmail()
    // .normalizeEmail()
    .withMessage('Valid email is required'),
  handleValidationErrors
];

const validateResetPassword = [
  body('token')
    .isLength({ min: 1 })
    .withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
  handleValidationErrors
];

// Inventory adjustment request validations
const validateAdjustmentRequest = [
  body('item_id')
    .isUUID()
    .withMessage('Valid item ID is required'),
  body('movement_type')
    .isIn(['entry', 'exit', 'transfer_out', 'transfer_in', 'adjustment'])
    .withMessage('Valid movement type is required'),
  body('quantity')
    .isFloat({ min: 0 })
    .withMessage('Quantity must be a positive number'),
  body('movement_date')
    .isISO8601()
    .withMessage('Valid movement date is required'),
  body('reason')
    .trim()
    .isLength({ min: 5 })
    .withMessage('Reason must be at least 5 characters'),
  handleValidationErrors
];

module.exports = {
  validateLogin,
  validateRegister,
  validateCompany,
  validateChart,
  validateDataEntry,
  validateGoal,
  validateAlert,
  validateInsight,
  validateId,
  validateCompanyId,
  validateChartId,
  validateReportId,
  validatePagination,
  handleValidationErrors,
  validateReportTemplate,
  validateCompanyReport,
  validateReportEntry,
  validateCompanyUser,
  validateInventoryStock,
  validateInventoryDestination,
  validateInventoryMovement,
  validatePublicSignup,
  validateSubscription,
  validatePayment,
  validateArticle,
  validateArticleCategory,
  validateProfileUpdate,
  validatePasswordUpdate,
  validatePasswordReset,
  validateResetPassword,
  validateAdjustmentRequest
};