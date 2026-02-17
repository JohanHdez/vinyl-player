// Resolves the proxy URL dynamically.
// Local dev: uses localhost:3001
// Tunnel/production: app is served from same origin as proxy, so use ''
function resolveProxyUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const proxyParam = params.get('proxy');
  if (proxyParam) return proxyParam;

  if (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    // Local dev: Angular on 4200, proxy on 3001
    if (window.location.port === '4200') {
      return 'http://localhost:3001';
    }
    // Served from proxy directly (port 3001)
    return '';
  }

  // Remote (tunnel): app and API on same origin
  return '';
}

export const PROXY_URL = resolveProxyUrl();
