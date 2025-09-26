-- Create custom charts table
CREATE TABLE IF NOT EXISTS custom_charts (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    company_id VARCHAR(36) NOT NULL,
    analyst_id VARCHAR(36) NOT NULL,
    template_id VARCHAR(36) NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    type ENUM('bar', 'line', 'pie', 'area', 'scatter') NOT NULL,
    category VARCHAR(100) NOT NULL,
    fields JSON NOT NULL,
    config JSON NULL,
    data_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (analyst_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES chart_templates(id) ON DELETE SET NULL,
    INDEX idx_company (company_id),
    INDEX idx_analyst (analyst_id),
    INDEX idx_category (category),
    INDEX idx_type (type),
    INDEX idx_active (is_active)
);