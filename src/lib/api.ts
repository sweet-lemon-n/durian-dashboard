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

  if (resp.status === 401) {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || window.location.pathname;
    if (window.location.pathname !== '/login') {
      window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
    }
    throw new ApiError('Unauthorized', 401);
  }

  if (resp.status === 403) {
    throw new ApiError('Forbidden', 403);
  }

  const json = await resp.json();
  if (!resp.ok) {
    throw new ApiError(json.error || `HTTP ${resp.status}`, resp.status);
  }
  return json as T;
}
