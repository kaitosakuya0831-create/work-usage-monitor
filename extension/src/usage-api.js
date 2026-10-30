/* A narrow read-only adapter for ChatGPT's own quota data.
 * No third-party extension, telemetry, token persistence, or message inspection.
 * ChatGPT Web endpoints are private and may change without warning.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkRingUsageAPI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
  const round = n => Math.round(n * 10) / 10;
  const percent = raw => {
    if (raw === undefined || raw === null || raw === '' || typeof raw === 'boolean') return null;
    const n = Number(raw); return valid(n) ? n : null;
  };
  function resetMs(win, now) {
    const direct = win.reset_at ?? win.resets_at ?? win.resetAt;
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct < 1e12 ? direct * 1000 : direct;
    if (typeof direct === 'string') { const d = Date.parse(direct); if (Number.isFinite(d)) return d; }
    if (Number.isFinite(win.reset_time_ms)) return win.reset_time_ms;
    if (Number.isFinite(win.reset_after_seconds)) return now + win.reset_after_seconds * 1000;
    return null;
  }
  function classify(win, key) {
    const seconds = Number(win.limit_window_seconds ?? (Number.isFinite(win.window_duration_mins) ? win.window_duration_mins * 60 : NaN));
    if (Number.isFinite(seconds) && seconds > 0) {
      if (seconds >= 25 * 86400) return 'month';
      if (seconds >= 2 * 86400) return 'week';
      if (seconds >= 2 * 3600 && seconds < 2 * 86400) return 'five';
      return null; // Do not silently mistake short model-specific limits for 5h.
    }
    if (/five[_-]?hour|5[_-]?hour|5h/i.test(key)) return 'five';
    if (/week/i.test(key)) return 'week';
    if (/month/i.test(key)) return 'month';
    return null; // primary/secondary without a duration are ambiguous.
  }
  function parseUsage(payload, now = Date.now()) {
    if (!payload || typeof payload !== 'object') return {};
    const limit = payload.rate_limit ?? payload.rate_limits;
    if (!limit || typeof limit !== 'object') return {};
    const out = {};
    for (const [key, win] of Object.entries(limit)) {
      if (!win || typeof win !== 'object' || Array.isArray(win)) continue;
      const kind = classify(win, key);
      if (!kind || out[kind]) continue;
      const used = percent(win.used_percent);
      const left = percent(win.percent_left);
      const remaining = used !== null ? round(100 - used) : left !== null ? round(left) : null;
      if (remaining === null) continue;
      out[kind] = { remaining, resetMs: resetMs(win, now) };
    }
    return out;
  }
  function accountIdFromSession(session, cookieString = '') {
    // Never use a user ID as an account ID: they are different identities.
    const id = session?.accountId ?? session?.account_id ?? session?.account?.id;
    if (typeof id === 'string' && /^[\w-]{5,120}$/.test(id)) return id;
    // _account cookie is an account selector on some ChatGPT Web releases.
    const cookie = cookieString.split(';').map(s => s.trim()).find(s => s.startsWith('_account='));
    if (cookie) { try { const v = decodeURIComponent(cookie.slice('_account='.length)); if (/^[\w-]{5,120}$/.test(v)) return v; } catch {} }
    return '';
  }
  function errorMsg(status) {
    if (status === 401) return 'ログイン状態を確認してね（401）';
    if (status === 403) return '使用量の取得が拒否されたよ（403）';
    if (status === 429) return 'アクセス制限中。少し間隔を空けるね（429）';
    return `取得できなかったよ（HTTP ${status}）`;
  }
  async function fetchUsage(fetchFn, origin, cookie = '', signal) {
    // Access token exists only within the function's temporary scope.
    const sessionResponse = await fetchFn(`${origin}/api/auth/session`, {
      method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json' }, signal
    });
    if (!sessionResponse.ok) throw new Error(errorMsg(sessionResponse.status));
    const session = await sessionResponse.json();
    if (session?.error || typeof session?.accessToken !== 'string' || !session.accessToken) {
      throw new Error('ChatGPTにログインし直してね');
    }
    const headers = { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}` };
    const accountId = accountIdFromSession(session, cookie);
    if (accountId) headers['ChatGPT-Account-Id'] = accountId;
    const response = await fetchFn(`${origin}/backend-api/wham/usage`, {
      method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', headers, signal
    });
    if (!response.ok) throw new Error(errorMsg(response.status));
    const raw = await response.json();
    const data = parseUsage(raw);
    if (!Object.keys(data).length) throw new Error('使用量データの形式が変わったか、利用枠が未提供だよ');
    return data;
  }
  return { parseUsage, resetMs, classify, accountIdFromSession, fetchUsage };
});
