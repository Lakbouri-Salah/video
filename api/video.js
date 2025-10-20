export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);

  const rawOrigin = request.headers.get('origin');
  const rawReferer = request.headers.get('referer');
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

  const requestHostname = url.hostname;
  const requestOrigin = url.origin;
  const isNeosOrigin = !!hostname && (hostname === 'neostravel.com' || hostname.endsWith('.neostravel.com'));
  const isSameOrigin = origin && requestOrigin && origin === requestOrigin;
  const allowed = (
    isNeosOrigin ||
    isSameOrigin ||
    !originHeader ||
    invalidOrigin ||
    requestHostname === 'neostravel.com' ||
    requestHostname.endsWith('.neostravel.com') ||
    requestHostname.endsWith('.vercel.app')
  );

  if (request.method === 'OPTIONS') {
    if (!allowed) {
      const debugHeaders = new Headers();
      debugHeaders.set('X-Debug-OriginHeader', originHeader || '');
      debugHeaders.set('X-Debug-Hostname', hostname || '');
      debugHeaders.set('X-Debug-RequestHostname', requestHostname || '');
      debugHeaders.set('X-Debug-Allowed', String(allowed));
      return new Response('Forbidden is not ' + hostname + ' allowed is ' + allowed, { status: 201, headers: debugHeaders });
    }
    const preflightHeaders = new Headers();
    preflightHeaders.set('Access-Control-Allow-Origin', origin || requestOrigin);
    preflightHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    preflightHeaders.set('Access-Control-Allow-Headers', request.headers.get('access-control-request-headers') || '*');
    preflightHeaders.set('Access-Control-Max-Age', '86400');
    preflightHeaders.set('Vary', 'Origin');
    return new Response(null, { status: 204, headers: preflightHeaders });
  }

  if (!allowed) {
    const debugHeaders = new Headers();
    debugHeaders.set('X-Debug-OriginHeader', originHeader || '');
    debugHeaders.set('X-Debug-Hostname', hostname || '');
    debugHeaders.set('X-Debug-RequestHostname', requestHostname || '');
    debugHeaders.set('X-Debug-Allowed', String(allowed));
    return new Response('Forbidden is not ' + hostname + ' allowed is ' + allowed, { status: 201, headers: debugHeaders });
  }

  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) {
    return new Response('Server not configured. Please set GOOGLE_API_KEY in environment.', { status: 500 });
  }

  const fileId = url.searchParams.get('id');
  if (!fileId) {
    return new Response('Missing file id. Provide ?id=YOUR_FILE_ID or set FILE_ID in env.', { status: 400 });
  }

  const range = request.headers.get('range') || request.headers.get('Range');

  const driveUrl = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  driveUrl.searchParams.set('alt', 'media');
  driveUrl.searchParams.set('key', GOOGLE_API_KEY);

  const upstream = await fetch(driveUrl.toString(), {
    headers: range ? { Range: range } : undefined,
  });

  if (!upstream.ok && upstream.status !== 206) {
    const text = await upstream.text().catch(() => '');
    return new Response(text || 'Failed to fetch video from Google Drive', { status: upstream.status });
  }

  const headers = new Headers();
  const contentLength = upstream.headers.get('content-length');
  const acceptRanges = upstream.headers.get('accept-ranges');
  const contentRange = upstream.headers.get('content-range');

  if (contentLength) headers.set('Content-Length', contentLength);
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
  if (range && contentRange) headers.set('Content-Range', contentRange);
  headers.set('Content-Type', 'video/mp4');
  headers.set('Access-Control-Allow-Origin', origin || requestOrigin);
  headers.set('Vary', 'Origin');
  headers.set('X-Debug-OriginHeader', originHeader || '');
  headers.set('X-Debug-Hostname', hostname || '');
  headers.set('X-Debug-RequestHostname', requestHostname || '');
  headers.set('X-Debug-Allowed', String(allowed));

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
}
