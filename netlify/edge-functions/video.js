// Netlify Edge Function: streams Google Drive video with Range support without buffering
// Mapped from /video via netlify.toml [[edge_functions]]

export default async (request, context) => {
  const url = new URL(request.url);

  const GOOGLE_API_KEY = context?.env?.GOOGLE_API_KEY || (typeof Deno !== 'undefined' ? Deno.env.get('GOOGLE_API_KEY') : undefined) || (typeof process !== 'undefined' ? process.env.GOOGLE_API_KEY : undefined);
  const DEFAULT_FILE_ID = context?.env?.FILE_ID || (typeof Deno !== 'undefined' ? Deno.env.get('FILE_ID') : undefined) || (typeof process !== 'undefined' ? process.env.FILE_ID : undefined);

  if (!GOOGLE_API_KEY) {
    return new Response('Server not configured. Please set GOOGLE_API_KEY in environment.', { status: 500 });
  }

  const fileId = url.searchParams.get('id') || DEFAULT_FILE_ID;
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

  // Clone headers and normalize for video streaming
  const headers = new Headers();
  const contentLength = upstream.headers.get('content-length');
  const acceptRanges = upstream.headers.get('accept-ranges');
  const contentRange = upstream.headers.get('content-range');

  if (contentLength) headers.set('Content-Length', contentLength);
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
  if (range && contentRange) headers.set('Content-Range', contentRange);
  headers.set('Content-Type', 'video/mp4');

  // Stream the body directly to the client to avoid buffering/size limits
  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
};
