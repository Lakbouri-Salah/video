require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const FILE_ID = process.env.FILE_ID;

if (!GOOGLE_API_KEY || !FILE_ID) {
  console.warn('[WARN] Missing GOOGLE_API_KEY or FILE_ID in .env. The /video route will fail until these are set.');
}

// Serve static files from public/
app.use(express.static(path.join(__dirname, '..', 'public')));

// Streams video from Google Drive
app.get('/video', async (req, res) => {
  try {
    if (!GOOGLE_API_KEY) {
      return res.status(500).send('Server not configured. Please set GOOGLE_API_KEY in .env');
    }

    const range = req.headers.range;

    // Allow dynamic file ID via query parameter (?id=...) with fallback to env FILE_ID
    const fileId = (req.query && req.query.id) ? String(req.query.id) : FILE_ID;
    if (!fileId) {
      return res.status(400).send('Missing file id. Provide ?id=YOUR_FILE_ID or set FILE_ID in .env');
    }

    const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
    url.searchParams.set('alt', 'media');
    url.searchParams.set('key', GOOGLE_API_KEY);

    const upstreamHeaders = {};
    if (range) {
      upstreamHeaders['Range'] = range;
    }

    const upstream = await fetch(url.toString(), {
      headers: upstreamHeaders,
    });

    // Google may return 200 (full content) or 206 (partial content) depending on Range
    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).send(text || 'Failed to fetch video from Google Drive');
    }

    const contentType = upstream.headers.get('content-type') || 'video/mp4';
    const contentLength = upstream.headers.get('content-length');
    const acceptRanges = upstream.headers.get('accept-ranges');
    const contentRange = upstream.headers.get('content-range');

    // Set headers for streaming
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    if (range && contentRange) res.setHeader('Content-Range', contentRange);

    // Requirement: ensure Content-Type is video/mp4
    res.setHeader('Content-Type', 'video/mp4');

    res.status(upstream.status === 206 ? 206 : 200);

    // Pipe the upstream stream to the response
    upstream.body.pipe(res);

    upstream.body.on('error', (err) => {
      console.error('Stream error from Google Drive:', err);
      if (!res.headersSent) {
        res.status(500);
      }
      res.end();
    });

    // If client disconnects, abort upstream
    req.on('close', () => {
      try {
        if (upstream.body && typeof upstream.body.destroy === 'function') {
          upstream.body.destroy();
        }
      } catch (e) {}
    });
  } catch (err) {
    console.error('Error in /video route:', err);
    res.status(500).send('Internal server error');
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
