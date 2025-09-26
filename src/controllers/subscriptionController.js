const bcrypt = require('bcryptjs');
const { executeQuery, executeTransaction } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Helper function to convert undefined to null for MySQL compatibility
const safeValue = (value) => value === undefined ? null : value;

const getSubscriptionPlans = async (req, res, next) => {
  try {
    const plans = await executeQuery(
      'SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY price ASC'
    );

    // Parse features JSON
    plans.forEach(plan => {
      if (plan.features) {
        try {
          plan.features = JSON.parse(plan.features);
        } catch (e) {
          plan.features = [];
        }
      }
    });

    res.json({
      success: true,
      data: plans
    });

  } catch (error) {
    next(error);
  }
};
const confirmPayment = async (req, res, next) => {
  try {
    const { paymentIntentId, subscriptionId } = req.body;

    // Update payment status
    await executeQuery(
      `UPDATE payments SET 
        status = 'succeeded', 
        stripe_payment_intent_id = ?, 
        paid_at = NOW()
       WHERE subscription_id = ? AND status = 'pending'`,
      [paymentIntentId, subscriptionId]
    );

    // Update subscription status if needed
    await executeQuery(
      `UPDATE subscriptions SET status = 'active' WHERE id = ?`,
      [subscriptionId]
    );

    res.json({
      success: true,
      message: 'Payment confirmed successfully'
    });

  } catch (error) {
    next(error);
  }
};
const getPaymentHistory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payments = await executeQuery(
      `SELECT * FROM payments 
       WHERE subscription_id = ? 
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: payments
    });

  } catch (error) {
    next(error);
  }
};

// Get all subscription plans (public)
const getPlans = async (req, res, next) => {
  try {
    const plans = await executeQuery(
      'SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY price ASC'
    );

    // Parse features JSON
    plans.forEach(plan => {
      if (plan.features) {
        try {
          plan.features = JSON.parse(plan.features);
        } catch (e) {
          plan.features = [];
        }
      }
    });

    res.json({
      success: true,
      data: plans
    });

  } catch (error) {
    next(error);
  }
};

// Create public signup
const createPublicSignup = async (req, res, next) => {
  try {
    const {
      companyName, cnpj, responsibleName, email, phone,
      zipCode, street, number, complement, neighborhood, city, state,
      property, cultures, area, areaUnit, planId
    } = req.body;

    console.log('Creating public signup with planId:', planId);

    // Check if plan exists
    const [plan] = await executeQuery(
      'SELECT * FROM subscription_plans WHERE id = ? AND is_active = TRUE',
      [planId]
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    console.log('Plan found:', plan.name);

    // Check if email or CNPJ already exists
    const [existingCompany] = await executeQuery(
      'SELECT id FROM companies WHERE email = ? OR cnpj = ?',
      [email, cnpj]
    );

    if (existingCompany) {
      return res.status(409).json({
        success: false,
        message: 'Company with this email or CNPJ already exists'
      });
    }

    // Check if signup already exists
    const [existingSignup] = await executeQuery(
      'SELECT id FROM public_signups WHERE email = ? OR cnpj = ?',
      [email, cnpj]
    );

    if (existingSignup) {
      return res.status(409).json({
        success: false,
        message: 'Signup with this email or CNPJ already exists'
      });
    }

    // Prepare signup data
    const signupData = {
      companyName, cnpj, responsibleName, email, phone,
      zipCode, street, number, complement, neighborhood, city, state,
      property, cultures, area, areaUnit
    };

    // Create public signup record
    const result = await executeQuery(
      `INSERT INTO public_signups (
        email, company_name, responsible_name, cnpj, phone, plan_id, signup_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        companyName,
        responsibleName,
        cnpj,
        phone,
        plan.id,
        JSON.stringify(signupData)
      ]
    );

    console.log('Public signup created with ID:', result.insertId);

    res.status(201).json({
      success: true,
      message: 'Signup created successfully',
      data: {
        signupId: result.insertId,
        plan: {
          id: plan.id,
          name: plan.name,
          price: plan.price
        }
      }
    });

  } catch (error) {
    console.error('Error in createPublicSignup:', error);
    next(error);
  }
};

