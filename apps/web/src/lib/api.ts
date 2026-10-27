export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  issues?: Array<{ path: (string | number)[]; message: string }>;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly error: string,
    message: string,
    public readonly issues?: Array<{ path: (string | number)[]; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;

  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body && typeof options.body === 'string') {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Enviar y recibir cookies HttpOnly de sesión
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  let data: unknown;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorData = data as Partial<ApiErrorResponse> | null;
    let message = errorData?.message || response.statusText || 'Error en la petición';

    if (response.status === 429) {
      message = 'Demasiadas solicitudes. Por favor, espera un minuto antes de reintentar.';
    } else if (response.status === 401) {
      message = 'Sesión expirada o no autorizada. Por favor, inicia sesión.';
    } else if (response.status === 404) {
      message = 'El recurso solicitado no fue encontrado.';
    } else if (response.status === 403) {
      message = 'No tienes permiso para realizar esta acción.';
    }

    throw new ApiError(
      response.status,
      errorData?.error || 'HttpError',
      message,
      errorData?.issues
    );
  }

  return data as T;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
