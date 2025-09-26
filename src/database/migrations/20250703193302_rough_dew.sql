-- Create chart templates table
CREATE TABLE IF NOT EXISTS chart_templates (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    type ENUM('bar', 'line', 'pie', 'area', 'scatter') NOT NULL,
    category VARCHAR(100) NOT NULL,
    fields JSON NOT NULL,
    config JSON NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_category (category),
    INDEX idx_type (type),
    INDEX idx_active (is_active)
);