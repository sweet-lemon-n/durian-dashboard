export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const resp = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Parse body first on 401/403 so server error messages are preserved
  if (resp.status === 401 || resp.status === 403) {
    let body: { error?: string } | null = null;
    try {
      body = await resp.json();
    } catch {
      // body parsing failed, use default fallback
    }

    if (resp.status === 401) {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect') || window.location.pathname;
      if (window.location.pathname !== '/login') {
        window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
      }
    }

    const defaultMsg = resp.status === 401 ? 'Unauthorized' : 'Forbidden';
    throw new ApiError(body?.error || defaultMsg, resp.status);
  }

  const json = await resp.json();
  if (!resp.ok) {
    throw new ApiError(json.error || `HTTP ${resp.status}`, resp.status);
  }
  return json as T;
}
