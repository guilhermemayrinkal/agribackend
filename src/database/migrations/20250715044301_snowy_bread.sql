-- Add dashboard_url column to companies table
ALTER TABLE companies ADD COLUMN dashboard_url VARCHAR(1024) NULL;

-- Add index for better performance
CREATE INDEX idx_dashboard_url ON companies(dashboard_url(255));