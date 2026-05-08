# CMG 80 — Birthday RSVP Server

A Node.js backend for the CMG 80th Birthday Celebration website with full RSVP management, video message capture, and an admin dashboard.

---

## Quick Start

### 1. Install Node.js
Download from https://nodejs.org (v18 or later recommended).

### 2. Install dependencies
```bash
cd cmg80_server
npm install
```

### 3. Start the server
```bash
npm start
```

The server runs at **http://localhost:3000**

---

## URLs

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | Birthday website |
| `http://localhost:3000/admin` | Admin dashboard |

---

## Admin Login

**Default password:** `cmg80admin`

To change it, set the environment variable before starting:
```bash
ADMIN_PASSWORD=yourSecurePassword npm start
```

---

## What the RSVP Section Does

Guests see two elegant choice cards:

- **"With Great Delight, I Shall Attend"** — Opens a form asking for name (required) and email (optional).

- **"With Deepest Regret, I Cannot Attend"** — Opens a form asking for name (required) and an optional 15-second video message recorded directly in the browser.

All submissions are saved to `data/rsvp.json`. Videos are saved to `data/videos/`.

---

## Admin Dashboard Features

- **Stats panel** — Total RSVPs, Attendees count, Not-attending count, Video messages count
- **Attendees tab** — Table of everyone who confirmed attendance with name, email, date
- **Not Attending tab** — Table with checkboxes to select individual video messages
  - Download a single video
  - Download selected videos as a `.zip`
  - Download all videos as a `.zip`
- **Export Excel** — Generates a `.xlsx` file with two sheets:
  - `Attendees` — Name, Email, RSVP Date
  - `Not Attending` — Name, Has Video, RSVP Date

---

## File Structure

```
cmg80_server/
├── server.js          ← Node.js / Express server
├── package.json
├── README.md
├── data/
│   ├── rsvp.json      ← RSVP records (auto-created)
│   └── videos/        ← Video uploads (auto-created)
├── admin/
│   └── index.html     ← Admin dashboard
└── public/            ← The birthday website
    ├── index.html
    └── assets/
        ├── css/style.css
        ├── js/main.js
        └── images/
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rsvp` | None | Submit RSVP (multipart form) |
| POST | `/admin/login` | None | Get admin token |
| GET | `/admin/api/rsvps` | Bearer | List all RSVPs |
| GET | `/admin/api/video/:filename` | Bearer | Download single video |
| POST | `/admin/api/download-videos` | Bearer | Zip selected videos |
| GET | `/admin/api/download-all-videos` | Bearer | Zip all videos |
| GET | `/admin/api/export` | Bearer | Export Excel report |

---

## Deploying Online

To share with guests, deploy to a VPS or cloud service:

**Using a VPS (e.g. DigitalOcean, Hetzner):**
1. Copy the `cmg80_server` folder to the server
2. Run `npm install`
3. Use `pm2` to keep it running: `pm2 start server.js --name cmg80`
4. Set up Nginx as a reverse proxy to port 3000

**Using Railway / Render (free tier):**
1. Push to a GitHub repo
2. Connect to Railway or Render
3. Set `ADMIN_PASSWORD` as an environment variable

---

## Changing the Port

```bash
PORT=8080 npm start
```
