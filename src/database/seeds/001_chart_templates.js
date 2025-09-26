const { executeQuery } = require('../../config/database');

const chartTemplates = [
  {
    name: 'Análise de Receitas',
    description: 'Acompanhe receitas por fonte e período',
    type: 'bar',
    category: 'Financeiro',
    fields: JSON.stringify([
      { id: 'period', name: 'Período', type: 'date', required: true },
      { id: 'source', name: 'Fonte de Receita', type: 'text', required: true },
      { id: 'value', name: 'Valor', type: 'number', required: true, unit: 'R$' },
      { id: 'quantity', name: 'Quantidade', type: 'number', required: false, unit: 'unidades' }
    ]),
    config: JSON.stringify({
      colors: ['#10B981', '#3B82F6', '#F59E0B'],
      showLegend: true,
      showGrid: true
    })
  },
  {
    name: 'Análise de Custos',
    description: 'Controle custos por categoria e período',
    type: 'pie',
    category: 'Financeiro',
    fields: JSON.stringify([
      { id: 'period', name: 'Período', type: 'date', required: true },
      { id: 'category', name: 'Categoria de Custo', type: 'text', required: true },
      { id: 'value', name: 'Valor', type: 'number', required: true, unit: 'R$' },
      { id: 'description', name: 'Descrição', type: 'text', required: false }
    ]),
    config: JSON.stringify({
      colors: ['#EF4444', '#F59E0B', '#8B5CF6', '#6B7280'],
      showLegend: true
    })
  },
  {
    name: 'Volume de Produção',
    description: 'Acompanhe volumes produzidos por cultura',
    type: 'line',
    category: 'Produção',
    fields: JSON.stringify([
      { id: 'period', name: 'Período', type: 'date', required: true },
      { id: 'culture', name: 'Cultura', type: 'text', required: true },
      { id: 'volume', name: 'Volume Produzido', type: 'number', required: true, unit: 'toneladas' },
      { id: 'area', name: 'Área Plantada', type: 'number', required: false, unit: 'hectares' },
      { id: 'productivity', name: 'Produtividade', type: 'number', required: false, unit: 'ton/ha' }
    ]),
    config: JSON.stringify({
      colors: ['#10B981', '#3B82F6'],
      showGrid: true,
      strokeWidth: 3
    })
  },
  {
    name: 'Preços de Commodities',
    description: 'Monitore preços de commodities agrícolas',
    type: 'line',
    category: 'Mercado',
    fields: JSON.stringify([
      { id: 'date', name: 'Data', type: 'date', required: true },
      { id: 'commodity', name: 'Commodity', type: 'text', required: true },
      { id: 'price', name: 'Preço', type: 'number', required: true, unit: 'R$/ton' },
      { id: 'market', name: 'Mercado', type: 'text', required: false },
      { id: 'variation', name: 'Variação %', type: 'percentage', required: false, unit: '%' }
    ]),
    config: JSON.stringify({
      colors: ['#F59E0B', '#EF4444'],
      showGrid: true
    })
  },
  {
    name: 'Eficiência Operacional',
    description: 'Monitore indicadores de eficiência',
    type: 'bar',
    category: 'Operacional',
    fields: JSON.stringify([
      { id: 'period', name: 'Período', type: 'date', required: true },
      { id: 'indicator', name: 'Indicador', type: 'text', required: true },
      { id: 'value', name: 'Valor', type: 'number', required: true },
      { id: 'target', name: 'Meta', type: 'number', required: false },
      { id: 'unit', name: 'Unidade', type: 'text', required: false }
    ]),
    config: JSON.stringify({
      colors: ['#3B82F6', '#10B981'],
      showGrid: true
    })
  },
  {
    name: 'Performance de Vendas',
    description: 'Acompanhe vendas por canal e produto',
    type: 'bar',
    category: 'Vendas',
    fields: JSON.stringify([
      { id: 'period', name: 'Período', type: 'date', required: true },
      { id: 'channel', name: 'Canal de Venda', type: 'text', required: true },
      { id: 'product', name: 'Produto', type: 'text', required: true },
      { id: 'quantity', name: 'Quantidade', type: 'number', required: true, unit: 'unidades' },
      { id: 'revenue', name: 'Receita', type: 'number', required: true, unit: 'R$' }
    ]),
    config: JSON.stringify({
      colors: ['#10B981', '#3B82F6'],
      showGrid: true
    })
  }
];

const seedChartTemplates = async () => {
  console.log('🌱 Seeding chart templates...');
  
  for (const template of chartTemplates) {
    try {
      await executeQuery(
        `INSERT INTO chart_templates (name, description, type, category, fields, config) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [template.name, template.description, template.type, template.category, template.fields, template.config]
      );
      console.log(`✅ Template created: ${template.name}`);
    } catch (error) {
      console.log(`⚠️  Template already exists or error: ${template.name}`);
    }
  }
};

module.exports = { seedChartTemplates };