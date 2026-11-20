/** PM2 — always start from monorepo root so workspace node_modules resolve */
const path = require('path');
const root = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'darshandesk-api',
      cwd: root,
      script: 'npm',
      args: 'run start -w server',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/darshandesk/pm2-error.log',
      out_file: '/var/log/darshandesk/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};