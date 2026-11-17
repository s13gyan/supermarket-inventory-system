CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,

    full_name VARCHAR(150) NOT NULL,

    username VARCHAR(50) NOT NULL UNIQUE,

    email VARCHAR(150) NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    role VARCHAR(30) NOT NULL DEFAULT 'cashier',

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_user_role
        CHECK (
            role IN (
                'administrator',
                'manager',
                'cashier',
                'inventory_officer'
            )
        )
);


