/* Normalize ONLY fresh first-party automatic usage results, not manual ring values.
   No authentication data, chats, or cookies are included in the snapshot. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkRingQuotaSnapshot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  function fromFreshApi(result, at = Date.now()) {
    if (!finite(at) || !result || typeof result !== 'object') return null;
    const data = {};
    for (const [source, target] of [['five', 'five_hour'], ['week', 'weekly']]) {
      const entry = result[source];
      if (!entry || !finite(entry.remaining) || entry.remaining < 0 || entry.remaining > 100 ||
          !finite(entry.resetMs)) return null;
      // Never extrapolate reset windows from a used percentage or a stale reset time.
      const mins = Math.ceil((entry.resetMs - at) / 60000);
      if (!Number.isInteger(mins) || mins <= 0 || mins > 12 * 24 * 60) return null;
      data[target] = {remaining_percent: Math.round(entry.remaining), reset_minutes: mins};
    }
    return data;
  }
  return {fromFreshApi};
});
