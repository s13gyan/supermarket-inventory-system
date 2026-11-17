require('dotenv').config();

const readline = require('node:readline/promises');
const bcrypt = require('bcryptjs');
const pool = require('./database');

async function promptRequired(terminal, label, maxLength) {
  const answer = (await terminal.question(`${label}: `)).trim();
  if (!answer || answer.length > maxLength) {
    throw new Error(`${label} is required and must be at most ${maxLength} characters`);
  }

  return answer;
}

async function createFirstAdministrator() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Run this command in an interactive terminal so the password can be entered securely');
  }

  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [73421891]);

    const existingAdmin = await client.query(
      "SELECT 1 FROM users WHERE role = 'administrator' LIMIT 1"
    );

    if (existingAdmin.rowCount) {
      throw new Error('An administrator already exists. This command only creates the first administrator.');
    }

    const fullName = await promptRequired(terminal, 'Administrator full name', 150);
    const username = (await promptRequired(terminal, 'Username', 50)).toLowerCase();
    const email = (await promptRequired(terminal, 'Email', 150)).toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Enter a valid email address');
    }

    const password = await terminal.question('Password (minimum 12 characters): ', {
      hideEchoBack: true
    });
    const confirmation = await terminal.question('Confirm password: ', {
      hideEchoBack: true
    });

    const passwordBytes = Buffer.byteLength(password, 'utf8');
    if (passwordBytes < 12 || passwordBytes > 72) {
      throw new Error('Password must be between 12 and 72 characters');
    }

    if (password !== confirmation) {
      throw new Error('Passwords do not match');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO users (full_name, username, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'administrator')`,
      [fullName, username, email, passwordHash]
    );

    await client.query('COMMIT');
    console.log(`Created the first SuperMart administrator: ${username}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    terminal.close();
    client.release();
    await pool.end();
  }
}

createFirstAdministrator().catch((error) => {
  console.error(`Administrator creation failed: ${error.message}`);
  process.exitCode = 1;
});
