/* ---------------------------------------------------------------------------
 * leaderboard.js — where scores are stored
 *
 * Out of the box the leaderboard is per-laptop, exactly as it was before: it
 * lives in this browser's localStorage and nobody else can see it.
 *
 * Fill in ONE of the blocks in CONFIG below to make it global, so a score set
 * on your laptop shows up on your friends' laptops too.
 *
 * Whichever backend is used, every score is ALWAYS written to this browser
 * first. A flaky venue Wi-Fi can therefore never lose a round: an upload that
 * fails is queued and retried the next time the leaderboard is opened.
 *
 *   Leaderboard.submit(name, score, total)  -> Promise
 *   Leaderboard.load()                      -> Promise<{ rows, source, error }>
 *   Leaderboard.isGlobal()  Leaderboard.describe()  Leaderboard.clearLocal()
 * ------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  const CONFIG = {

    /* 'auto' uses whichever block below is filled in, preferring Firestore.
       Force one with 'firestore', 'flow', or 'local'. */
    backend: 'auto',

    /* ---------------------------------------------------------------------
     * The facilitator password for "Clear leaderboard".
     * ---------------------------------------------------------------------
     * READ THIS BEFORE RELYING ON IT. This is a speed bump, not security.
     * The game is a public static page, so anyone who opens view-source or
     * the browser devtools can read the value below in about ten seconds.
     * It stops a participant clearing the board on a whim; it does not stop
     * anyone who actually wants to. A static page cannot keep a secret —
     * only a backend with real sign-in can do that.
     */
    adminPin: '2005',

    /* Whether that password also wipes the SHARED board, or only this
     * laptop's copy.
     *
     * Leave this false unless you have changed the Firestore rules to say
     *
     *     allow delete: if true;
     *
     * ...and understand the trade-off: those rules are the only real gate,
     * so once deletes are allowed, anyone who reads the password out of this
     * file (or just calls the API directly) can wipe the board. The default
     * of false means a reset is a deliberate act in the Firebase console. */
    allowGlobalClear: false,

    /* ---------------------------------------------------------------------
     * OPTION 1 — Firebase Firestore   (recommended: free, no approvals)
     * ---------------------------------------------------------------------
     * Free Spark plan: no credit card, 20,000 writes and 50,000 reads a day,
     * which is far more than a quiz session will ever use.
     *
     *  1. console.firebase.google.com -> Add project (skip Analytics)
     *  2. Build -> Firestore Database -> Create database
     *       - Start in *production* mode, pick any region
     *  3. Firestore -> Rules tab, replace with this, then Publish:
     *
     *       rules_version = '2';
     *       service cloud.firestore {
     *         match /databases/{database}/documents {
     *           match /scores/{doc} {
     *             allow read: if true;
     *             allow create: if true;
     *             allow update, delete: if false;
     *           }
     *         }
     *       }
     *
     *  4. Project settings -> General -> scroll to "Your apps" -> </> (Web)
     *       - register an app, then copy `projectId` and `apiKey` from the
     *         config snippet it shows you
     *  5. Paste those two values below. That is the whole setup.
     *
     * The apiKey is safe to publish — it identifies the project, it does not
     * grant access. The rules above are what actually control access: anyone
     * can add a score and read the board, nobody can edit or delete one.
     */
    firestore: {
      projectId: '',
      apiKey: '',
      collection: 'scores'
    },

    /* ---------------------------------------------------------------------
     * OPTION 2 — any HTTP endpoint  (use this for SharePoint / Teams)
     * ---------------------------------------------------------------------
     * postUrl receives   POST { id, name, score, total, pct, at }
     * getUrl must return an array of those same objects (or { value: [...] },
     * which is what the SharePoint and Graph APIs return).
     *
     * To point this at a SharePoint list via Power Automate:
     *
     *  1. New flow -> "When an HTTP request is received"  (premium trigger —
     *     check your licence first)
     *  2. Request Body JSON Schema:
     *       { "type": "object", "properties": {
     *           "id":    { "type": "string" },
     *           "name":  { "type": "string" },
     *           "score": { "type": "integer" },
     *           "total": { "type": "integer" },
     *           "pct":   { "type": "integer" },
     *           "at":    { "type": "integer" } } }
     *  3. Add "SharePoint -> Create item", map the fields to your list columns
     *  4. Save, then copy the generated POST URL into postUrl below
     *  5. Build a second flow the same way that does "Get items" and returns
     *     them with "Response", and put its URL into getUrl
     *
     * Set the flow's Response action to send these headers, or the browser
     * will block the reply:
     *       Access-Control-Allow-Origin: *
     *
     * A Teams incoming webhook can go in postUrl on its own, but there is no
     * way to read messages back out, so the leaderboard will stay local.
     */
    flow: {
      postUrl: '',
      getUrl: ''
    },

    maxRows: 50,
    timeoutMs: 8000
  };

  const STORE_SCORES = 'ups-scan-solve.scores';
  const STORE_PENDING = 'ups-scan-solve.pending';

  /* ---- this browser's copy --------------------------------------------- */

  function readList(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key));
      return Array.isArray(raw) ? raw : [];
    } catch (err) {
      return [];
    }
  }

  function writeList(key, rows) {
    try {
      localStorage.setItem(key, JSON.stringify(rows));
    } catch (err) {
      /* private browsing or a full quota — the round still finished fine */
    }
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function makeEntry(name, score, total) {
    return {
      id: newId(),
      name: String(name || 'Anonymous').slice(0, 28),
      score: score,
      total: total,
      pct: Math.round((score / total) * 100),
      at: Date.now()
    };
  }

  // Highest percentage first, then raw score, then whoever got there first.
  // Rows arrive from a shared store, so drop anything malformed and de-dupe
  // by id in case a queued upload was retried after it had in fact landed.
  function rankRows(rows) {
    const seen = Object.create(null);
    return rows
      .filter(r => r && r.total > 0 && r.score >= 0)
      .filter(r => {
        if (!r.id) return true;
        if (seen[r.id]) return false;
        seen[r.id] = true;
        return true;
      })
      .sort((a, b) => (b.pct - a.pct) || (b.score - a.score) || (a.at - b.at))
      .slice(0, CONFIG.maxRows);
  }

  // Flag the rounds that were played on this laptop, so you can pick yourself
  // out of a board other people have been adding to.
  function markMine(rows) {
    const mine = Object.create(null);
    readList(STORE_SCORES).forEach(r => { if (r.id) mine[r.id] = true; });
    rows.forEach(r => { r.mine = !!(r.id && mine[r.id]); });
    return rows;
  }

  /* ---- fetch with a deadline ------------------------------------------- */

  function request(url, options) {
    const opts = Object.assign({}, options);
    if (typeof AbortController !== 'function') return fetch(url, opts);

    const ctrl = new AbortController();
    opts.signal = ctrl.signal;
    const timer = setTimeout(() => ctrl.abort(), CONFIG.timeoutMs);
    return fetch(url, opts).then(
      res => { clearTimeout(timer); return res; },
      err => { clearTimeout(timer); throw err; }
    );
  }

  /* ---- backend: Firestore REST ----------------------------------------- */

  const firestore = {
    ready() {
      return !!(CONFIG.firestore.projectId && CONFIG.firestore.apiKey);
    },

    base() {
      const f = CONFIG.firestore;
      return 'https://firestore.googleapis.com/v1/projects/' +
             encodeURIComponent(f.projectId) + '/databases/(default)/documents/' +
             encodeURIComponent(f.collection || 'scores');
    },

    key() {
      return 'key=' + encodeURIComponent(CONFIG.firestore.apiKey);
    },

    // Firestore wants every value tagged with its type, and integers as
    // strings so 64-bit values survive JSON.
    toDocument(entry) {
      return {
        fields: {
          id:    { stringValue: entry.id },
          name:  { stringValue: entry.name },
          score: { integerValue: String(entry.score) },
          total: { integerValue: String(entry.total) },
          pct:   { integerValue: String(entry.pct) },
          at:    { integerValue: String(entry.at) }
        }
      };
    },

    fromDocument(doc) {
      const fields = (doc && doc.fields) || {};
      const val = name => {
        const v = fields[name];
        if (!v) return null;
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.integerValue !== undefined) return Number(v.integerValue);
        if (v.doubleValue !== undefined) return Number(v.doubleValue);
        return null;
      };
      return {
        id: val('id'),
        name: val('name') || 'Anonymous',
        score: Number(val('score')) || 0,
        total: Number(val('total')) || 0,
        pct: Number(val('pct')) || 0,
        at: Number(val('at')) || 0
      };
    },

    submit(entry) {
      return request(firestore.base() + '?' + firestore.key(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firestore.toDocument(entry))
      }).then(res => {
        if (!res.ok) throw new Error('Firestore rejected the score (' + res.status + ')');
      });
    },

    // Ordered by time, not by score: a single-field sort uses the index
    // Firestore creates automatically, so there is nothing extra to set up.
    // The ranking itself happens in rankRows().
    load() {
      const url = firestore.base() + '?' + firestore.key() +
                  '&pageSize=300&orderBy=' + encodeURIComponent('at desc');
      return request(url).then(res => {
        if (!res.ok) throw new Error('Firestore refused the read (' + res.status + ')');
        return res.json();
      }).then(data => (data.documents || []).map(firestore.fromDocument));
    },

    // Firestore has no "delete a whole collection" call, so the rounds are
    // removed one at a time. Sequentially, not in parallel: a session board is
    // a few dozen rows, and 300 simultaneous DELETEs would just get throttled.
    clearAll() {
      return request(firestore.base() + '?' + firestore.key() + '&pageSize=300')
        .then(res => {
          if (!res.ok) throw new Error('Could not list the rounds (' + res.status + ')');
          return res.json();
        })
        .then(data => {
          const docs = data.documents || [];
          return docs.reduce((chain, doc) => chain.then(() =>
            request('https://firestore.googleapis.com/v1/' + doc.name + '?' + firestore.key(),
                    { method: 'DELETE' })
              .then(res => {
                // 403 here almost always means the rules still say
                // `allow delete: if false`.
                if (!res.ok) throw new Error('The backend refused the delete (' + res.status + ')');
              })
          ), Promise.resolve()).then(() => docs.length);
        });
    }
  };

  /* ---- backend: plain HTTP endpoint (Power Automate, Apps Script, …) ---- */

  const flow = {
    ready() {
      return !!CONFIG.flow.postUrl;
    },

    submit(entry) {
      return request(CONFIG.flow.postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      }).then(res => {
        if (!res.ok) throw new Error('The endpoint rejected the score (' + res.status + ')');
      });
    },

    load() {
      if (!CONFIG.flow.getUrl) {
        return Promise.reject(new Error('No read URL is configured for this endpoint'));
      }
      return request(CONFIG.flow.getUrl).then(res => {
        if (!res.ok) throw new Error('The endpoint refused the read (' + res.status + ')');
        return res.json();
      }).then(data => {
        // Accept a bare array, or the { value: [...] } shape SharePoint uses.
        const rows = Array.isArray(data) ? data : (data.value || data.rows || []);
        return rows.map(r => ({
          id: r.id || r.Id || null,
          name: r.name || r.Title || 'Anonymous',
          score: Number(r.score || r.Score || 0),
          total: Number(r.total || r.Total || 0),
          pct: Number(r.pct || r.Pct || 0),
          at: Number(r.at || r.At) || Date.parse(r.Created || '') || 0
        }));
      });
    }
  };

  /* ---- pick one -------------------------------------------------------- */

  function chooseBackend() {
    switch (CONFIG.backend) {
      case 'local':     return null;
      case 'firestore': return firestore.ready() ? firestore : null;
      case 'flow':      return flow.ready() ? flow : null;
      default:
        if (firestore.ready()) return firestore;
        if (flow.ready()) return flow;
        return null;
    }
  }

  const remote = chooseBackend();
  let lastSource = remote ? 'global' : 'local';
  let lastError = '';

  /* ---- retry queue ----------------------------------------------------- */

  function queue(entry) {
    const pending = readList(STORE_PENDING);
    if (pending.some(p => p.id === entry.id)) return;
    writeList(STORE_PENDING, pending.concat([entry]).slice(-40));
  }

  // Uploads are retried one at a time and in order, so a backend that is
  // simply slow does not get hit with forty parallel writes.
  function flushPending() {
    const pending = readList(STORE_PENDING);
    if (!remote || !pending.length) return Promise.resolve(0);

    let sent = 0;
    return pending.reduce((chain, entry) => chain.then(() =>
      remote.submit(entry).then(
        () => {
          sent++;
          writeList(STORE_PENDING, readList(STORE_PENDING).filter(p => p.id !== entry.id));
        },
        () => { /* still unreachable — leave it queued for next time */ }
      )
    ), Promise.resolve()).then(() => sent);
  }

  function verifyPin(value) {
    const expected = String(CONFIG.adminPin || '');
    if (!expected) return true;              // no password configured
    return String(value == null ? '' : value).trim() === expected;
  }

  function canClearGlobal() {
    return !!(remote && CONFIG.allowGlobalClear && remote.clearAll);
  }

  function clearGlobal() {
    if (!remote) return Promise.resolve(0);
    if (!CONFIG.allowGlobalClear) {
      return Promise.reject(new Error('Clearing the shared board is switched off in leaderboard.js'));
    }
    if (!remote.clearAll) {
      return Promise.reject(new Error('This backend cannot be cleared from the page — clear it at the source'));
    }
    return remote.clearAll();
  }

  /* A browser reports a blocked or unreachable host as a bare "Failed to
   * fetch", and a timeout as an AbortError. Neither is worth putting on a
   * projector, so say something a facilitator can act on instead. */
  function friendlyError(err) {
    const raw = (err && err.message) || '';
    if (err && err.name === 'AbortError') return 'Shared leaderboard timed out';
    if (/failed to fetch|networkerror|load failed/i.test(raw)) {
      return 'No connection to the shared leaderboard';
    }
    return raw || 'Could not reach the shared leaderboard';
  }

  /* ---- public API ------------------------------------------------------ */

  function submit(name, score, total) {
    if (!total) return Promise.resolve({ saved: false, uploaded: false });

    const entry = makeEntry(name, score, total);
    writeList(STORE_SCORES, rankRows(readList(STORE_SCORES).concat([entry])));

    if (!remote) return Promise.resolve({ saved: true, uploaded: false });

    return remote.submit(entry).then(
      () => ({ saved: true, uploaded: true }),
      err => {
        queue(entry);
        return { saved: true, uploaded: false, error: err.message };
      }
    );
  }

  function load() {
    if (!remote) {
      lastSource = 'local';
      lastError = '';
      return Promise.resolve({ rows: markMine(rankRows(readList(STORE_SCORES))), source: 'local', error: '' });
    }

    return flushPending()
      .then(() => remote.load())
      .then(rows => {
        lastSource = 'global';
        lastError = '';
        return { rows: markMine(rankRows(rows)), source: 'global', error: '' };
      })
      .catch(err => {
        lastSource = 'local';
        lastError = friendlyError(err);
        return { rows: markMine(rankRows(readList(STORE_SCORES))), source: 'local', error: lastError };
      });
  }

  function clearLocal() {
    writeList(STORE_SCORES, []);
    writeList(STORE_PENDING, []);
  }

  function describe(source) {
    const which = source || lastSource;
    if (which === 'global') return 'Shared by everyone playing — refresh to pull in new rounds';
    if (remote) return (lastError || 'Shared leaderboard unreachable') + ' · showing this laptop only';
    return 'Saved on this laptop only';
  }

  global.Leaderboard = {
    submit: submit,
    load: load,
    clearLocal: clearLocal,
    clearGlobal: clearGlobal,
    canClearGlobal: canClearGlobal,
    verifyPin: verifyPin,
    describe: describe,
    isGlobal: function () { return !!remote; },
    pendingCount: function () { return readList(STORE_PENDING).length; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
