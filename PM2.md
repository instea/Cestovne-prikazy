# PM2 setup

* Create ecosystem file: `pm2 init`

```
module.exports = {
  apps : [{
    name: 'cestaky',
    cwd: '/opt/cestaky/src',
    script: 'server/index.js',
    log_date_format: 'YY-MM-DD HH:mm:ss.SSS',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '250M',
    env: {
      MONGO_URL: 'mongodb://user:pass@localhost:port/database',
      NODE_ENV: 'production'
    }
  }]

};
```

* Start - `pm2 start`
