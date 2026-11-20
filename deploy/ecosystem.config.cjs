/** PM2 process file — copy to EC2 app directory */
module.exports = {
  apps: [
    {
      name: 'darshandesk-api',
      cwd: './server',
      script: 'src/index.js',
      interpreter: 'node',
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