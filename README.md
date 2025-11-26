Pillbox EHR v2 - Self-hosted (Option 3)
========================================

This package adds hybrid EMS/Hospital authentication, roles, and audit logs.

Quick start:
1. Unzip and open a terminal in the project folder.
2. Install dependencies:
   npm install
3. Initialize the database (creates default admin and EMS demo accounts):
   npm run init-db
   - Default admin: username=admin password=adminpass
   - Demo EMS account: unit_id=EMS-1 unit_code=ems123
4. Start the server:
   npm start
5. Visit: http://localhost:3000

Notes:
- Admin users can create hospital users and EMS accounts via API endpoints.
- Audit logs are saved in the 'audits' table and can be viewed via /api/audits by admin users.
- For production, set PILLBOX_JWT_SECRET in environment variables and use HTTPS.

Deployment to free hosts:
- Render.com: create a new Web Service, connect the repo or upload the project zip, set build command `npm install` and start command `npm start`. Set environment variable PILLBOX_JWT_SECRET.
- Replit: create a Node.js repl, upload files, run `npm install` then `npm run init-db` and `npm start`. Replit provides a live URL.
- Railway/Render: similar steps, ensure you add environment variable for JWT secret.

If you want, I can:
- Dockerize the app and provide a Dockerfile + docker-compose.yml
- Add an admin UI for creating users/EMS accounts and viewing audits
- Deploy to Render/Replica on your behalf if you provide access/authorization

