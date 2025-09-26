const bcrypt = require('bcryptjs');
const { executeQuery } = require('../../config/database');

const companies = [
  {
    name: 'João Silva',
    email: 'joao@techsolutions.com',
    password: '123456',
    company_name: 'TechSolutions Ltda',
    cnpj: '12.345.678/0001-90',
    sector: 'Tecnologia',
    business_type: 'technology',
    analyst_email: 'carlos@businessanalytics.com'
  },
  {
    name: 'Maria Santos',
    email: 'maria@retailplus.com',
    password: '123456',
    company_name: 'RetailPlus S.A.',
    cnpj: '98.765.432/0001-10',
    sector: 'Varejo',
    business_type: 'retail',
    analyst_email: 'carlos@businessanalytics.com'
  },
  {
    name: 'Pedro Costa',
    email: 'pedro@manufacturemax.com',
    password: '123456',
    company_name: 'ManufactureMax Ind.',
    cnpj: '11.222.333/0001-44',
    sector: 'Indústria',
    business_type: 'manufacturing',
    analyst_email: 'ana@businessanalytics.com'
  }
];

const seedCompanies = async () => {
  console.log('🌱 Seeding companies...');
  
  for (const company of companies) {
    try {
      // Get analyst ID
      const [analyst] = await executeQuery(
        'SELECT id FROM users WHERE email = ?',
        [company.analyst_email]
      );
      
      if (!analyst) {
        console.log(`⚠️  Analyst not found: ${company.analyst_email}`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(company.password, 12);
      await executeQuery(
        `INSERT INTO companies (name, email, password, company_name, cnpj, sector, business_type, analyst_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          company.name, 
          company.email, 
          hashedPassword, 
          company.company_name, 
          company.cnpj, 
          company.sector, 
          company.business_type, 
          analyst.id
        ]
      );
      console.log(`✅ Company created: ${company.email}`);
    } catch (error) {
      console.log(`⚠️  Company already exists: ${company.email}`);
    }
  }
};

module.exports = { seedCompanies };