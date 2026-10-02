/**
 * Server-side admin data helpers.
 *
 * These live in `lib/` inside the admin route group so every page — at any
 * nesting depth — can import them with the same relative path. Keeping them out
 * of the layout avoids a circular import, since the layout calls requireSession.
 */

import { cookies } from 'next/headers';

async function adminRequest(path, { method = 'GET', body, cookie } = {}) {
  const store = await cookies();

  const cookieHeader =
    cookie ||
    [store.get('vl_access') && `vl_access=${store.get('vl_access').value}`,
      store.get('vl_refresh') && `vl_refresh=${store.get('vl_refresh').value}`]
      .filter(Boolean)
      .join('; ');

  const base = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');

  try {
    const response = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Admin data is per-user and must never be cached.
      cache: 'no-store',
      /*
       * Fail fast rather than hanging. Without this, an unreachable API leaves
       * every admin page pending indefinitely, and a stalled render on shared
       * hosting eventually trips the process memory ceiling.
       */
      signal: AbortSignal.timeout(Number(process.env.API_TIMEOUT_MS) || 8000),
    });

    const payload = await response.json().catch(() => ({}));

    return {
      ok: response.ok,
      status: response.status,
      data: payload?.data ?? null,
      meta: payload?.meta ?? null,
      totals: payload?.totals ?? null,
      error: payload?.error ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      meta: null,
      error: { code: 'NETWORK_ERROR', message: error.message },
    };
  }
}

/**
 * Fetch for an admin page.
 *
 * Returns an `isEmpty` flag rather than throwing, so a page renders a useful
 * message instead of Next's error boundary. A 403 in particular should render a
 * permissions notice, not a stack trace.
 */
export async function adminData(path) {
  const result = await adminRequest(path);

  return {
    ...result,
    isEmpty: result.ok && (result.data === null || (Array.isArray(result.data) && result.data.length === 0)),
    meta: result.meta || { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
}

/** One record by id. */
export async function adminRecord(path) {
  const result = await adminRequest(path);
  return { ...result, record: result.data };
}

/** Dashboard metrics. */
export async function getDashboard() {
  const { data } = await adminRequest('/dashboard/summary');
  return data;
}

/**
 * Departments, for select inputs in employee forms.
 *
 * A missing or failed lookup yields an empty list rather than throwing, so an
 * employee form still works when the departments endpoint is unavailable.
 */
export async function getDepartments() {
  const { data } = await adminRequest('/departments');
  return data || [];
}

/** Financial categories, optionally filtered by income/expense. */
export async function getFinancialCategories(type) {
  const { data } = await adminRequest(`/finance/categories${type ? `?type=${type}` : ''}`);
  return data || [];
}

/** Serialise a params object into a query string, dropping empty values. */
export function toQuery(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export { adminRequest };
export default adminData;