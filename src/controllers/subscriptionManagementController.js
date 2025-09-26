const { v4: uuidv4 } = require('uuid');
const { executeQuery, executeTransaction } = require('../config/database');

// helpers
const detectCardBrand = (num) => {
  const n = (num || '').replace(/\s+/g, '');
  if (/^4\d{12,18}$/.test(n)) return 'visa';
  if (/^5[1-5]\d{14}$/.test(n)) return 'mastercard';
  if (/^3[47]\d{13}$/.test(n)) return 'amex';
  if (/^6(?:011|5\d{2})\d{12}$/.test(n)) return 'discover';
  return 'card';
};

const parseExpiry = (exp) => {
  // "MM/AA" ou "MM/AAAA"
  const clean = (exp || '').replace(/\s/g, '');
  const m = clean.match(/^(\d{2})[\/\-]?(\d{2,4})$/);
  if (!m) return { month: null, year: null };
  const month = m[1];
  let year = m[2];
  if (year.length === 2) year = '20' + year;
  return { month, year };
};

// Checa se user pode operar esta assinatura
const buildWhereForAccess = (req, subscriptionId) => {
  const { role, id: userId, companyId } = req.user;

  let whereClause = 'WHERE s.id = ?';
  const params = [subscriptionId];

  if (role !== 'admin') {
    // client usa id como company_id; company_user usa companyId
    const targetCompanyId = role === 'company_user' ? companyId : userId;
    whereClause += ' AND s.company_id = ?';
    params.push(targetCompanyId);
  }
  return { whereClause, params };
};

// GET /subscriptions/plans
const listPlans = async (req, res, next) => {
  try {
    const plans = await executeQuery(
      `SELECT id, name, price FROM subscription_plans WHERE is_active = 1 ORDER BY price ASC`
    );
    res.json({ success: true, data: plans });
  } catch (e) { next(e); }
};

// POST /subscriptions/:id/payment-method
const updatePaymentMethod = async (req, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    const { method, card } = req.body; // { method: 'card'|'pix'|'boleto', card?: {number,expiry,cvc,name} }

    if (!['card', 'pix', 'boleto'].includes((method || '').toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Método inválido' });
    }

    // Carrega assinatura com controle de acesso
    const access = buildWhereForAccess(req, subscriptionId);
    const [sub] = await executeQuery(
      `SELECT s.*, sp.price as plan_price
       FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       ${access.whereClause}`,
      access.params
    );
    if (!sub) return res.status(404).json({ success: false, message: 'Assinatura não encontrada' });

    // Regra: PIX/BOLETO apenas yearly
    if ((method === 'pix' || method === 'boleto') && sub.billing_interval !== 'yearly') {
      return res.status(400).json({ success: false, message: 'PIX e Boleto estão disponíveis apenas no plano anual.' });
    }

    // Monta queries da transação
    const queries = [];

    // 1) Atualiza assinatura com preferred_payment_method
    queries.push({
      query: `UPDATE subscriptions SET preferred_payment_method = ? WHERE id = ?`,
      params: [method, subscriptionId]
    });

    // 2) Persiste/mascara dados do cartão (se for card)
    if (method === 'card') {
      if (!card || !card.number || !card.expiry || !card.name) {
        return res.status(400).json({ success: false, message: 'Dados do cartão incompletos' });
      }
      const last4 = card.number.replace(/\D/g, '').slice(-4);
      const brand = detectCardBrand(card.number);
      const { month, year } = parseExpiry(card.expiry);

      const dataJson = JSON.stringify({
        brand, last4, expiry_month: month, expiry_year: year, name: card.name
      });

      // marca todos como não-default e insere novo como default
      queries.push({
        query: `UPDATE subscription_payment_methods SET is_default = 0 WHERE subscription_id = ?`,
        params: [subscriptionId]
      });
      queries.push({
        query: `INSERT INTO subscription_payment_methods (id, subscription_id, method, data_json, is_default)
                VALUES (?, ?, ?, ?, 1)`,
        params: [uuidv4(), subscriptionId, 'card', dataJson]
      });
    } else {
      // se método foi alterado para pix/boleto, apenas limpa default de cartão (opcional)
      queries.push({
        query: `UPDATE subscription_payment_methods SET is_default = 0 WHERE subscription_id = ?`,
        params: [subscriptionId]
      });
    }

    await executeTransaction(queries);

    res.json({ success: true, message: 'Método de pagamento atualizado com sucesso' });
  } catch (e) { next(e); }
};

