-- Create companies table (clients)
CREATE TABLE IF NOT EXISTS companies (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20) UNIQUE NOT NULL,
    sector VARCHAR(100) NOT NULL,
    business_type ENUM('retail', 'manufacturing', 'services', 'technology', 'healthcare', 'finance', 'agriculture', 'other') NOT NULL,
    analyst_id VARCHAR(36) NULL,
    
    -- Agricultural specific fields
    property VARCHAR(255) NULL,
    cultures JSON NULL,
    area DECIMAL(10,2) NULL,
    area_unit ENUM('hectares', 'alqueires', 'm²') NULL,
    
    -- Address fields
    street VARCHAR(255) NULL,
    number VARCHAR(20) NULL,
    complement VARCHAR(100) NULL,
    neighborhood VARCHAR(100) NULL,
    city VARCHAR(100) NULL,
    state VARCHAR(2) NULL,
    zip_code VARCHAR(10) NULL,
    
    avatar VARCHAR(255) NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (analyst_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_email (email),
    INDEX idx_cnpj (cnpj),
    INDEX idx_analyst (analyst_id),
    INDEX idx_business_type (business_type),
    INDEX idx_active (is_active)
);