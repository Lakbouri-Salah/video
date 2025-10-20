module.exports = async (req, res) => {
  const { query, headers } = req;
  
  const rawOrigin = headers.origin;
  const rawReferer = headers.referer;
  const originHeader = (rawOrigin && rawOrigin !== 'null' && !rawOrigin.startsWith('about:'))
    ? rawOrigin
    : (rawReferer || rawOrigin);

  let origin = '';
  let hostname = '';
  let invalidOrigin = false;
  if (originHeader) {
    try {
      const parsed = new URL(originHeader);
      origin = parsed.origin;
      hostname = parsed.hostname;
    } catch {
      invalidOrigin = true;
    }
  }

  const requestHostname = req.headers.host || '';
  const isNeosOrigin = !!hostname && (hostname === 'neostravel.com' || hostname.endsWith('.neostravel.com'));
  const isSameOrigin = origin && requestHostname && hostname === requestHostname;
  const allowed = (
    isNeosOrigin ||
    isSameOrigin ||
    !originHeader ||
    invalidOrigin ||
    requestHostname === 'neostravel.com' ||
    requestHostname.endsWith('.neostravel.com') ||
    requestHostname.endsWith('.vercel.app')
  );

  if (req.method === 'OPTIONS') {
    if (!allowed) {
      res.setHeader('X-Debug-OriginHeader', originHeader || '');
      res.setHeader('X-Debug-Hostname', hostname || '');
      res.setHeader('X-Debug-RequestHostname', requestHostname || '');
      res.setHeader('X-Debug-Allowed', String(allowed));
      return res.status(403).send('Forbidden');
    }
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', headers['access-control-request-headers'] || '*');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');
    return res.status(204).end();
  }

  if (!allowed) {
    res.setHeader('X-Debug-OriginHeader', originHeader || '');
    res.setHeader('X-Debug-Hostname', hostname || '');
    res.setHeader('X-Debug-RequestHostname', requestHostname || '');
    res.setHeader('X-Debug-Allowed', String(allowed));
    return res.status(403).send('Forbidden');
  }

  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) {
    return res.status(500).send('Server not configured. Please set GOOGLE_API_KEY in environment.');
  }

  const fileId = query.id;
  if (!fileId) {
    return res.status(400).send('Missing file id. Provide ?id=YOUR_FILE_ID');
  }

  const range = headers.range || headers.Range;
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}`;

  try {
    const upstreamHeaders = {};
    if (range) {
      upstreamHeaders.Range = range;
    }

    const upstream = await fetch(driveUrl, { headers: upstreamHeaders });

    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).send(text || 'Failed to fetch video from Google Drive');
    }

    const contentLength = upstream.headers.get('content-length');
    const acceptRanges = upstream.headers.get('accept-ranges');
    const contentRange = upstream.headers.get('content-range');

    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    if (range && contentRange) res.setHeader('Content-Range', contentRange);
    
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('X-Debug-OriginHeader', originHeader || '');
    res.setHeader('X-Debug-Hostname', hostname || '');
    res.setHeader('X-Debug-RequestHostname', requestHostname || '');
    res.setHeader('X-Debug-Allowed', String(allowed));

    res.status(upstream.status === 206 ? 206 : 200);

    const reader = upstream.body.getReader();
    const stream = new ReadableStream({
      async start(controller) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      }
    });

    for await (const chunk of stream) {
      res.write(Buffer.from(chunk));
    }
    res.end();

  } catch (err) {
    console.error('Error in /video route:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
};
