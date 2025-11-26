// Frontend with login + role-aware UI (simple)
(function(){
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loginGrid">
    <div class="card" id="mainPane">
      <h3>Welcome</h3>
      <div id="mainContent" class="muted">Please login to continue.</div>
    </div>
    <div>
      <div class="card">
        <h3>Hospital Login</h3>
        <input id="h_username" placeholder="username" />
        <input id="h_password" placeholder="password" type="password" />
        <button id="h_login" class="btn">Login (Hospital)</button>
      </div>
      <div class="card" style="margin-top:12px;">
        <h3>EMS Login</h3>
        <input id="e_unit" placeholder="Unit ID (e.g., EMS-1)" />
        <input id="e_code" placeholder="Unit Code" type="password" />
        <button id="e_login" class="btn">Login (EMS)</button>
      </div>
    </div>
  </div>`;

  const mainPane = document.getElementById('mainPane');
  const mainContent = document.getElementById('mainContent');
  const h_login = document.getElementById('h_login');
  const e_login = document.getElementById('e_login');

  function setToken(t){ localStorage.setItem('pillbox_token', t); }
  function getToken(){ return localStorage.getItem('pillbox_token'); }
  function authFetch(path, opts){ opts = opts || {}; opts.headers = opts.headers || {}; opts.headers['Authorization'] = 'Bearer ' + getToken(); return fetch(path, opts); }

  h_login.onclick = async ()=>{
    const username = document.getElementById('h_username').value;
    const password = document.getElementById('h_password').value;
    if(!username||!password) return alert('Enter credentials');
    try{
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode:'hospital', username, password }) });
      const data = await res.json();
      if(res.ok){ setToken(data.token); loadApp(); } else alert(data.error || 'Login failed');
    }catch(e){ alert('Network error'); }
  };

  e_login.onclick = async ()=>{
    const unit = document.getElementById('e_unit').value;
    const code = document.getElementById('e_code').value;
    if(!unit||!code) return alert('Enter EMS credentials');
    try{
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode:'ems', unitId:unit, unitCode:code }) });
      const data = await res.json();
      if(res.ok){ setToken(data.token); loadApp(); } else alert(data.error || 'Login failed');
    }catch(e){ alert('Network error'); }
  };

  async function loadApp(){
    try{
      // show main app UI (profiles listing)
      const r = await authFetch('/api/profiles');
      if(!r.ok) throw new Error('Not authorized');
      const profiles = await r.json();
      mainPane.innerHTML = `<h3>Dashboard</h3>
        <div class="muted">Profiles</div>
        <select id="profiles"></select>
        <div style="margin-top:8px;"><button id="createBtn" class="btn">New Profile</button> <button id="logoutBtn" class="btn ghost">Logout</button></div>
        <div id="profileArea" style="margin-top:12px"></div>
      `;
      const profilesSel = document.getElementById('profiles');
      profiles.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; profilesSel.appendChild(o); });
      if(profiles.length) { profilesSel.value = profiles[0].id; loadProfile(profiles[0].id); }

      document.getElementById('createBtn').onclick = async ()=>{
        const name = prompt('Profile name') || 'New Patient';
        const res = await authFetch('/api/profiles', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
        if(res.ok){ const np = await res.json(); await sleep(200); loadApp(); } else { alert('Error creating'); }
      };

      document.getElementById('logoutBtn').onclick = ()=>{
        localStorage.removeItem('pillbox_token'); location.reload();
      };

      profilesSel.onchange = (e)=> loadProfile(e.target.value);
    }catch(e){
      console.error(e);
      alert('Session expired or unauthorized. Please login again.'); localStorage.removeItem('pillbox_token'); location.reload();
    }
  }

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  async function loadProfile(id){
    try{
      const r = await authFetch('/api/profiles/' + id);
      if(!r.ok) throw new Error('Failed to load');
      const p = await r.json();
      const area = document.getElementById('profileArea');
      area.innerHTML = `
        <h4>${p.name}</h4>
        <div class="muted">MRN: ${p.mrn || '—'} • Status: ${p.status || '—'}</div>
        <h5 style="margin-top:10px">Vitals</h5>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
          <input id="v_hr" value="${p.vitals.hr||''}" /><input id="v_bp" value="${p.vitals.bp||''}" />
          <input id="v_rr" value="${p.vitals.rr||''}" /><input id="v_temp" value="${p.vitals.temp||''}" />
          <input id="v_spo2" value="${p.vitals.spo2||''}" />
        </div>
        <div style="margin-top:8px;"><button id="saveVitals" class="btn">Save Vitals</button></div>

        <h5 style="margin-top:12px">Medications</h5>
        <div id="medsArea"></div>

        <h5 style="margin-top:12px">Orders</h5>
        <div id="ordersArea"></div>

        <h5 style="margin-top:12px">Notes</h5>
        <div id="notesArea"></div>
      `;

      document.getElementById('saveVitals').onclick = async ()=>{
        const body = { vitals: { hr: document.getElementById('v_hr').value, bp: document.getElementById('v_bp').value, rr: document.getElementById('v_rr').value, temp: document.getElementById('v_temp').value, spo2: document.getElementById('v_spo2').value } };
        const res = await authFetch('/api/profiles/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        if(res.ok) alert('Saved'); else alert('Error');
      };

      // render meds/orders/notes quickly
      const medsArea = document.getElementById('medsArea');
      medsArea.innerHTML = '<ul>' + (p.meds||[]).map(m => '<li>'+ (m.time||'') + ' ' + (m.medication||m.med||'') + ' ' + (m.dose||'') + '</li>').join('') + '</ul>';
      const ordersArea = document.getElementById('ordersArea');
      ordersArea.innerHTML = '<ul>' + (p.orders||[]).map(o => '<li>'+o+'</li>').join('') + '</ul>';
      const notesArea = document.getElementById('notesArea');
      notesArea.innerHTML = '<ul>' + (p.notes||[]).map(n => '<li>'+n+'</li>').join('') + '</ul>';
    }catch(e){
      console.error(e);
    }
  }

  // if token present, try loading app
  if(localStorage.getItem('pillbox_token')) loadApp();

})();
