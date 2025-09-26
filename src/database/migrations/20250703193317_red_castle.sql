-- Create insights table
CREATE TABLE IF NOT EXISTS insights (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    company_id VARCHAR(36) NOT NULL,
    analyst_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    type ENUM('trend', 'anomaly', 'opportunity', 'risk') NOT NULL,
    severity ENUM('low', 'medium', 'high') DEFAULT 'medium',
    data_source JSON NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (analyst_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_company (company_id),
    INDEX idx_analyst (analyst_id),
    INDEX idx_type (type),
    INDEX idx_severity (severity),
    INDEX idx_read (is_read)
);