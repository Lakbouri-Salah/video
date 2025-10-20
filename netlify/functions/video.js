// Netlify Function to proxy Google Drive video with Range support
// Path: /.netlify/functions/video

exports.handler = async (event) => {
  try {
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const DEFAULT_FILE_ID = process.env.FILE_ID;

    if (!GOOGLE_API_KEY) {
      return { statusCode: 500, body: 'Server not configured. Please set GOOGLE_API_KEY in environment.' };
    }

    const range = event.headers && (event.headers.range || event.headers.Range);
    const qs = event.queryStringParameters || {};
    const fileId = qs.id || DEFAULT_FILE_ID;

    if (!fileId) {
      return { statusCode: 400, body: 'Missing file id. Provide ?id=YOUR_FILE_ID or set FILE_ID in env.' };
    }

    const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
    url.searchParams.set('alt', 'media');
    url.searchParams.set('key', GOOGLE_API_KEY);

    const upstreamHeaders = {};
    if (range) upstreamHeaders['Range'] = range;

    const upstream = await fetch(url.toString(), { headers: upstreamHeaders });

    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => '');
      return { statusCode: upstream.status, body: text || 'Failed to fetch video from Google Drive' };
    }

    const headers = { 'Content-Type': 'video/mp4' };
    const contentLength = upstream.headers.get('content-length');
    const acceptRanges = upstream.headers.get('accept-ranges');
    const contentRange = upstream.headers.get('content-range');

    if (contentLength) headers['Content-Length'] = contentLength;
    if (acceptRanges) headers['Accept-Ranges'] = acceptRanges;
    if (range && contentRange) headers['Content-Range'] = contentRange;

    const arrayBuffer = await upstream.arrayBuffer();
    const body = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: upstream.status === 206 ? 206 : 200,
      headers,
      body,
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: 'Internal server error' };
  }
};