// controllers/subscriptionController.js
const processSubscription = async (req, res, next) => {
  try {
    const { signupId, paymentData } = req.body;

    // 0) Normaliza pagamento
    const method = (paymentData?.method || 'card').toLowerCase(); // 'card' | 'pix' | 'boleto'
    let billingInterval = (paymentData?.billingInterval === 'yearly') ? 'yearly' : 'monthly';
    if (method === 'pix' || method === 'boleto') {
      if (billingInterval !== 'yearly') {
        return res.status(400).json({
          success: false,
          message: 'PIX e Boleto estão disponíveis somente no plano ANUAL.'
        });
      }
      billingInterval = 'yearly';
    }

    // 1) Signup + plan
    const [signup] = await executeQuery(
      `SELECT ps.*, sp.*
       FROM public_signups ps
       JOIN subscription_plans sp ON ps.plan_id = sp.id
       WHERE ps.id = ? AND ps.status = 'pending'`,
      [signupId]
    );
    if (!signup) {
      return res.status(404).json({ success: false, message: 'Signup not found or already processed' });
    }

    // 2) Parse signup_data
    let signupDetails = {};
    try { signupDetails = JSON.parse(signup.signup_data); } catch { signupDetails = {}; }

    // 3) Password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // 4) Analyst
    const [analyst] = await executeQuery(
      'SELECT id FROM users WHERE role = ? AND is_active = TRUE ORDER BY created_at ASC LIMIT 1',
      ['analyst']
    );
    const analystId = analyst ? analyst.id : null;

    // 5) Transaction
    const queries = [];

    // 5.1) Company
    const companyId = uuidv4();
    queries.push({
      query: `INSERT INTO companies (
        id, name, email, password, company_name, cnpj, sector, business_type,
        analyst_id, property, cultures, area, area_unit,
        street, number, complement, neighborhood, city, state, zip_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        companyId,
        signup.responsible_name,
        signup.email,
        hashedPassword,
        signup.company_name,
        signup.cnpj,
        signupDetails.agricultural?.cultures?.join(', ') || 'Agricultura',
        'agriculture',
        analystId,
        signupDetails.agricultural?.property || signup.company_name,
        JSON.stringify(signupDetails.agricultural?.cultures || []),
        signupDetails.agricultural?.area || 0,
        signupDetails.agricultural?.areaUnit || 'hectares',
        signupDetails.address?.street,
        signupDetails.address?.number,
        signupDetails.address?.complement,
        signupDetails.address?.neighborhood,
        signupDetails.address?.city,
        signupDetails.address?.state,
        signupDetails.address?.zipCode
      ]
    });

    // 5.2) Subscription (trial + billing_interval)
    const subscriptionId = uuidv4();
    const trialEnd = new Date(); trialEnd.setDate(trialEnd.getDate() + 30);

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    const months = billingInterval === 'yearly' ? 12 : 1;
    periodEnd.setMonth(periodEnd.getMonth() + months);

    queries.push({
      query: `INSERT INTO subscriptions (
        id, company_id, plan_id, billing_interval, status, current_period_start, 
        current_period_end, trial_end, preferred_payment_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        subscriptionId,
        companyId,
        signup.plan_id,
        billingInterval,
        'trialing',
        periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0],
        trialEnd.toISOString().split('T')[0],
        method // preferido atual (pode ser 'card', 'pix', 'boleto')
      ]
    });

    // 5.3) initial payment (trial)
    const paymentId = uuidv4();
    queries.push({
      query: `INSERT INTO payments (
        id, subscription_id, amount, status, payment_method, paid_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [paymentId, subscriptionId, 0.00, 'succeeded', 'trial', new Date()]
    });

    // 5.4) signup -> completed
    queries.push({
      query: `UPDATE public_signups SET status = 'completed', company_id = ?, subscription_id = ? WHERE id = ?`,
      params: [companyId, subscriptionId, signupId]
    });

    await executeTransaction(queries);

    // 6) Return
    const [company] = await executeQuery(
      `SELECT c.*, s.id as subscription_id, s.status as subscription_status,
              s.billing_interval, s.preferred_payment_method,
              sp.name as plan_name, sp.price as plan_price
       FROM companies c
       JOIN subscriptions s ON c.id = s.company_id
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE c.id = ?`,
      [companyId]
    );

    const monthlyPrice = Number(company.plan_price) || 0;
    const cyclePrice = company.billing_interval === 'yearly' ? monthlyPrice * 12 : monthlyPrice;

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: {
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
          companyName: company.company_name,
          tempPassword
        },
        subscription: {
          id: company.subscription_id,
          status: company.subscription_status,
          planName: company.plan_name,
          planPriceMonthly: monthlyPrice,
          billingInterval: company.billing_interval,
          cyclePrice,
          paymentMethod: company.preferred_payment_method,
          trialEnd: trialEnd.toISOString()
        }
      }
    });

  } catch (error) {
    next(error);
  }
};


const processSubscriptionLASTOLD = async (req, res, next) => {
  try {
    const { signupId, paymentData } = req.body;

    // 0) Normaliza dados do pagamento vindos do front
    const method = (paymentData?.method || 'card').toLowerCase(); // 'card' | 'pix' | 'boleto'
    // Se vier errado do front, só aceitamos 'annual' para PIX/BOLETO. Para cartão, padrão 'monthly'.
    let billingInterval = (paymentData?.billingInterval === 'annual') ? 'annual' : 'monthly';
    if (method === 'pix' || method === 'boleto') {
      if (billingInterval !== 'annual') {
        return res.status(400).json({
          success: false,
          message: 'PIX e Boleto estão disponíveis somente no plano ANUAL.'
        });
      }
      billingInterval = 'annual';
    }

    // 1) Busca o signup + plano
    const [signup] = await executeQuery(
      `SELECT ps.*, sp.*
       FROM public_signups ps
       JOIN subscription_plans sp ON ps.plan_id = sp.id
       WHERE ps.id = ? AND ps.status = 'pending'`,
      [signupId]
    );

    if (!signup) {
      return res.status(404).json({
        success: false,
        message: 'Signup not found or already processed'
      });
    }

    // 2) Parse signup_data
    let signupDetails = {};
    try {
      signupDetails = JSON.parse(signup.signup_data);
    } catch (e) {
      signupDetails = {};
    }

    // 3) Gera senha temporária
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // 4) Atribui um analista (primeiro disponível)
    const [analyst] = await executeQuery(
      'SELECT id FROM users WHERE role = ? AND is_active = TRUE ORDER BY created_at ASC LIMIT 1',
      ['analyst']
    );
    const analystId = analyst ? analyst.id : null;

    // 5) Prepara transação
    const queries = [];

    // 5.1) Cria a empresa
    const companyId = uuidv4();
    queries.push({
      query: `INSERT INTO companies (
        id, name, email, password, company_name, cnpj, sector, business_type,
        analyst_id, property, cultures, area, area_unit,
        street, number, complement, neighborhood, city, state, zip_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        companyId,
        signup.responsible_name,
        signup.email,
        hashedPassword,
        signup.company_name,
        signup.cnpj,
        signupDetails.agricultural?.cultures?.join(', ') || 'Agricultura',
        'agriculture',
        analystId,
        signupDetails.agricultural?.property || signup.company_name,
        JSON.stringify(signupDetails.agricultural?.cultures || []),
        signupDetails.agricultural?.area || 0,
        signupDetails.agricultural?.areaUnit || 'hectares',
        signupDetails.address?.street,
        signupDetails.address?.number,
        signupDetails.address?.complement,
        signupDetails.address?.neighborhood,
        signupDetails.address?.city,
        signupDetails.address?.state,
        signupDetails.address?.zipCode
      ]
    });

    // 5.2) Cria a assinatura (trial + período conforme intervalo)
    const subscriptionId = uuidv4();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30); // 30 dias de trial

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    const months = billingInterval === 'annual' ? 12 : 1; // <— ADAPTADO
    periodEnd.setMonth(periodEnd.getMonth() + months);

    queries.push({
      query: `INSERT INTO subscriptions (
        id, company_id, plan_id, status, current_period_start, 
        current_period_end, trial_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        subscriptionId,
        companyId,
        signup.plan_id,
        'trialing',
        periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0],
        trialEnd.toISOString().split('T')[0]
      ]
    });

    // 5.3) Pagamento inicial (trial, R$ 0)
    const paymentId = uuidv4();
    queries.push({
      query: `INSERT INTO payments (
        id, subscription_id, amount, status, payment_method, paid_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,

      // amount = 0 (trial), method = 'trial'
      params: [
        paymentId,
        subscriptionId,
        0.00,
        'succeeded',
        'trial',
        new Date()
      ]
    });

    // 5.4) Marca o signup como concluído
    queries.push({
      query: `UPDATE public_signups SET 
        status = 'completed', company_id = ?, subscription_id = ?
       WHERE id = ?`,
      params: [companyId, subscriptionId, signupId]
    });

    // Executa tudo
    await executeTransaction(queries);

    // 6) Retorna dados criados
    const [company] = await executeQuery(
      `SELECT c.*, s.id as subscription_id, s.status as subscription_status,
              sp.name as plan_name, sp.price as plan_price
       FROM companies c
       JOIN subscriptions s ON c.id = s.company_id
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE c.id = ?`,
      [companyId]
    );

    // Calcula preço por ciclo (sem confiar no front)
    const monthlyPrice = Number(company.plan_price) || 0;
    const cyclePrice = billingInterval === 'annual' ? monthlyPrice * 12 : monthlyPrice;

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: {
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
          companyName: company.company_name,
          tempPassword: tempPassword
        },
        subscription: {
          id: company.subscription_id,
          status: company.subscription_status,
          planName: company.plan_name,
          planPriceMonthly: monthlyPrice,
          billingInterval,               // <— ADAPTADO: devolve o intervalo escolhido
          cyclePrice,                    // <— preço do ciclo (mensal ou anual)
          paymentMethod: method,         // <— método escolhido
          trialEnd: trialEnd.toISOString()
        }
      }
    });

  } catch (error) {
    next(error);
  }
};


