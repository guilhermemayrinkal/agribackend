-- Create report templates table
CREATE TABLE IF NOT EXISTS report_templates (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    analyst_id VARCHAR(36) NOT NULL,
    fields JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (analyst_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_analyst (analyst_id),
    INDEX idx_active (is_active)
);

-- Create company reports table (instances of templates assigned to companies)
CREATE TABLE IF NOT EXISTS company_reports (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    template_id VARCHAR(36) NOT NULL,
    company_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    client_can_edit BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_template (template_id),
    INDEX idx_company (company_id),
    INDEX idx_active (is_active)
);

-- Create report entries table (actual data rows)
CREATE TABLE IF NOT EXISTS report_entries (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    report_id VARCHAR(36) NOT NULL,
    data JSON NOT NULL,
    created_by VARCHAR(36) NOT NULL,
    is_client BOOLEAN DEFAULT FALSE,
    entry_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (report_id) REFERENCES company_reports(id) ON DELETE CASCADE,
    INDEX idx_report (report_id),
    INDEX idx_date (entry_date)
);