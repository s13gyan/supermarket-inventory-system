require('dotenv').config();

const express = require('express');
const path = require('node:path');
const pool = require('./database');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

// Dashboard
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

// List products
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products ORDER BY id DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Products error:', error.message);
    res.status(500).json({ error: 'Could not retrieve products' });
  }
});

// Add product
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

// Update product stock
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

// Record a sale and reduce stock atomically
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Supermarket application listening on port ${PORT}`);
});