const processSubscriptionBKPBKPBKP = async (req, res, next) => {
  try {
    const { signupId, paymentData } = req.body;

    // Get signup data
    const [signup] = await executeQuery(
      `SELECT ps.*, sp.*
       FROM public_signups ps
       JOIN subscription_plans sp ON ps.plan_id = sp.id
       WHERE ps.id = ? AND ps.status = 'pending'`,
      [signupId]
    );

    if (!signup) {
      return res.status(404).json({
        success: false,
        message: 'Signup not found or already processed'
      });
    }

    // Parse signup data
    let signupDetails = {};
    try {
      signupDetails = JSON.parse(signup.signup_data);
    } catch (e) {
      signupDetails = {};
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Find an available analyst (for now, assign to first analyst)
    const [analyst] = await executeQuery(
      'SELECT id FROM users WHERE role = ? AND is_active = TRUE ORDER BY created_at ASC LIMIT 1',
      ['analyst']
    );

    const analystId = analyst ? analyst.id : null;

    // Prepare transaction queries
    const queries = [];

    // 1. Create company
    const companyId = uuidv4();
    queries.push({
      query: `INSERT INTO companies (
        id, name, email, password, company_name, cnpj, sector, business_type,
        analyst_id, property, cultures, area, area_unit,
        street, number, complement, neighborhood, city, state, zip_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        companyId,
        signup.responsible_name,
        signup.email,
        hashedPassword,
        signup.company_name,
        signup.cnpj,
        signupDetails.agricultural?.cultures?.join(', ') || 'Agricultura',
        'agriculture',
        analystId,
        signupDetails.agricultural?.property || signup.company_name,
        JSON.stringify(signupDetails.agricultural?.cultures || []),
        signupDetails.agricultural?.area || 0,
        signupDetails.agricultural?.areaUnit || 'hectares',
        signupDetails.address?.street,
        signupDetails.address?.number,
        signupDetails.address?.complement,
        signupDetails.address?.neighborhood,
        signupDetails.address?.city,
        signupDetails.address?.state,
        signupDetails.address?.zipCode
      ]
    });

    // 2. Create subscription
    const subscriptionId = uuidv4();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30); // 30 days trial

    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1); // 1 month period

    queries.push({
      query: `INSERT INTO subscriptions (
        id, company_id, plan_id, status, current_period_start, 
        current_period_end, trial_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        subscriptionId,
        companyId,
        signup.plan_id,
        'trialing',
        periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0],
        trialEnd.toISOString().split('T')[0]
      ]
    });

    // 3. Create initial payment record (for trial)
    const paymentId = uuidv4();
    queries.push({
      query: `INSERT INTO payments (
        id, subscription_id, amount, status, payment_method, paid_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [
        paymentId,
        subscriptionId,
        0.00, // Trial is free
        'succeeded',
        'trial',
        new Date()
      ]
    });

    // 4. Update signup status
    queries.push({
      query: `UPDATE public_signups SET 
        status = 'completed', company_id = ?, subscription_id = ?
       WHERE id = ?`,
      params: [companyId, subscriptionId, signupId]
    });

    // Execute transaction
    await executeTransaction(queries);

    // Get created company and subscription
    const [company] = await executeQuery(
      `SELECT c.*, s.id as subscription_id, s.status as subscription_status,
              sp.name as plan_name, sp.price as plan_price
       FROM companies c
       JOIN subscriptions s ON c.id = s.company_id
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE c.id = ?`,
      [companyId]
    );

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: {
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
          companyName: company.company_name,
          tempPassword: tempPassword // Send temp password for first login
        },
        subscription: {
          id: company.subscription_id,
          status: company.subscription_status,
          planName: company.plan_name,
          planPrice: company.plan_price,
          trialEnd: trialEnd.toISOString()
        }
      }
    });

  } catch (error) {
    next(error);
  }
};
// Process subscription after payment
const processSubscriptionBKP = async (req, res, next) => {
  try {
    const { signupId, paymentData } = req.body;

    console.log('Processing subscription for signup:', signupId);

    // Get signup data
    const [signup] = await executeQuery(
      `SELECT ps.*, sp.name as plan_name, sp.price, sp.features
       FROM public_signups ps
       JOIN subscription_plans sp ON ps.plan_id = sp.id
       WHERE ps.id = ? AND ps.status = 'pending'`,
      [signupId]
    );

    if (!signup) {
      return res.status(404).json({
        success: false,
        message: 'Signup not found or already processed'
      });
    }

    console.log('Signup found:', signup.email);

    // Parse signup data
    let signupDataObj = {};
    try {
      signupDataObj = JSON.parse(signup.signup_data);
    } catch (e) {
      console.error('Error parsing signup data:', e);
      return res.status(400).json({
        success: false,
        message: 'Invalid signup data'
      });
    }

    // Find an available analyst
    const [analyst] = await executeQuery(
      `SELECT id FROM users WHERE role = 'analyst' AND is_active = TRUE 
       ORDER BY (
         SELECT COUNT(*) FROM companies WHERE analyst_id = users.id
       ) ASC LIMIT 1`
    );

    if (!analyst) {
      return res.status(500).json({
        success: false,
        message: 'No analyst available. Please contact support.'
      });
    }

    console.log('Analyst assigned:', analyst.id);

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Prepare cultures JSON
    const culturesJson = signupDataObj.cultures ? JSON.stringify(signupDataObj.cultures) : null;

    // Start transaction to create company and subscription
    const queries = [
      // Create company
      {
        query: `INSERT INTO companies (
          name, email, password, company_name, cnpj, sector, business_type,
          analyst_id, property, cultures, area, area_unit,
          street, number, complement, neighborhood, city, state, zip_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          signupDataObj.responsibleName,
          signup.email,
          hashedPassword,
          signup.company_name,
          signup.cnpj,
          signupDataObj.cultures ? signupDataObj.cultures.join(', ') : 'Agricultura',
          'agriculture',
          analyst.id,
          signupDataObj.property,
          culturesJson,
          signupDataObj.area,
          signupDataObj.areaUnit,
          signupDataObj.street,
          signupDataObj.number,
          signupDataObj.complement,
          signupDataObj.neighborhood,
          signupDataObj.city,
          signupDataObj.state,
          signupDataObj.zipCode
        ]
      }
    ];

    const results = await executeTransaction(queries);
    const companyId = results[0].insertId;

    console.log('Company created with ID:', companyId);

    // Create subscription with 30-day trial
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    const subscriptionResult = await executeQuery(
      `INSERT INTO subscriptions (
        company_id, plan_id, status, current_period_start, current_period_end, trial_end
      ) VALUES (?, ?, 'trialing', CURDATE(), ?, ?)`,
      [companyId, signup.plan_id, trialEnd.toISOString().split('T')[0], trialEnd.toISOString().split('T')[0]]
    );

    console.log('Subscription created with ID:', subscriptionResult.insertId);

    // Record payment (even if simulated)
    if (paymentData && paymentData.paymentIntentId) {
      await executeQuery(
        `INSERT INTO payments (
          subscription_id, amount, currency, status, stripe_payment_intent_id, 
          payment_method, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          subscriptionResult.insertId,
          signup.price,
          'BRL',
          paymentData.status || 'succeeded',
          paymentData.paymentIntentId,
          paymentData.method || 'card',
          new Date()
        ]
      );
    }

    // Update signup status
    await executeQuery(
      'UPDATE public_signups SET status = ?, company_id = ?, subscription_id = ? WHERE id = ?',
      ['completed', companyId, subscriptionResult.insertId, signupId]
    );

    console.log('Subscription process completed successfully');

    res.status(201).json({
      success: true,
      message: 'Subscription processed successfully',
      data: {
        companyId: companyId,
        subscriptionId: subscriptionResult.insertId,
        tempPassword: tempPassword,
        trialEnd: trialEnd.toISOString(),
        planName: signup.plan_name
      }
    });

  } catch (error) {
    console.error('Error in processSubscription:', error);
    next(error);
  }
};














const createPublicSignup2 = async (req, res, next) => {
  try {
    const {
      companyName, cnpj, responsibleName, email, phone,
      zipCode, street, number, complement, neighborhood, city, state,
      property, cultures, area, areaUnit, planId
    } = req.body;

    // Check if plan exists
    const [plan] = await executeQuery(
      'SELECT * FROM subscription_plans WHERE id = ? AND is_active = TRUE',
      [planId]
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    // Check if email or CNPJ already exists
    const [existingSignup] = await executeQuery(
      'SELECT id FROM public_signups WHERE email = ? OR cnpj = ?',
      [email, cnpj]
    );

    if (existingSignup) {
      return res.status(409).json({
        success: false,
        message: 'Email or CNPJ already registered'
      });
    }

    // Check if company already exists
    const [existingCompany] = await executeQuery(
      'SELECT id FROM companies WHERE email = ? OR cnpj = ?',
      [email, cnpj]
    );

    if (existingCompany) {
      return res.status(409).json({
        success: false,
        message: 'Company already exists in the system'
      });
    }

    // Prepare signup data
    const signupData = {
      address: {
        zipCode, street, number, complement, neighborhood, city, state
      },
      agricultural: {
        property, cultures, area, areaUnit
      }
    };

    // Create public signup record
    const result = await executeQuery(
      `INSERT INTO public_signups (
        email, company_name, responsible_name, cnpj, phone, 
        plan_id, signup_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        email, companyName, responsibleName, cnpj, phone,
        planId, JSON.stringify(signupData)
      ]
    );

    // Get created signup with plan info
    // const [signup] = await executeQuery(
    //   `SELECT ps.*, sp.name as plan_name, sp.price as plan_price
    //    FROM public_signups ps
    //    JOIN subscription_plans sp ON ps.plan_id = sp.id
    //    WHERE ps.id = ?`,
    //   [result.insertId]
    // );
    // Após o INSERT, buscar pelo email (que é único)
    const [signup] = await executeQuery(
      `SELECT ps.*, sp.name as plan_name, sp.price as plan_price
   FROM public_signups ps
   JOIN subscription_plans sp ON ps.plan_id = sp.id
   WHERE ps.email = ?
   ORDER BY ps.created_at DESC
   LIMIT 1`,
      [email]
    );

    res.status(201).json({
      success: true,
      message: 'Signup created successfully',
      data: {
        signupId: signup.id,
        planName: signup.plan_name,
        planPrice: signup.plan_price,
        email: signup.email,
        companyName: signup.company_name
      }
    });

  } catch (error) {
    next(error);
  }
};

// Process subscription and create company
const processSubscription2 = async (req, res, next) => {
  try {
    const { signupId, paymentData } = req.body;

    // Get signup data
    const [signup] = await executeQuery(
      `SELECT ps.*, sp.*
       FROM public_signups ps
       JOIN subscription_plans sp ON ps.plan_id = sp.id
       WHERE ps.id = ? AND ps.status = 'pending'`,
      [signupId]
    );

    if (!signup) {
      return res.status(404).json({
        success: false,
        message: 'Signup not found or already processed'
      });
    }

    // Parse signup data
    let signupDetails = {};
    try {
      signupDetails = JSON.parse(signup.signup_data);
    } catch (e) {
      signupDetails = {};
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Find an available analyst (for now, assign to first analyst)
    const [analyst] = await executeQuery(
      'SELECT id FROM users WHERE role = ? AND is_active = TRUE ORDER BY created_at ASC LIMIT 1',
      ['analyst']
    );

    const analystId = analyst ? analyst.id : null;

    // Prepare transaction queries
    const queries = [];

    // 1. Create company
    const companyId = uuidv4();
    queries.push({
      query: `INSERT INTO companies (
        id, name, email, password, company_name, cnpj, sector, business_type,
        analyst_id, property, cultures, area, area_unit,
        street, number, complement, neighborhood, city, state, zip_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        companyId,
        signup.responsible_name,
        signup.email,
        hashedPassword,
        signup.company_name,
        signup.cnpj,
        signupDetails.agricultural?.cultures?.join(', ') || 'Agricultura',
        'agriculture',
        analystId,
        signupDetails.agricultural?.property || signup.company_name,
        JSON.stringify(signupDetails.agricultural?.cultures || []),
        signupDetails.agricultural?.area || 0,
        signupDetails.agricultural?.areaUnit || 'hectares',
        signupDetails.address?.street,
        signupDetails.address?.number,
        signupDetails.address?.complement,
        signupDetails.address?.neighborhood,
        signupDetails.address?.city,
        signupDetails.address?.state,
        signupDetails.address?.zipCode
      ]
    });

    // 2. Create subscription
    const subscriptionId = uuidv4();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30); // 30 days trial

    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1); // 1 month period

    queries.push({
      query: `INSERT INTO subscriptions (
        id, company_id, plan_id, status, current_period_start, 
        current_period_end, trial_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        subscriptionId,
        companyId,
        signup.plan_id,
        'trialing',
        periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0],
        trialEnd.toISOString().split('T')[0]
      ]
    });

    // 3. Create initial payment record (for trial)
    const paymentId = uuidv4();
    queries.push({
      query: `INSERT INTO payments (
        id, subscription_id, amount, status, payment_method, paid_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [
        paymentId,
        subscriptionId,
        0.00, // Trial is free
        'succeeded',
        'trial',
        new Date()
      ]
    });

    // 4. Update signup status
    queries.push({
      query: `UPDATE public_signups SET 
        status = 'completed', company_id = ?, subscription_id = ?
       WHERE id = ?`,
      params: [companyId, subscriptionId, signupId]
    });

    // Execute transaction
    await executeTransaction(queries);

    // Get created company and subscription
    const [company] = await executeQuery(
      `SELECT c.*, s.id as subscription_id, s.status as subscription_status,
              sp.name as plan_name, sp.price as plan_price
       FROM companies c
       JOIN subscriptions s ON c.id = s.company_id
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE c.id = ?`,
      [companyId]
    );

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: {
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
          companyName: company.company_name,
          tempPassword: tempPassword // Send temp password for first login
        },
        subscription: {
          id: company.subscription_id,
          status: company.subscription_status,
          planName: company.plan_name,
          planPrice: company.plan_price,
          trialEnd: trialEnd.toISOString()
        }
      }
    });

  } catch (error) {
    next(error);
  }
};















// Create payment record
const createPayment = async (req, res, next) => {
  try {
    const { paymentIntentId, subscriptionId, amount, currency = 'BRL', method = 'card' } = req.body;

    const result = await executeQuery(
      `INSERT INTO payments (
        subscription_id, amount, currency, status, stripe_payment_intent_id, 
        payment_method, paid_at
      ) VALUES (?, ?, ?, 'succeeded', ?, ?, NOW())`,
      [subscriptionId, amount, currency, paymentIntentId, method]
    );

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        paymentId: result.insertId
      }
    });

  } catch (error) {
    next(error);
  }
};

const getSubscriptionStatus = async (req, res, next) => {
  try {
    const { role, id: userId, companyId } = req.user;

    // Only for companies
    if (role !== 'client' && role !== 'company_user') {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          message: 'Subscription not applicable for this user type'
        }
      });
    }

    const targetCompanyId = role === 'company_user' ? companyId : userId;

    // Get subscription with usage stats
    const [subscription] = await executeQuery(
      `SELECT 
        s.*,
        sp.name as plan_name,
        sp.max_users,
        sp.max_charts,
        sp.max_companies,
        sp.features,
        sp.price
       FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.company_id = ?
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [targetCompanyId]
    );

    if (!subscription) {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          message: 'No subscription found'
        }
      });
    }

    // Get current usage
    const [usersCount] = await executeQuery(
      'SELECT COUNT(*) as count FROM company_users WHERE company_id = ? AND is_active = TRUE',
      [targetCompanyId]
    );

    const [chartsCount] = await executeQuery(
      'SELECT COUNT(*) as count FROM custom_charts WHERE company_id = ? AND is_active = TRUE',
      [targetCompanyId]
    );

    // Parse features
    let features = [];
    let permissions = {};
    try {
      features = typeof subscription.features === 'string'
        ? JSON.parse(subscription.features)
        : subscription.features || [];
    } catch (e) {
      features = [];
    }

    try {
      permissions = typeof subscription.permissions === 'string'
        ? JSON.parse(subscription.permissions)
        : subscription.permissions || {};
    } catch (e) {
      permissions = {
        canViewGoals: true,
        canViewAlerts: true,
        canViewInsights: false,
        canViewReports: true,
        canViewInventory: false,
        canViewArticles: true,
        canViewSubscription: true
      };
    }

    // Calculate days remaining
    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);
    const daysRemaining = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      data: {
        hasSubscription: true,
        subscription: {
          id: subscription.id,
          planName: subscription.plan_name,
          status: subscription.status,
          price: subscription.price,
          currentPeriodEnd: subscription.current_period_end,
          trialEnd: subscription.trial_end,
          daysRemaining: Math.max(0, daysRemaining),
          isTrialing: subscription.status === 'trialing',
          features: features,
          permissions: permissions,
          limits: {
            maxUsers: subscription.max_users,
            maxCharts: subscription.max_charts,
            maxCompanies: subscription.max_companies
          },
          usage: {
            users: usersCount.count,
            charts: chartsCount.count,
            companies: 1
          }
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

// Get subscription status for current user
const getSubscriptionStatusBKPP = async (req, res, next) => {
  try {
    const { role, id: userId, companyId } = req.user;

    // Only for companies
    if (role !== 'client' && role !== 'company_user') {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          message: 'Subscription not applicable for this user type'
        }
      });
    }

    const targetCompanyId = role === 'company_user' ? companyId : userId;

    // Get subscription with usage stats
    const [subscription] = await executeQuery(
      `SELECT 
        s.*,
        sp.name as plan_name,
        sp.max_users,
        sp.max_charts,
        sp.max_companies,
        sp.features,
        sp.price
       FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.company_id = ?
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [targetCompanyId]
    );

    if (!subscription) {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          message: 'No subscription foundf'
        }
      });
    }

    // Get current usage
    const [usersCount] = await executeQuery(
      'SELECT COUNT(*) as count FROM company_users WHERE company_id = ? AND is_active = TRUE',
      [targetCompanyId]
    );

    const [chartsCount] = await executeQuery(
      'SELECT COUNT(*) as count FROM custom_charts WHERE company_id = ? AND is_active = TRUE',
      [targetCompanyId]
    );

    // Parse features
    let features = [];
    try {
      features = typeof subscription.features === 'string'
        ? JSON.parse(subscription.features)
        : subscription.features || [];
    } catch (e) {
      features = [];
    }

    // Calculate days remaining
    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);
    const daysRemaining = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      data: {
        hasSubscription: true,
        subscription: {
          id: subscription.id,
          planName: subscription.plan_name,
          status: subscription.status,
          price: subscription.price,
          currentPeriodEnd: subscription.current_period_end,
          trialEnd: subscription.trial_end,
          daysRemaining: Math.max(0, daysRemaining),
          isTrialing: subscription.status === 'trialing',
          features: features,
          limits: {
            maxUsers: subscription.max_users,
            maxCharts: subscription.max_charts,
            maxCompanies: subscription.max_companies
          },
          usage: {
            users: usersCount.count,
            charts: chartsCount.count,
            companies: 1
          }
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

// Get all subscriptions (admin only)
const getSubscriptions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, plan_id } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];

    if (status) {
      whereClause += ' AND s.status = ?';
      params.push(status);
    }

    if (plan_id) {
      whereClause += ' AND s.plan_id = ?';
      params.push(plan_id);
    }

    const subscriptions = await executeQuery(
      `SELECT 
        s.*,
        c.company_name,
        c.email as company_email,
        sp.name as plan_name,
        sp.price as plan_price
       FROM subscriptions s
       JOIN companies c ON s.company_id = c.id
       JOIN subscription_plans sp ON s.plan_id = sp.id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [{ total }] = await executeQuery(
      `SELECT COUNT(*) as total 
       FROM subscriptions s
       JOIN companies c ON s.company_id = c.id
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total),
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

// Get subscription by ID
const getSubscriptionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId, companyId } = req.user;
    if (!id) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum parâmetro ' + id
      });
    }
    let whereClause = 'WHERE s.id = ?';
    let params = [id];

    // Non-admin users can only see their own subscription
    if (role !== 'admin') {
      const targetCompanyId = role === 'company_user' ? companyId : userId;
      whereClause += ' AND s.company_id = ?';
      params.push(targetCompanyId);
    }

    const [subscription] = await executeQuery(
      `SELECT 
        s.*,
        c.company_name,
        c.email as company_email,
        sp.name as plan_name,
        sp.price as plan_price,
        sp.features
       FROM subscriptions s
       JOIN companies c ON s.company_id = c.id
       JOIN subscription_plans sp ON s.plan_id = sp.id
       ${whereClause}`,
      params
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not foundfafafa ' + id
      });
    }

    // Parse features
    if (subscription.features) {
      try {
        subscription.features = JSON.parse(subscription.features);
      } catch (e) {
        subscription.features = [];
      }
    }

    // Get payment history
    const payments = await executeQuery(
      'SELECT * FROM payments WHERE subscription_id = ? ORDER BY created_at DESC',
      [id]
    );

    subscription.payments = payments;

    res.json({
      success: true,
      data: subscription
    });

  } catch (error) {
    next(error);
  }
};

// Update subscription - admin only
const updateSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { plan_id, status } = req.body;
    const { role, id: userId, companyId } = req.user;

    // Check if subscription exists
    let whereClause = 'WHERE id = ?';
    let params = [id];

    // Non-admin users can only update their own subscription
    if (role !== 'admin') {
      const targetCompanyId = role === 'company_user' ? companyId : userId;
      whereClause += ' AND company_id = ?';
      params.push(targetCompanyId);
    }

    const [existingSubscription] = await executeQuery(
      `SELECT * FROM subscriptions ${whereClause}`,
      params
    );

    if (!existingSubscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Update subscription
    const updateFields = [];
    const updateParams = [];

    if (plan_id) {
      updateFields.push('plan_id = ?');
      updateParams.push(plan_id);
    }

    if (status) {
      updateFields.push('status = ?');
      updateParams.push(status);

      if (status === 'canceled') {
        updateFields.push('canceled_at = NOW()');
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateParams.push(id);

    await executeQuery(
      `UPDATE subscriptions SET ${updateFields.join(', ')} WHERE id = ?`,
      updateParams
    );

    // Get updated subscription
    const [updatedSubscription] = await executeQuery(
      `SELECT 
        s.*,
        c.company_name,
        sp.name as plan_name,
        sp.price as plan_price
       FROM subscriptions s
       JOIN companies c ON s.company_id = c.id
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      data: updatedSubscription
    });

  } catch (error) {
    next(error);
  }
};