// POST /subscriptions/:id/change-plan
const changePlan = async (req, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    let { planId, billingPeriod } = req.body; // billingPeriod: 'monthly'|'yearly'

    if (!planId) return res.status(400).json({ success: false, message: 'Informe o plano' });
    billingPeriod = (billingPeriod === 'yearly') ? 'yearly' : 'monthly';

    // Carrega assinatura + plano alvo com controle de acesso
    const access = buildWhereForAccess(req, subscriptionId);
    const [sub] = await executeQuery(
      `SELECT * FROM subscriptions s ${access.whereClause}`,
      access.params
    );
    if (!sub) return res.status(404).json({ success: false, message: 'Assinatura não encontrada' });

    const [plan] = await executeQuery(`SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1`, [planId]);
    if (!plan) return res.status(404).json({ success: false, message: 'Plano não encontrado' });

    // Regra PIX/BOLETO x monthly
    if (billingPeriod === 'monthly' && ['pix', 'boleto'].includes(sub.preferred_payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Sua assinatura usa PIX/BOLETO. Selecione cartão ou mude para anual.'
      });
    }

    const queries = [];

    // Atualiza plano e billing_interval
    queries.push({
      query: `UPDATE subscriptions SET plan_id = ?, billing_interval = ? WHERE id = ?`,
      params: [planId, billingPeriod, subscriptionId]
    });

    // Se estiver em trial, podemos ajustar o current_period_end para refletir novo ciclo
    if (sub.status === 'trialing') {
      const start = new Date(sub.current_period_start);
      const end = new Date(start);
      const months = billingPeriod === 'yearly' ? 12 : 1;
      end.setMonth(end.getMonth() + months);

      queries.push({
        query: `UPDATE subscriptions SET current_period_end = ? WHERE id = ?`,
        params: [end.toISOString().split('T')[0], subscriptionId]
      });
    }

    await executeTransaction(queries);

    // Retorna assinatura atualizada
    const [updated] = await executeQuery(
      `SELECT s.*, sp.name as plan_name, sp.price as plan_price
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.id = ?`,
      [subscriptionId]
    );

    res.json({ success: true, message: 'Plano alterado com sucesso', data: updated });
  } catch (e) { next(e); }
};

// POST /subscriptions/:id/billing-period
const changeBillingPeriod = async (req, res, next) => {
  try {
    const { id: subscriptionId } = req.params;
    let { billingPeriod } = req.body; // 'monthly' | 'yearly'
    billingPeriod = (billingPeriod === 'yearly') ? 'yearly' : 'monthly';

    const access = buildWhereForAccess(req, subscriptionId);
    const [sub] = await executeQuery(
      `SELECT * FROM subscriptions s ${access.whereClause}`,
      access.params
    );
    if (!sub) return res.status(404).json({ success: false, message: 'Assinatura não encontrada' });

    // Regra PIX/BOLETO x monthly
    if (billingPeriod === 'monthly' && ['pix', 'boleto'].includes(sub.preferred_payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Sua assinatura usa PIX/BOLETO. Selecione cartão ou mude a periodicidade para anual.'
      });
    }

    const queries = [];
    queries.push({
      query: `UPDATE subscriptions SET billing_interval = ? WHERE id = ?`,
      params: [billingPeriod, subscriptionId]
    });

    // Se estiver em trial, ajusta end do período atual para refletir o novo ciclo
    if (sub.status === 'trialing') {
      const start = new Date(sub.current_period_start);
      const end = new Date(start);
      const months = billingPeriod === 'yearly' ? 12 : 1;
      end.setMonth(end.getMonth() + months);
      queries.push({
        query: `UPDATE subscriptions SET current_period_end = ? WHERE id = ?`,
        params: [end.toISOString().split('T')[0], subscriptionId]
      });
    }

    await executeTransaction(queries);

    const [updated] = await executeQuery(
      `SELECT s.*, sp.name as plan_name, sp.price as plan_price
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.id = ?`,
      [subscriptionId]
    );

    res.json({ success: true, message: 'Periodicidade alterada com sucesso', data: updated });
  } catch (e) { next(e); }
};

module.exports = {
  listPlans,
  updatePaymentMethod,
  changePlan,
  changeBillingPeriod
};
