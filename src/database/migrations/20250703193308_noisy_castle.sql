-- Create data entries table
CREATE TABLE IF NOT EXISTS data_entries (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    chart_id VARCHAR(36) NOT NULL,
    company_id VARCHAR(36) NOT NULL,
    analyst_id VARCHAR(36) NOT NULL,
    data JSON NOT NULL,
    entry_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (chart_id) REFERENCES custom_charts(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (analyst_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_chart (chart_id),
    INDEX idx_company (company_id),
    INDEX idx_analyst (analyst_id),
    INDEX idx_date (entry_date)
);