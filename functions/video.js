export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const originHeader = request.headers.get('origin') || request.headers.get('referer');
  let origin = '';
  let hostname = '';
  if (originHeader) {
    try {
      const parsed = new URL(originHeader);
      origin = parsed.origin;
      hostname = parsed.hostname;
    } catch {}
  }
  const allowed = hostname === 'neostravel.com' || hostname === 'www.neostravel.com';

  if (request.method === 'OPTIONS') {
    if (!allowed) {
      return new Response('Forbidden is not '+hostname + ' allowed is '+allowed, { status: 403 });
    }
    const preflightHeaders = new Headers();
    preflightHeaders.set('Access-Control-Allow-Origin', origin);
    preflightHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    preflightHeaders.set('Access-Control-Allow-Headers', request.headers.get('access-control-request-headers') || '*');
    preflightHeaders.set('Access-Control-Max-Age', '86400');
    preflightHeaders.set('Vary', 'Origin');
    return new Response(null, { status: 204, headers: preflightHeaders });
  }

  if (!allowed) {
    return new Response('Forbidden is not '+hostname + ' allowed is '+allowed, { status: 403 });
  }

  const GOOGLE_API_KEY = 'AIzaSyACJIrfwHZysyoxgToFKsNX7OgUaxfqD5c';

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
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
}
