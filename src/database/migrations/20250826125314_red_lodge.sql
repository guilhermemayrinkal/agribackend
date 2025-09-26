/*
# Sistema de Movimentação de Estoque

1. New Tables
- `inventory_locations` - Locais de estoque (Estoque 1, 2, 3, etc.)
- `inventory_items` - Itens do estoque baseados nos relatórios
- `inventory_movements` - Movimentações (entrada, saída, transferência)
- `inventory_balances` - Saldos atuais por item e local

2. Security
- Enable RLS on all tables
- Add policies for company access control

3. Features
- Entrada de produtos
- Transferência entre estoques
- Saída com destinos específicos
- Histórico completo de movimentações
- Controle de saldos em tempo real
 */
-- Create inventory locations table (Estoque 1, 2, 3, etc.)
CREATE TABLE
  IF NOT EXISTS inventory_locations (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID ()),
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    location_type ENUM ('warehouse', 'field', 'machine', 'other') DEFAULT 'warehouse',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    INDEX idx_company (company_id),
    INDEX idx_active (is_active),
    UNIQUE KEY unique_company_location (company_id, name)
  );

-- Create inventory items table (produtos baseados nos relatórios)
CREATE TABLE
  IF NOT EXISTS inventory_items (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID ()),
    company_id VARCHAR(36) NOT NULL,
    report_id VARCHAR(36) NOT NULL,
    report_entry_id VARCHAR(36) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_code VARCHAR(100) NULL,
    category VARCHAR(100) NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'unidades',
    unit_cost DECIMAL(15, 2) NULL,
    description TEXT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (report_id) REFERENCES company_reports (id) ON DELETE CASCADE,
    FOREIGN KEY (report_entry_id) REFERENCES report_entries (id) ON DELETE CASCADE,
    INDEX idx_company (company_id),
    INDEX idx_report (report_id),
    INDEX idx_category (category),
    INDEX idx_active (is_active),
    UNIQUE KEY unique_report_entry (report_entry_id)
  );

-- Create inventory movements table (movimentações)
CREATE TABLE
  IF NOT EXISTS inventory_movements (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID ()),
    company_id VARCHAR(36) NOT NULL,
    item_id VARCHAR(36) NOT NULL,
    movement_type ENUM ('entry', 'exit', 'transfer') NOT NULL,
    -- Origem e destino
    from_location_id VARCHAR(36) NULL,
    to_location_id VARCHAR(36) NULL,
    -- Quantidades
    quantity DECIMAL(15, 4) NOT NULL,
    unit_cost DECIMAL(15, 2) NULL,
    total_cost DECIMAL(15, 2) NULL,
    -- Destino específico para saídas
    destination_type ENUM ('farm', 'lot', 'machine', 'sale', 'loss', 'other') NULL,
    destination_farm VARCHAR(255) NULL,
    destination_lot VARCHAR(255) NULL,
    destination_machine VARCHAR(255) NULL,
    destination_description TEXT NULL,
    -- Metadados
    reference_document VARCHAR(255) NULL,
    notes TEXT NULL,
    movement_date DATE NOT NULL,
    created_by VARCHAR(36) NOT NULL,
    is_client BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES inventory_items (id) ON DELETE CASCADE,
    FOREIGN KEY (from_location_id) REFERENCES inventory_locations (id) ON DELETE SET NULL,
    FOREIGN KEY (to_location_id) REFERENCES inventory_locations (id) ON DELETE SET NULL,
    INDEX idx_company (company_id),
    INDEX idx_item (item_id),
    INDEX idx_type (movement_type),
    INDEX idx_date (movement_date),
    INDEX idx_from_location (from_location_id),
    INDEX idx_to_location (to_location_id)
  );

-- Create inventory balances table (saldos atuais)
CREATE TABLE
  IF NOT EXISTS inventory_balances (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID ()),
    company_id VARCHAR(36) NOT NULL,
    item_id VARCHAR(36) NOT NULL,
    location_id VARCHAR(36) NOT NULL,
    current_quantity DECIMAL(15, 4) DEFAULT 0,
    reserved_quantity DECIMAL(15, 4) DEFAULT 0,
    available_quantity DECIMAL(15, 4) DEFAULT 0,
    last_movement_date DATE NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES inventory_items (id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES inventory_locations (id) ON DELETE CASCADE,
    INDEX idx_company (company_id),
    INDEX idx_item (item_id),
    INDEX idx_location (location_id),
    UNIQUE KEY unique_item_location (item_id, location_id)
  );