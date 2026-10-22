(function () {
  'use strict';
  const pending = new Map();
  class ApiError extends Error {
    constructor(status, data, response) {
      const detail = data?.detail;
      super(typeof detail === 'string' ? detail : status === 422 ? 'Controlla i campi inseriti.' : data?.message || 'Richiesta non riuscita.');
      this.status = status; this.code = data?.code || String(status); this.fields = Array.isArray(detail) ? detail : data?.fields;
      this.requestId = response?.headers.get('X-Request-ID'); this.retryAfter = Number(response?.headers.get('Retry-After') || 0);
      this.passwordRequired = response?.headers.get('X-Password-Change') === 'required';
    }
  }
  async function request(method, path, body, options = {}) {
    const key = method + ':' + path;
    if (method === 'GET' && pending.has(key)) return pending.get(key);
    const operation = (async () => {
      let tries = 0;
      for (;;) {
        const abort = new AbortController(), timer = setTimeout(() => abort.abort(), options.timeout || 15000);
        try {
          const response = await fetch(window.GambitConfig.API_BASE_URL + path, {
            method, credentials: 'same-origin', signal: options.signal ? AbortSignal.any([options.signal,abort.signal]) : abort.signal,
            headers: { 'X-Club': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {})
          });
          let data; const type = response.headers.get('content-type') || '';
          if (type.includes('json')) data = await response.json(); else data = await response.text();
          if (!response.ok) {
            if (method === 'GET' && [502,503,504].includes(response.status) && tries++ === 0) { await new Promise(r => setTimeout(r, 400)); continue; }
            const error = new ApiError(response.status, data, response);
            if (error.passwordRequired) document.dispatchEvent(new CustomEvent('auth:password-required'));
            if (response.status === 401 && !options.noAuth) document.dispatchEvent(new CustomEvent('auth:expired'));
            throw error;
          }
          return data;
        } catch (error) {
          if (error instanceof ApiError) throw error;
          if (method === 'GET' && tries++ === 0 && navigator.onLine) { await new Promise(r => setTimeout(r, 400)); continue; }
          throw new ApiError(0, { message: error.name === 'AbortError' ? 'La risposta sta impiegando troppo tempo. Riprova.' : 'Connessione interrotta. Riprova.' });
        } finally { clearTimeout(timer); }
      }
    })();
    if (method === 'GET') pending.set(key, operation);
    try { return await operation; } finally { if (pending.get(key) === operation) pending.delete(key); }
  }
  window.GambitAPI = { request, get: (p,o) => request('GET',p,undefined,o), post:(p,b={},o)=>request('POST',p,b,o), patch:(p,b,o)=>request('PATCH',p,b,o), put:(p,b,o)=>request('PUT',p,b,o), delete:(p,b,o)=>request('DELETE',p,b,o), ApiError };
})();
