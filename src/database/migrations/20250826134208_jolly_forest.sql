/*
# Sistema Completo de Movimentação de Estoque

1. New Tables
- `inventory_stocks` - Estoques criados pelo analista baseados nos relatórios
- `inventory_items` - Itens do estoque sincronizados dos dados dos relatórios
- `inventory_movements` - Movimentações (entrada, saída, transferência, ajuste)
- `inventory_destinations` - Destinos para saídas (fazenda, lote, máquina, etc.)

2. Security
- Todas as tabelas com foreign keys apropriadas
- Índices para performance otimizada
- Campos de auditoria (created_at, updated_at)
- Controle de acesso baseado em empresa

3. Features
- Controle de quantidade atual e mínima
- Histórico completo de movimentações
- Destinos flexíveis para saídas
- Transferências entre estoques
- Cálculo automático de valores
- Sincronização com relatórios existentes
 */
-- Create inventory stocks table (estoques criados pelo analista)
CREATE TABLE
  IF NOT EXISTS inventory_stocks (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID ()),
    company_id VARCHAR(36) NOT NULL,
    analyst_id VARCHAR(36) NOT NULL,
    report_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    location VARCHAR(255) NULL,
    stock_type ENUM (
      'raw_material',
      'finished_product',
      'parts',
      'tools',
      'supplies',
      'other'
    ) DEFAULT 'other',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (analyst_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (report_id) REFERENCES company_reports (id) ON DELETE CASCADE,
    INDEX idx_company (company_id),
    INDEX idx_analyst (analyst_id),
    INDEX idx_report (report_id),
    INDEX idx_active (is_active),
    INDEX idx_stock_type (stock_type)
  );

-- Create inventory destinations table (destinos para saídas)
CREATE TABLE
  IF NOT EXISTS inventory_destinations (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID ()),
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type ENUM (
      'farm',
      'lot',
      'machine',
      'warehouse',
      'customer',
      'other'
    ) NOT NULL,
    description TEXT NULL,
    location VARCHAR(255) NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    INDEX idx_company (company_id),
    INDEX idx_type (type),
    INDEX idx_active (is_active),
    INDEX idx_name (name)
  );

-- Create inventory items table (itens do estoque baseados nos dados do relatório)
-- Já criamos com a generated column desde o início
CREATE TABLE
  IF NOT EXISTS inventory_items (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID ()),
    stock_id VARCHAR(36) NOT NULL,
    report_entry_id VARCHAR(36) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_code VARCHAR(100) NULL,
    description TEXT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'unidades',
    current_quantity DECIMAL(15, 4) DEFAULT 0,
    minimum_quantity DECIMAL(15, 4) DEFAULT 0,
    maximum_quantity DECIMAL(15, 4) NULL,
    unit_cost DECIMAL(15, 2) NULL,
    -- Coluna calculada automaticamente
    total_value DECIMAL(15, 2) GENERATED ALWAYS AS (current_quantity * COALESCE(unit_cost, 0)) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_id) REFERENCES inventory_stocks (id) ON DELETE CASCADE,
    FOREIGN KEY (report_entry_id) REFERENCES report_entries (id) ON DELETE CASCADE,
    INDEX idx_stock (stock_id),
    INDEX idx_entry (report_entry_id),
    INDEX idx_name (item_name),
    INDEX idx_code (item_code),
    INDEX idx_quantity (current_quantity),
    INDEX idx_low_stock (current_quantity, minimum_quantity)
  );

-- Create inventory movements table (movimentações de estoque)
CREATE TABLE
  IF NOT EXISTS inventory_movements (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID ()),
    item_id VARCHAR(36) NOT NULL,
    movement_type ENUM (
      'entry',
      'exit',
      'transfer_out',
      'transfer_in',
      'adjustment'
    ) NOT NULL,
    quantity DECIMAL(15, 4) NOT NULL,
    unit_cost DECIMAL(15, 2) NULL,
    total_cost DECIMAL(15, 2) NULL,
    -- Para transferências entre estoques
    from_stock_id VARCHAR(36) NULL,
    to_stock_id VARCHAR(36) NULL,
    -- Para saídas com destino específico
    destination_id VARCHAR(36) NULL,
    destination_details TEXT NULL,
    -- Informações gerais da movimentação
    movement_date DATE NOT NULL,
    reference_number VARCHAR(100) NULL,
    notes TEXT NULL,
    created_by VARCHAR(36) NOT NULL,
    is_client BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES inventory_items (id) ON DELETE CASCADE,
    FOREIGN KEY (from_stock_id) REFERENCES inventory_stocks (id) ON DELETE SET NULL,
    FOREIGN KEY (to_stock_id) REFERENCES inventory_stocks (id) ON DELETE SET NULL,
    FOREIGN KEY (destination_id) REFERENCES inventory_destinations (id) ON DELETE SET NULL,
    INDEX idx_item (item_id),
    INDEX idx_type (movement_type),
    INDEX idx_date (movement_date),
    INDEX idx_from_stock (from_stock_id),
    INDEX idx_to_stock (to_stock_id),
    INDEX idx_destination (destination_id),
    INDEX idx_created_by (created_by),
    INDEX idx_client (is_client)
  );

-- Insert default destination types for companies that already exist
INSERT IGNORE INTO inventory_destinations (
  id,
  company_id,
  name,
  type,
  description,
  created_at,
  updated_at
)
SELECT
  UUID () as id,
  id as company_id,
  'Fazenda Principal' as name,
  'farm' as type,
  'Área principal de plantio da propriedade' as description,
  NOW () as created_at,
  NOW () as updated_at
FROM
  companies
WHERE
  is_active = TRUE;

INSERT IGNORE INTO inventory_destinations (
  id,
  company_id,
  name,
  type,
  description,
  created_at,
  updated_at
)
SELECT
  UUID () as id,
  id as company_id,
  'Depósito Central' as name,
  'warehouse' as type,
  'Armazém principal da propriedade' as description,
  NOW () as created_at,
  NOW () as updated_at
FROM
  companies
WHERE
  is_active = TRUE;