// Cancel subscription
const cancelSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId, companyId } = req.user;

    // Check if subscription exists
    let whereClause = 'WHERE id = ?';
    let params = [id];

    // Non-admin users can only cancel their own subscription
    if (role !== 'admin') {
      const targetCompanyId = role === 'company_user' ? companyId : userId;
      whereClause += ' AND company_id = ?';
      params.push(targetCompanyId);
    }

    const [subscription] = await executeQuery(
      `SELECT * FROM subscriptions ${whereClause}`,
      params
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    if (subscription.status === 'canceled') {
      return res.status(400).json({
        success: false,
        message: 'Subscription is already canceled'
      });
    }

    // Cancel subscription
    await executeQuery(
      'UPDATE subscriptions SET status = ?, canceled_at = NOW() WHERE id = ?',
      ['canceled', id]
    );

    res.json({
      success: true,
      message: 'Subscription canceled successfully'
    });

  } catch (error) {
    next(error);
  }
};



// ===== ADMIN ONLY ROUTES =====

// Get all plans (admin only)
const getAllPlans = async (req, res, next) => {
  try {
    const plans = await executeQuery(
      'SELECT * FROM subscription_plans ORDER BY price ASC'
    );

    // Parse features JSON and get usage stats
    for (let plan of plans) {
      if (plan.features) {
        try {
          plan.features = JSON.parse(plan.features);
        } catch (e) {
          plan.features = [];
        }
      }

      // Get subscription count for this plan
      const [{ count }] = await executeQuery(
        'SELECT COUNT(*) as count FROM subscriptions WHERE plan_id = ?',
        [plan.id]
      );
      plan.subscriptions_count = count;
    }

    res.json({
      success: true,
      data: plans
    });

  } catch (error) {
    next(error);
  }
};

