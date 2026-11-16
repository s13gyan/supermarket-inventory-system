CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    sku VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(100),
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL,
    total NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products (name, sku, category, price, quantity)
VALUES
('Premium Rice 5kg', 'RICE001', 'Groceries', 650.00, 30),
('Cooking Oil 1L', 'OIL001', 'Groceries', 180.00, 50),
('White Sugar 1kg', 'SUGAR001', 'Groceries', 120.00, 40),
('Milo 400g', 'MILO001', 'Beverages', 95.00, 25),
('Tomato Paste', 'TOM001', 'Groceries', 45.00, 60)
ON CONFLICT (sku) DO NOTHING;
