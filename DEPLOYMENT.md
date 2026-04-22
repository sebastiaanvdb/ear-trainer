# Deployment Guide for Mini PC

This guide covers multiple deployment options for your ear-training app on your mini PC.

## Prerequisites

- Your mini PC with network access
- Git installed on the mini PC
- Either Docker or Node.js installed on the mini PC

## Option 1: Docker Deployment (Recommended)

Docker provides the cleanest, most reliable deployment method.

### Setup

1. **Install Docker on your mini PC** (if not already installed):
   ```bash
   # For Ubuntu/Debian
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   # Log out and back in for group changes to take effect
   ```

2. **Clone the repository on your mini PC**:
   ```bash
   git clone <your-repo-url> ear-training
   cd ear-training
   ```

3. **Build and start the application**:
   ```bash
   docker-compose up -d
   ```

4. **Access the app**:
   - From mini PC: `http://localhost:3000`
   - From other devices: `http://<mini-pc-ip>:3000`

### Management Commands

```bash
# Stop the app
docker-compose down

# View logs
docker-compose logs -f

# Restart the app
docker-compose restart

# Update the app (after pulling new changes)
git pull
docker-compose up -d --build
```

## Option 2: Direct Node.js Deployment

If you prefer not to use Docker:

### Setup

1. **Install Node.js on your mini PC** (if not already installed):
   ```bash
   # For Ubuntu/Debian
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Clone and setup**:
   ```bash
   git clone <your-repo-url> ear-training
   cd ear-training
   npm install
   npm run build
   ```

3. **Run the production server**:
   ```bash
   npm start
   ```

4. **Keep it running with PM2** (process manager):
   ```bash
   # Install PM2 globally
   sudo npm install -g pm2
   
   # Start the app
   pm2 start npm --name "ear-training" -- start
   
   # Save PM2 config to restart on boot
   pm2 startup
   pm2 save
   ```

### Management Commands with PM2

```bash
# View status
pm2 status

# View logs
pm2 logs ear-training

# Restart
pm2 restart ear-training

# Stop
pm2 stop ear-training

# Update (after pulling changes)
git pull
npm install
npm run build
pm2 restart ear-training
```

## Option 3: systemd Service (Linux)

For a native Linux service without Docker:

1. **Create a systemd service file**:
   ```bash
   sudo nano /etc/systemd/system/ear-training.service
   ```

2. **Add the following content** (update paths as needed):
   ```ini
   [Unit]
   Description=Ear Training App
   After=network.target

   [Service]
   Type=simple
   User=<your-username>
   WorkingDirectory=/home/<your-username>/ear-training
   ExecStart=/usr/bin/npm start
   Restart=on-failure
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

3. **Enable and start the service**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable ear-training
   sudo systemctl start ear-training
   ```

4. **Check status**:
   ```bash
   sudo systemctl status ear-training
   ```

## Accessing from Other Devices

### Find Your Mini PC's IP Address

```bash
# On Linux
ip addr show | grep "inet "

# On macOS
ifconfig | grep "inet "
```

Look for the IP address on your local network (usually starts with 192.168.x.x or 10.x.x.x).

### Access the App

From any device on your local network:
```
http://<mini-pc-ip>:3000
```

For example: `http://192.168.1.100:3000`

## Optional: Setup a Local Domain Name

Instead of using the IP address, you can set up a local domain:

1. **Edit your router's DNS settings** (if supported) to point a custom domain to your mini PC's IP
2. **Or edit /etc/hosts** on each device:
   ```bash
   # Add this line (replace with your mini PC's IP)
   192.168.1.100 eartraining.local
   ```

Then access via: `http://eartraining.local:3000`

## Optional: Remove Port from URL (Use Port 80)

To access without `:3000` in the URL:

### For Docker:
Edit `docker-compose.yml`:
```yaml
ports:
  - "80:3000"
```

### For Direct/PM2 Deployment:
Use nginx as a reverse proxy:

```bash
# Install nginx
sudo apt install nginx

# Create nginx config
sudo nano /etc/nginx/sites-available/ear-training
```

Add:
```nginx
server {
    listen 80;
    server_name <mini-pc-ip>;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/ear-training /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Troubleshooting

### Can't access from other devices?
- Check firewall: `sudo ufw allow 3000` (Ubuntu/Debian)
- Verify the app is listening on 0.0.0.0, not just localhost

### App won't start?
- Check logs: `docker-compose logs` or `pm2 logs`
- Ensure port 3000 isn't already in use: `lsof -i :3000`

### Updates not showing?
- Clear browser cache
- Rebuild: `docker-compose up -d --build` or `npm run build && pm2 restart ear-training`

## Recommended Setup

For ease of use and reliability, I recommend:
1. **Docker deployment** (easiest to manage and update)
2. **nginx reverse proxy** (clean URLs without port numbers)
3. **Local DNS entry** (memorable domain name)

This gives you clean access like: `http://eartraining.local`
