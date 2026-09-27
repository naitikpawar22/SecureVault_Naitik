# Apache Deployment Guide for SecureVault

This directory contains the production Apache configurations for hosting **SecureVault** on:
- Frontend: `https://naitik.app` (and `www.naitik.app`)
- Backend API: `https://api.naitik.app`

---

## 1. Required Apache Modules

Enable the required Apache modules:
```bash
sudo a2enmod rewrite proxy proxy_http headers deflate expires ssl
sudo systemctl restart apache2
```

---

## 2. Deploying Frontend (`naitik.app`)

1. Build the production client bundle:
   ```bash
   cd client
   npm install
   npm run build
   ```
2. Copy or symlink `client/dist` to `/var/www/securevault/client/dist`:
   ```bash
   sudo mkdir -p /var/www/securevault/client
   sudo cp -r client/dist /var/www/securevault/client/
   sudo chown -R www-data:www-data /var/www/securevault/client/dist
   ```
3. Copy the VirtualHost file:
   ```bash
   sudo cp apache/naitik.app.conf /etc/apache2/sites-available/
   sudo a2ensite naitik.app.conf
   ```

*Note: The `.htaccess` file inside `client/dist/` handles SPA URL rewriting so routes like `/login` and `/dashboard` reload without 404 errors.*

---

## 3. Deploying Backend API (`api.naitik.app`)

1. Install production dependencies and start the Node.js service using PM2:
   ```bash
   cd server
   npm install --production
   sudo npm install -g pm2
   pm2 start src/server.js --name securevault-api
   pm2 save
   pm2 startup
   ```
2. Copy the reverse proxy configuration:
   ```bash
   sudo cp apache/api.naitik.app.conf /etc/apache2/sites-available/
   sudo a2ensite api.naitik.app.conf
   ```
3. Test Apache configuration and reload:
   ```bash
   sudo apache2ctl configtest
   sudo systemctl reload apache2
   ```

---

## 4. Free SSL / HTTPS with Let's Encrypt (Certbot)

Run Certbot to automatically configure HTTPS certificates for all domains:
```bash
sudo apt install certbot python3-certbot-apache -y
sudo certbot --apache -d naitik.app -d www.naitik.app -d api.naitik.app
```
Certbot will automatically install SSL certificates and configure HTTPS redirects.
