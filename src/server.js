require('dotenv').config();

const express = require('express');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { rateLimit } = require('express-rate-limit');
const pool = require('./database');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDirectory = path.join(__dirname, '../public');
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters');
}

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

const PostgreSqlStore = connectPgSimple(session);

app.use(express.json({ limit: '20kb' }));
app.use(session({
  store: new PostgreSqlStore({
    pool,
    createTableIfMissing: true
  }),
  name: 'supermart.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

function requireAuthentication(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  next();
}

function sendLoginPage(req, res) {
  if (req.session.user) {
    return res.redirect('/');
  }

  res.sendFile(path.join(publicDirectory, 'login.html'));
}

// The dashboard file is served only after the session check. Static assets
// remain public so the login page can load its stylesheet and script.
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  res.sendFile(path.join(publicDirectory, 'index.html'));
});

app.get('/index.html', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  res.sendFile(path.join(publicDirectory, 'index.html'));
});

app.get(['/login', '/login.html'], sendLoginPage);

// Health check stays public so container and load-balancer probes can run.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const identifier = typeof req.body.identifier === 'string'
    ? req.body.identifier.trim().toLowerCase()
    : '';
  const password = typeof req.body.password === 'string'
    ? req.body.password
    : '';

  if (
    !identifier || !password || identifier.length > 150 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    return res.status(400).json({ error: 'Enter a valid username or email and password' });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, username, email, password_hash, role
       FROM users
       WHERE is_active = TRUE
         AND (LOWER(username) = $1 OR LOWER(email) = $1)
       LIMIT 1`,
      [identifier]
    );
    const user = result.rows[0];
    const validPassword = user && await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    req.session.regenerate((error) => {
      if (error) {
        console.error('Session regeneration error:', error.message);
        return res.status(500).json({ error: 'Could not start a session' });
      }

      req.session.user = {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        role: user.role
      };

      req.session.save((saveError) => {
        if (saveError) {
          console.error('Session save error:', saveError.message);
          return res.status(500).json({ error: 'Could not start a session' });
        }

        res.json({ user: req.session.user });
      });
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Could not log in' });
  }
});

app.get('/api/auth/session', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  res.json({ user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('Logout error:', error.message);
      return res.status(500).json({ error: 'Could not log out' });
    }

    res.clearCookie('supermart.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    res.status(204).end();
  });
});

// Dashboard and inventory APIs require a logged-in user.
app.use('/api/dashboard', requireAuthentication);
app.use('/api/products', requireAuthentication);
app.use('/api/sales', requireAuthentication);

app.get('/api/dashboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_products,
        COALESCE(SUM(quantity), 0)::int AS total_stock,
        COALESCE(SUM(price * quantity), 0)::numeric(14,2) AS stock_value
      FROM products
    `);

    const sales = await pool.query(`
      SELECT COALESCE(SUM(total), 0)::numeric(14,2) AS total_sales
      FROM sales
    `);

    res.json({
      ...result.rows[0],
      total_sales: sales.rows[0].total_sales
    });
  } catch (error) {
    console.error('Dashboard error:', error.message);
    res.status(500).json({ error: 'Could not load dashboard' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Products error:', error.message);
    res.status(500).json({ error: 'Could not retrieve products' });
  }
});

app.post('/api/products', async (req, res) => {
  const { name, sku, category, price, quantity } = req.body;

  if (
    typeof name !== 'string' || !name.trim() ||
    typeof sku !== 'string' || !sku.trim() ||
    !Number.isFinite(Number(price)) || Number(price) < 0 ||
    !Number.isInteger(Number(quantity)) || Number(quantity) < 0
  ) {
    return res.status(400).json({ error: 'Invalid product information' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (name, sku, category, price, quantity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), sku.trim(), category || null, price, quantity]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'SKU already exists' });
    }

    console.error('Add product error:', error.message);
    res.status(500).json({ error: 'Could not add product' });
  }
});

app.patch('/api/products/:id/stock', async (req, res) => {
  const id = Number(req.params.id);
  const quantity = Number(req.body.quantity);

  if (
    !Number.isInteger(id) || id <= 0 ||
    !Number.isInteger(quantity) || quantity < 0
  ) {
    return res.status(400).json({ error: 'Invalid stock information' });
  }

  try {
    const result = await pool.query(
      'UPDATE products SET quantity = $1 WHERE id = $2 RETURNING *',
      [quantity, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Stock update error:', error.message);
    res.status(500).json({ error: 'Could not update stock' });
  }
});

app.post('/api/sales', async (req, res) => {
  const productId = Number(req.body.product_id);
  const quantity = Number(req.body.quantity);

  if (
    !Number.isInteger(productId) || productId <= 0 ||
    !Number.isInteger(quantity) || quantity <= 0
  ) {
    return res.status(400).json({ error: 'Invalid sale information' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const product = await client.query(
      'SELECT * FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );

    if (!product.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const item = product.rows[0];

    if (item.quantity < quantity) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Insufficient stock' });
    }

    const total = Number(item.price) * quantity;
    const sale = await client.query(
      `INSERT INTO sales (product_id, quantity, unit_price, total)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [productId, quantity, item.price, total]
    );

    await client.query(
      'UPDATE products SET quantity = quantity - $1 WHERE id = $2',
      [quantity, productId]
    );

    await client.query('COMMIT');
    res.status(201).json(sale.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sale error:', error.message);
    res.status(500).json({ error: 'Could not record sale' });
  } finally {
    client.release();
  }
});

app.use(express.static(publicDirectory, { index: false }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Supermarket application listening on port ${PORT}`);
});
