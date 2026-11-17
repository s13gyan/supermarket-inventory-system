
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const pool = require('./database');

const migrationsDirectory = path.join(
  __dirname,
  '../database/migrations'
);

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting database migrations...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const files = fs.readdirSync(migrationsDirectory)
      .filter(file => /^\d+_.+\.sql$/.test(file))
      .sort();

    const result = await client.query(
      'SELECT migration FROM schema_migrations'
    );

    const appliedMigrations = new Set(
      result.rows.map(row => row.migration)
    );

    for (const file of files) {
      if (appliedMigrations.has(file)) {
        console.log(`Skipping ${file}: already applied`);
        continue;
      }

      console.log(`Applying ${file}...`);

      const sql = fs.readFileSync(
        path.join(migrationsDirectory, file),
        'utf8'
      );

      await client.query('BEGIN');

      try {
        await client.query(sql);

        await client.query(
          'INSERT INTO schema_migrations (migration) VALUES ($1)',
          [file]
        );

        await client.query('COMMIT');

        console.log(`Successfully applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('Database migrations completed.');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;

  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
