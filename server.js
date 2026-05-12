'use strict';

require('dotenv').config();

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const xlsx     = require('xlsx');
const archiver = require('archiver');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Paths ─────────────────────────────────────── */
const DATA_FILE  = path.join(__dirname, 'data', 'rsvp.json');
const VIDEOS_DIR = path.join(__dirname, 'data', 'videos');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_FILE = path.join(__dirname, 'admin', 'index.html');

/* ── Config ────────────────────────────────────── */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cmg80admin';
const ADMIN_TOKEN    = process.env.ADMIN_TOKEN    || 'cmg80-secret-token-change-me';

/* ── Bootstrap dirs / files ────────────────────── */
[path.join(__dirname,'data'), VIDEOS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ rsvps: [] }, null, 2));

/* ── Multer — video uploads ─────────────────────── */
// Map mime types to sensible file extensions
const MIME_EXT = {
  'video/webm':       '.webm',
  'video/mp4':        '.mp4',
  'video/ogg':        '.ogg',
  'video/quicktime':  '.mov',
  'video/x-matroska': '.mkv',
  'video/3gpp':       '.3gp',
};

const storage = multer.diskStorage({
  destination: VIDEOS_DIR,
  filename: (req, file, cb) => {
    const ts       = Date.now();
    const rand     = Math.random().toString(36).slice(2, 8);
    const baseMime = (file.mimetype || '').split(';')[0].trim();
    const ext      = MIME_EXT[baseMime] || '.webm';
    cb(null, `video_${ts}_${rand}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150 MB — matches nginx client_max_body_size
  fileFilter: (req, file, cb) => {
    // Strip codec params e.g. "video/mp4; codecs=avc1..." → "video/mp4"
    const baseMime = (file.mimetype || '').split(';')[0].trim();
    console.log('[UPLOAD] fieldname=%s  baseMime=%s  original=%s', file.fieldname, baseMime, file.originalname);
    const videoExts = /\.(webm|mp4|mov|ogg|mkv|3gp|avi)$/i;
    if (baseMime.startsWith('video/')) return cb(null, true);
    if (baseMime === 'application/octet-stream') return cb(null, true);
    if (videoExts.test(file.originalname)) return cb(null, true);
    console.warn('[UPLOAD] REJECTED — mime:', file.mimetype);
    cb(new Error('Only video files are allowed'));
  }
});

/* ── Middleware ─────────────────────────────────── */
app.use(express.json());
app.use(express.static(PUBLIC_DIR));


/* ── Helpers ────────────────────────────────────── */
function loadRsvps() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).rsvps || []; }
  catch { return []; }
}
function saveRsvps(rsvps) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ rsvps }, null, 2));
}
function authAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.replace('Bearer ', '').trim();
  if (token === ADMIN_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorised' });
}

/* ══════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════ */

/**
 * POST /api/video-preupload
 * Accepts a video upload BEFORE the RSVP form is submitted.
 * This is the key latency optimisation: the client starts uploading
 * as soon as the user selects/records a video (while they are still
 * filling in the form).  Returns { videoId } which is then passed to
 * /api/rsvp instead of re-uploading the file.
 */
app.post('/api/video-preupload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video received' });
  console.log('[PRE-UPLOAD] saved:', req.file.filename, '—', req.file.size, 'bytes');
  res.json({ success: true, videoId: req.file.filename });
});

/**
 * POST /api/rsvp
 * Body (URL-encoded or multipart): name*, email?, attending*, videoId? | video?
 *
 * Prefers videoId (already on disk from /api/video-preupload).
 * Falls back to accepting an inline video upload for backwards compat.
 */
app.post('/api/rsvp', upload.single('video'), (req, res) => {
  const { name, email, attending, videoId } = req.body;

  if (!name || !name.trim()) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Name is required' });
  }

  // Resolve video file: prefer pre-uploaded ID, fall back to inline upload
  let videoFile = req.file?.filename || null;
  if (!videoFile && videoId) {
    const safe = path.basename(videoId);
    const candidate = path.join(VIDEOS_DIR, safe);
    if (fs.existsSync(candidate)) {
      videoFile = safe;
    } else {
      console.warn('[RSVP] videoId not found on disk:', safe);
    }
  }

  const rsvps = loadRsvps();
  const entry = {
    id:          Date.now().toString(36) + Math.random().toString(36).slice(2),
    name:        name.trim(),
    email:       email?.trim() || null,
    attending:   attending === 'true' || attending === true,
    videoFile,
    submittedAt: new Date().toISOString()
  };
  rsvps.push(entry);
  saveRsvps(rsvps);

  console.log(`[RSVP] ${entry.attending ? 'ATTENDING' : 'NOT ATTENDING'} — ${entry.name} — video: ${videoFile || 'none'}`);
  res.json({ success: true, id: entry.id });
});

/* ══════════════════════════════════════════════════
   ADMIN AUTH
   ══════════════════════════════════════════════════ */

/** POST /admin/login */
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_TOKEN });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

/* ══════════════════════════════════════════════════
   ADMIN API  (all require Bearer token)
   ══════════════════════════════════════════════════ */

/** GET /admin/api/rsvps — list all responses */
app.get('/admin/api/rsvps', authAdmin, (req, res) => {
  res.json(loadRsvps());
});

/** GET /admin/api/video/:filename — stream / download a single video */
app.get('/admin/api/video/:filename', authAdmin, (req, res) => {
  // Basic path-traversal guard
  const safe = path.basename(req.params.filename);
  const file = path.join(VIDEOS_DIR, safe);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Video not found' });

  const rsvps = loadRsvps();
  const rsvp  = rsvps.find(r => r.videoFile === safe);
  const label = rsvp
    ? `${rsvp.name.replace(/[^a-z0-9]/gi, '_')}_message.webm`
    : safe;

  res.setHeader('Content-Disposition', `attachment; filename="${label}"`);
  res.setHeader('Content-Type', 'video/webm');
  fs.createReadStream(file).pipe(res);
});

/** POST /admin/api/download-videos — zip selected videos
 *  Body: { filenames: ["video_xxx.webm", …] }
 */
app.post('/admin/api/download-videos', authAdmin, (req, res) => {
  const { filenames } = req.body;
  if (!Array.isArray(filenames) || filenames.length === 0) {
    return res.status(400).json({ error: 'No filenames provided' });
  }

  const rsvps   = loadRsvps();
  const archive = archiver('zip', { zlib: { level: 6 } });

  res.setHeader('Content-Disposition', 'attachment; filename="CMG80_Selected_Videos.zip"');
  res.setHeader('Content-Type', 'application/zip');
  archive.pipe(res);

  filenames.forEach(fn => {
    const safe  = path.basename(fn);
    const file  = path.join(VIDEOS_DIR, safe);
    if (!fs.existsSync(file)) return;
    const rsvp  = rsvps.find(r => r.videoFile === safe);
    const label = rsvp
      ? `${rsvp.name.replace(/[^a-z0-9]/gi, '_')}_message.webm`
      : safe;
    archive.file(file, { name: label });
  });

  archive.finalize();
  archive.on('error', err => { console.error('[ZIP]', err); });
});

/** GET /admin/api/download-all-videos — zip every video */
app.get('/admin/api/download-all-videos', authAdmin, (req, res) => {
  const rsvps   = loadRsvps().filter(r => r.videoFile);
  const archive = archiver('zip', { zlib: { level: 6 } });

  res.setHeader('Content-Disposition', 'attachment; filename="CMG80_All_Videos.zip"');
  res.setHeader('Content-Type', 'application/zip');
  archive.pipe(res);

  rsvps.forEach(r => {
    const file = path.join(VIDEOS_DIR, r.videoFile);
    if (!fs.existsSync(file)) return;
    const label = `${r.name.replace(/[^a-z0-9]/gi, '_')}_message.webm`;
    archive.file(file, { name: label });
  });

  archive.finalize();
  archive.on('error', err => { console.error('[ZIP]', err); });
});

/** DELETE /admin/api/rsvp/:id — remove a single RSVP entry (and its video) */
app.delete('/admin/api/rsvp/:id', authAdmin, (req, res) => {
  const { id } = req.params;
  const rsvps = loadRsvps();
  const idx   = rsvps.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Entry not found' });

  const entry = rsvps[idx];
  if (entry.videoFile) {
    const videoPath = path.join(VIDEOS_DIR, entry.videoFile);
    if (fs.existsSync(videoPath)) {
      fs.unlink(videoPath, err => {
        if (err) console.warn('[DELETE] video unlink error:', err.message);
      });
    }
  }

  rsvps.splice(idx, 1);
  saveRsvps(rsvps);
  console.log(`[DELETE] Removed entry: ${entry.name} (${id})`);
  res.json({ success: true });
});

/** GET /admin/api/export — Excel workbook with two sheets */
app.get('/admin/api/export', authAdmin, (req, res) => {
  const rsvps      = loadRsvps();
  const attending  = rsvps.filter(r => r.attending);
  const declining  = rsvps.filter(r => !r.attending);
  const fmt        = iso => new Date(iso).toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' });

  const wb = xlsx.utils.book_new();

  /* Sheet 1 — Attendees */
  const attRows = attending.map((r, i) => ({
    '#':          i + 1,
    'Full Name':  r.name,
    'Email':      r.email || '—',
    'RSVP Date':  fmt(r.submittedAt)
  }));
  const attSheet = xlsx.utils.json_to_sheet(attRows.length ? attRows : [{ '#':'', 'Full Name':'No attendees yet', 'Email':'', 'RSVP Date':'' }]);
  attSheet['!cols'] = [{ wch:4 },{ wch:30 },{ wch:36 },{ wch:22 }];
  xlsx.utils.book_append_sheet(wb, attSheet, 'Attendees');

  /* Sheet 2 — Not Attending */
  const decRows = declining.map((r, i) => ({
    '#':             i + 1,
    'Full Name':     r.name,
    'Video Message': r.videoFile ? 'Yes' : 'No',
    'RSVP Date':     fmt(r.submittedAt)
  }));
  const decSheet = xlsx.utils.json_to_sheet(decRows.length ? decRows : [{ '#':'', 'Full Name':'None yet', 'Video Message':'', 'RSVP Date':'' }]);
  decSheet['!cols'] = [{ wch:4 },{ wch:30 },{ wch:16 },{ wch:22 }];
  xlsx.utils.book_append_sheet(wb, decSheet, 'Not Attending');

  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="CMG80_RSVP_Report.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

/* ── Admin panel SPA ───────────────────────────── */
app.get('/admin', (req, res) => res.sendFile(ADMIN_FILE));
app.get('/admin/', (req, res) => res.sendFile(ADMIN_FILE));

/* ── Global error handler — always returns JSON ─── */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message || err);

  // Multer-specific errors (file too large, wrong type, etc.)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Video file is too large (max 150 MB).' });
  }
  if (err.message === 'Only video files are allowed') {
    return res.status(415).json({ error: 'Only video files are accepted.' });
  }

  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

/* ── 404 fallback ──────────────────────────────── */
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

/* ── Start ─────────────────────────────────────── */
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   CMG 80 — Birthday RSVP Server      ║');
  console.log(`  ║   http://localhost:${PORT}               ║`);
  console.log(`  ║   Admin: http://localhost:${PORT}/admin  ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log(`  Admin password: ${ADMIN_PASSWORD}`);
  console.log('');
});