// Pillbox EHR v2 - Express server with hybrid EMS/Hospital auth + roles + audit logs
// Run: npm install
// Initialize DB: npm run init-db
// Start: npm start

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const upload = multer();

const SECRET = process.env.PILLBOX_JWT_SECRET || 'pillbox_dev_secret_change_me';
const DB_PATH = path.join(__dirname, 'pillbox.db');
const db = new Database(DB_PATH);

const app = express();
app.use(bodyParser.json({limit:'2mb'}));
app.use(bodyParser.urlencoded({ extended:true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---
function audit(user_id, action, profile_id, details){
  try{
    const stmt = db.prepare('INSERT INTO audits (user_id, action, profile_id, details) VALUES (?, ?, ?, ?)');
    stmt.run(user_id || null, action, profile_id || null, details || null);
  }catch(e){
    console.error('Audit failed', e);
  }
}

function generateToken(user){
  const payload = { id: user.id, username: user.username, role: user.role, ems_unit: user.ems_unit || null };
  return jwt.sign(payload, SECRET, { expiresIn: '12h' });
}

function authMiddleware(req, res, next){
  const header = req.headers.authorization || req.cookies && req.cookies.pillbox_token;
  let token = null;
  if(header && header.startsWith('Bearer ')) token = header.slice(7);
  else if(req.cookies && req.cookies.pillbox_token) token = req.cookies.pillbox_token;
  if(!token) return res.status(401).json({ error: 'Unauthorized' });
  try{
    const data = jwt.verify(token, SECRET);
    req.user = data;
    next();
  }catch(e){
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(roles){
  return (req, res, next) => {
    if(!req.user) return res.status(401).json({ error:'Unauthorized' });
    if(roles.includes(req.user.role)) return next();
    return res.status(403).json({ error:'Forbidden' });
  };
}

// --- Auth endpoints ---
// Login: supports 'hospital' users (username/password) and 'ems' users (unitId + unitCode)
app.post('/api/auth/login', async (req, res) => {
  const { mode, username, password, unitId, unitCode } = req.body;
  try{
    if(mode === 'hospital'){
      const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if(!row) return res.status(401).json({ error:'Invalid credentials' });
      const ok = await bcrypt.compare(password, row.password_hash);
      if(!ok) return res.status(401).json({ error:'Invalid credentials' });
      const token = generateToken(row);
      audit(row.id, 'login', null, 'hospital login');
      return res.json({ token, user: { id: row.id, username: row.username, role: row.role } });
    } else if(mode === 'ems'){
      // EMS simplified: login via unitId and unitCode (stored hashed in ems_accounts)
      const row = db.prepare('SELECT * FROM ems_accounts WHERE unit_id = ?').get(unitId);
      if(!row) return res.status(401).json({ error:'Invalid EMS credentials' });
      const ok = await bcrypt.compare(unitCode, row.unit_code_hash);
      if(!ok) return res.status(401).json({ error:'Invalid EMS credentials' });
      // create a temporary user payload for EMS unit
      const user = { id: 'ems-'+row.id, username: 'EMS-'+row.unit_id, role: 'ems', ems_unit: row.unit_id };
      const token = jwt.sign(user, SECRET, { expiresIn: '8h' });
      audit(null, 'login', null, 'ems login unit:' + row.unit_id);
      return res.json({ token, user });
    } else {
      return res.status(400).json({ error:'Invalid login mode' });
    }
  }catch(e){
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin endpoint to create hospital users (only admin)
app.post('/api/users', authMiddleware, requireRole(['admin']), async (req, res) => {
  const { username, password, role } = req.body;
  if(!username || !password) return res.status(400).json({ error:'username+password required' });
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role || 'viewer');
  const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  audit(req.user.id, 'create_user', null, 'created user ' + username);
  res.json(user);
});

// Admin can create EMS accounts (store unit code hashed)
app.post('/api/ems_accounts', authMiddleware, requireRole(['admin']), async (req, res) => {
  const { unit_id, unit_code } = req.body;
  if(!unit_id || !unit_code) return res.status(400).json({ error:'unit_id & unit_code required' });
  const hash = await bcrypt.hash(unit_code, 10);
  const info = db.prepare('INSERT INTO ems_accounts (unit_id, unit_code_hash) VALUES (?, ?)').run(unit_id, hash);
  audit(req.user.id, 'create_ems_account', null, 'unit:' + unit_id);
  res.json({ ok:true, id: info.lastInsertRowid });
});

// --- Profiles endpoints (most unchanged) ---
function getProfile(id){
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  if(!row) return null;
  const profile = JSON.parse(row.data);
  profile.id = row.id;
  return profile;
}

app.get('/api/profiles', authMiddleware, (req, res) => {
  // EMS role sees same list, but we log that they viewed list
  const rows = db.prepare('SELECT id, name FROM profiles').all();
  audit(req.user.id || null, 'list_profiles', null, 'list viewed by ' + (req.user && req.user.username));
  res.json(rows);
});

app.post('/api/profiles', authMiddleware, requireRole(['admin','doctor','nurse','ems']), (req, res) => {
  const data = req.body;
  const name = data.name || 'New Patient';
  const initial = Object.assign({
    name: name,
    mrn: data.mrn || '',
    dob: data.dob || '',
    status: data.status || 'Admitted',
    vitals: data.vitals || { hr:'', bp:'', rr:'', temp:'', spo2:'' },
    meds: data.meds || [],
    orders: data.orders || [],
    labs: data.labs || [],
    imaging: data.imaging || [],
    mar: data.mar || [],
    notes: data.notes || []
  }, {});
  const info = db.prepare('INSERT INTO profiles (name, data) VALUES (?, ?)').run(name, JSON.stringify(initial));
  audit(req.user.id || null, 'create_profile', info.lastInsertRowid, 'created profile');
  res.json({ id: info.lastInsertRowid, ...initial });
});

app.get('/api/profiles/:id', authMiddleware, (req, res) => {
  const p = getProfile(req.params.id);
  if(!p) return res.status(404).json({error:'Not found'});
  audit(req.user.id || null, 'view_profile', req.params.id, 'viewed profile');
  res.json(p);
});

app.put('/api/profiles/:id', authMiddleware, requireRole(['admin','doctor','nurse','ems']), (req, res) => {
  const id = req.params.id;
  const p = getProfile(id);
  if(!p) return res.status(404).json({error:'Not found'});
  const updated = Object.assign({}, p, req.body);
  delete updated.id;
  db.prepare('UPDATE profiles SET name = ?, data = ? WHERE id = ?').run(updated.name || p.name, JSON.stringify(updated), id);
  audit(req.user.id || null, 'update_profile', id, JSON.stringify(req.body).slice(0,500));
  res.json({ ok: true, profile: updated });
});

app.delete('/api/profiles/:id', authMiddleware, requireRole(['admin']), (req, res) => {
  const id = req.params.id;
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  audit(req.user.id || null, 'delete_profile', id, 'deleted');
  res.json({ ok: true });
});

// audits viewer (admin)
app.get('/api/audits', authMiddleware, requireRole(['admin']), (req, res) => {
  const rows = db.prepare('SELECT * FROM audits ORDER BY created_at DESC LIMIT 1000').all();
  res.json(rows);
});

// export/import
app.get('/api/export', authMiddleware, requireRole(['admin']), (req, res) => {
  const rows = db.prepare('SELECT id, name, data FROM profiles').all();
  const out = rows.map(r => ({ id: r.id, name: r.name, profile: JSON.parse(r.data)}));
  res.setHeader('Content-Disposition', 'attachment; filename="pillbox_profiles.json"');
  res.json(out);
});

const uploadSingle = upload.single('file');
app.post('/api/import', authMiddleware, requireRole(['admin']), uploadSingle, (req, res) => {
  try{
    const content = req.file.buffer.toString('utf8');
    const arr = JSON.parse(content);
    let inserted = 0;
    const insert = db.prepare('INSERT INTO profiles (name, data) VALUES (?, ?)');
    const txn = db.transaction((items)=>{ items.forEach(it=>{ insert.run(it.name || (it.profile && it.profile.name) || 'Imported', JSON.stringify(it.profile || it)) ; inserted++; }) });
    txn(arr);
    audit(req.user.id || null, 'import_profiles', null, 'imported ' + inserted);
    res.json({ ok: true, inserted });
  }catch(e){
    res.status(400).json({ error: e.message });
  }
});

// search
app.get('/api/search', authMiddleware, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if(!q) return res.json([]);
  const rows = db.prepare('SELECT id, name, data FROM profiles').all();
  const matches = rows.filter(r => {
    const d = (r.name + ' ' + r.data).toLowerCase();
    return d.indexOf(q) !== -1;
  }).map(r => ({ id: r.id, name: r.name }));
  res.json(matches);
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Pillbox EHR v2 running on port', PORT));