// Create new plan (admin only)
const createPlan = async (req, res, next) => {
  try {
    const {
      name, description, price, interval_type = 'month', features,
      max_users = 1, max_charts = 3, max_companies = 1, stripe_price_id
    } = req.body;

    // Prepare features JSON
    const featuresJson = Array.isArray(features) ? JSON.stringify(features) : features;

    const result = await executeQuery(
      `INSERT INTO subscription_plans (
        name, description, price, interval_type, features,
        max_users, max_charts, max_companies, stripe_price_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, description, price, interval_type, featuresJson,
        max_users, max_charts, max_companies, safeValue(stripe_price_id)
      ]
    );

    // Get created plan
    const [plan] = await executeQuery(
      'SELECT * FROM subscription_plans WHERE id = ?',
      [result.insertId]
    );

    // Parse features
    if (plan.features) {
      try {
        plan.features = JSON.parse(plan.features);
      } catch (e) {
        plan.features = [];
      }
    }

    res.status(201).json({
      success: true,
      message: 'Plan created successfully',
      data: plan
    });

  } catch (error) {
    next(error);
  }
};

// Update plan (admin only)
const updatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name, description, price, interval_type, features,
      max_users, max_charts, max_companies, stripe_price_id, is_active
    } = req.body;

    // Check if plan exists
    const [existingPlan] = await executeQuery(
      'SELECT id FROM subscription_plans WHERE id = ?',
      [id]
    );

    if (!existingPlan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Prepare features JSON
    const featuresJson = Array.isArray(features) ? JSON.stringify(features) : features;

    // Update plan
    await executeQuery(
      `UPDATE subscription_plans SET 
        name = ?, description = ?, price = ?, interval_type = ?, features = ?,
        max_users = ?, max_charts = ?, max_companies = ?, stripe_price_id = ?, is_active = ?
       WHERE id = ?`,
      [
        safeValue(name), safeValue(description), safeValue(price),
        safeValue(interval_type), featuresJson, safeValue(max_users),
        safeValue(max_charts), safeValue(max_companies),
        safeValue(stripe_price_id), safeValue(is_active), id
      ]
    );

    // Get updated plan
    const [plan] = await executeQuery(
      'SELECT * FROM subscription_plans WHERE id = ?',
      [id]
    );

    // Parse features
    if (plan.features) {
      try {
        plan.features = JSON.parse(plan.features);
      } catch (e) {
        plan.features = [];
      }
    }

    res.json({
      success: true,
      message: 'Plan updated successfully',
      data: plan
    });

  } catch (error) {
    next(error);
  }
};

// Delete plan (admin only)
const deletePlan = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if plan exists
    const [plan] = await executeQuery(
      'SELECT id FROM subscription_plans WHERE id = ?',
      [id]
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Check if plan has active subscriptions
    const [{ count }] = await executeQuery(
      'SELECT COUNT(*) as count FROM subscriptions WHERE plan_id = ? AND status IN ("active", "trialing")',
      [id]
    );

    if (count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan with ${count} active subscriptions`
      });
    }

    // Soft delete - set is_active to false
    await executeQuery(
      'UPDATE subscription_plans SET is_active = FALSE WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Plan deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

const deactivePlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active
    } = req.body;

    // Check if plan exists
    const [plan] = await executeQuery(
      'SELECT id FROM subscription_plans WHERE id = ?',
      [id]
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }


    // Soft delete - set is_active to false
    await executeQuery(
      'UPDATE subscription_plans SET is_active = ? WHERE id = ?',
      [is_active, id]
    );

    res.json({
      success: true,
      message: 'Plano atualizado com sucesso'
    });

  } catch (error) {
    next(error);
  }
};


