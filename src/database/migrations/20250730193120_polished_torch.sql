-- Create company users table for additional users within companies
CREATE TABLE
  IF NOT EXISTS company_users (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID ()),
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM ('admin', 'user') DEFAULT 'user',
    -- Permissions
    can_view_reports BOOLEAN DEFAULT TRUE,
    can_edit_reports BOOLEAN DEFAULT FALSE,
    can_view_charts BOOLEAN DEFAULT TRUE,
    can_view_goals BOOLEAN DEFAULT TRUE,
    can_view_alerts BOOLEAN DEFAULT TRUE,
    can_view_insights BOOLEAN DEFAULT TRUE,
    can_view_financial_data BOOLEAN DEFAULT FALSE,
    can_export_data BOOLEAN DEFAULT FALSE,
    avatar VARCHAR(255) NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    INDEX idx_company (company_id),
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_active (is_active)
  );