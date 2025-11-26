// Initialize SQLite database and create tables (users, ems_accounts, profiles, audits)
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const db = new Database(path.join(__dirname, 'pillbox.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ems_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id TEXT UNIQUE,
    unit_code_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT,
    profile_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create a default admin user if none exists
const row = db.prepare('SELECT COUNT(*) as c FROM users').get();
(async ()=>{
  if(row.c === 0){
    const hash = await bcrypt.hash('adminpass', 10);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
    console.log('Created default admin user: username=admin password=adminpass');
  }
  // create a demo ems account
  const emsRow = db.prepare('SELECT COUNT(*) as c FROM ems_accounts').get();
  if(emsRow.c === 0){
    const codeHash = await bcrypt.hash('ems123', 10);
    db.prepare('INSERT INTO ems_accounts (unit_id, unit_code_hash) VALUES (?, ?)').run('EMS-1', codeHash);
    console.log('Created demo EMS account: unit_id=EMS-1 unit_code=ems123');
  }
  console.log('Database initialized.');
})();
