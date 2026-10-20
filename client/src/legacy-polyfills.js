// Runtime APIs the bundle calls that are newer than its Chrome 61 floor.
//
// vite.config.js lowers *syntax* to Chrome 61, but esbuild cannot lower an API
// call — on an Android phone whose System WebView was never updated, a missing
// function throws when it is first used. Each shim below fills exactly one
// gap that a sweep of the built bundle found unguarded, and is a no-op on any
// engine that already has the real thing.

// Chrome 73. DocumentsPage builds its category table with it at module load,
// so without this the whole Documents screen fails to open.
if (!Object.fromEntries) {
  Object.fromEntries = function fromEntries(entries) {
    const out = {}
    for (const [key, value] of entries) out[key] = value
    return out
  }
}

// Chrome 69. Used by react-router's route-module preloading.
if (!Array.prototype.flat) {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, 'flat', {
    configurable: true,
    writable: true,
    value: function flat(depth = 1) {
      const walk = (items, level) => items.reduce((acc, item) => (
        Array.isArray(item) && level > 0 ? acc.concat(walk(item, level - 1)) : acc.concat([item])
      ), [])
      return walk(this, Math.floor(depth) || 0)
    },
  })
}

// Chrome 66. api.js creates one per request for timeouts and cancellation;
// without it, `new AbortController()` throws and every API call fails.
// This stub cannot cancel a real fetch — engines this old ignore `signal` —
// so a timed-out request simply runs to completion instead of being cut off.
// That is a graceful degradation; a thrown constructor is not.
if (typeof window !== 'undefined' && typeof window.AbortController === 'undefined') {
  class AbortSignalShim {
    constructor() {
      this.aborted = false
      this.reason = undefined
      this.onabort = null
      this._listeners = []
    }
    addEventListener(type, fn) { if (type === 'abort') this._listeners.push(fn) }
    removeEventListener(type, fn) {
      if (type === 'abort') this._listeners = this._listeners.filter((l) => l !== fn)
    }
    throwIfAborted() { if (this.aborted) throw this.reason }
  }
  window.AbortController = class AbortController {
    constructor() { this.signal = new AbortSignalShim() }
    abort(reason) {
      const { signal } = this
      if (signal.aborted) return
      signal.aborted = true
      signal.reason = reason
      const event = { type: 'abort', target: signal }
      if (typeof signal.onabort === 'function') signal.onabort(event)
      signal._listeners.forEach((fn) => fn(event))
    }
  }
}