// Create subscription for existing company (admin only)
const createSubscriptionForCompany = async (req, res, next) => {
  try {
    const {
      company_id, plan_id, status = 'active', trial_days = 0
    } = req.body;

    // Check if company exists
    const [company] = await executeQuery(
      'SELECT id, company_name FROM companies WHERE id = ?',
      [company_id]
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Check if plan exists
    const [plan] = await executeQuery(
      'SELECT * FROM subscription_plans WHERE id = ? AND is_active = TRUE',
      [plan_id]
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Check if company already has an active subscription
    const [existingSubscription] = await executeQuery(
      'SELECT id FROM subscriptions WHERE company_id = ? AND status IN ("active", "trialing")',
      [company_id]
    );

    if (existingSubscription) {
      return res.status(409).json({
        success: false,
        message: 'Company already has an active subscription'
      });
    }

    // Calculate dates
    const now = new Date();
    const periodStart = now.toISOString().split('T')[0];
    const trialEnd = trial_days > 0 ?
      new Date(Date.now() + trial_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null;
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const subscriptionId = uuidv4();

    // Create subscription
    await executeQuery(
      `INSERT INTO subscriptions (
        id, company_id, plan_id, status, current_period_start, current_period_end, trial_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [subscriptionId, company_id, plan_id, status, periodStart, periodEnd, trialEnd]
    );

    // Get created subscription with details
    const [subscription] = await executeQuery(
      `SELECT 
        s.*,
        c.company_name,
        c.email as company_email,
        sp.name as plan_name,
        sp.price as plan_price
       FROM subscriptions s
       JOIN companies c ON s.company_id = c.id
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.id = ?`,
      [subscriptionId]
    );

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: subscription
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  confirmPayment,
  getSubscriptionPlans,
  getPaymentHistory,
  getPlans,
  createPublicSignup,
  createPublicSignup2,
  processSubscription,
  createPayment,
  getSubscriptionStatus,
  getSubscriptions,
  getSubscriptionById,
  updateSubscription,
  cancelSubscription,
  getAllPlans,
  createPlan,
  updatePlan,
  deletePlan,
  deactivePlan,
  createSubscriptionForCompany
};