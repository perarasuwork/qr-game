/* ---------------------------------------------------------------------------
 * app.js — UPS Scan & Solve
 *
 * Two roles run from this one page:
 *
 *   MAIN SCREEN (laptop / projector)  shows the QR code and the answer options
 *   PHONE VIEW  (opened by scanning)  shows the question text
 *
 * The phone view activates when the URL carries a "#q=..." payload, which is
 * what the QR code points at when the page is served over http(s).
 *
 * When the page is opened straight off disk (file://) there is no address a
 * phone could reach, so the QR carries the question text itself instead. Phone
 * cameras display raw text from a QR, so the game still works with no server
 * and no internet — see readDeliveryMode() below.
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  const STORE_PREFS = 'ups-scan-solve.prefs';

  /* ---- small helpers --------------------------------------------------- */

  const $ = id => document.getElementById(id);
  const screens = ['home', 'quiz', 'results', 'leaderboard', 'phone'];

  function show(name) {
    screens.forEach(s => { $('screen-' + s).hidden = (s !== name); });
    window.scrollTo(0, 0);
  }

  function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---- URL-safe base64 for the phone payload --------------------------- */

  function encodePayload(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodePayload(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  /* =====================================================================
   * PHONE VIEW
   * ===================================================================== */

  function tryPhoneView() {
    const hash = window.location.hash || '';
    if (hash.indexOf('#q=') !== 0) return false;

    let data;
    try {
      data = decodePayload(hash.slice(3));
    } catch (err) {
      return false;
    }

    $('phone-question').textContent = data.q || '';
    $('phone-category').textContent = data.c || 'Question';
    $('phone-qnum').textContent = data.n ? 'Question ' + data.n : '';
    document.title = (data.c ? data.c + ' — ' : '') + 'UPS Scan & Solve';
    show('phone');
    return true;
  }

  /* =====================================================================
   * PREFERENCES
   * ===================================================================== */

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORE_PREFS)) || {};
    } catch (err) {
      return {};
    }
  }

  function savePrefs(prefs) {
    try {
      localStorage.setItem(STORE_PREFS, JSON.stringify(prefs));
    } catch (err) {
      /* private browsing — settings simply will not persist */
    }
  }

  /* ---- how the question reaches the phone ------------------------------
   * 'url'  : QR points at this page with the question in the hash. The phone
   *          opens a proper styled page. Requires the page to be reachable
   *          from the phone (hosted, or served from this laptop over the LAN).
   * 'text' : QR carries the question text. The phone's camera app shows the
   *          text directly. Works with no server at all.
   */
  function readDeliveryMode() {
    const proto = window.location.protocol;
    if (proto === 'http:' || proto === 'https:') {
      const host = window.location.hostname;
      // localhost is not reachable from the participant's phone.
      if (host !== 'localhost' && host !== '127.0.0.1' && host !== '') return 'url';
    }
    return 'text';
  }

  function baseUrl() {
    return window.location.href.split('#')[0];
  }

  function describeDelivery(mode) {
    if (mode === 'url') {
      return 'Phones will open a full question page from <b>' + window.location.host +
             '</b> when they scan. Make sure phones can reach that address.';
    }
    return 'Running with no server, so each QR code carries the question text &mdash; ' +
           'phone cameras show it straight away. Host these files on a web address ' +
           '(or serve them from this laptop over Wi-Fi) to get the full styled question page instead.';
  }

  /* =====================================================================
   * GAME STATE
   * ===================================================================== */

  const state = {
    player: '',
    round: [],        // [{ q, options, answerIndex }]
    current: 0,
    answers: [],      // [{ chosen, correct, timedOut }]
    score: 0,
    timerId: null,
    deadline: 0,
    perQuestion: 45,
    locked: false,
    deliveryMode: 'text'
  };

  function buildRound(count, shuffleOrder) {
    let pool = shuffleOrder ? shuffled(QUESTIONS) : QUESTIONS.slice();

    if (count > 0 && count < pool.length) {
      if (shuffleOrder) {
        // Spread the selection evenly across categories so a short round
        // still touches every topic.
        const byCat = {};
        CATEGORIES.forEach(c => { byCat[c] = []; });
        pool.forEach(q => { if (byCat[q.category]) byCat[q.category].push(q); });

        const picked = [];
        let added = true;
        while (picked.length < count && added) {
          added = false;
          for (const c of CATEGORIES) {
            if (picked.length >= count) break;
            if (byCat[c].length) { picked.push(byCat[c].shift()); added = true; }
          }
        }
        pool = shuffled(picked);
      } else {
        pool = pool.slice(0, count);
      }
    }

    // Options are always shuffled: the question bank lists the correct answer
    // first for easy editing, so a fixed order would give the game away.
    return pool.map(q => {
      const order = shuffled(q.options.map((text, i) => ({ text, isAnswer: i === q.answer })));
      return {
        q: q,
        options: order.map(o => o.text),
        answerIndex: order.findIndex(o => o.isAnswer)
      };
    });
  }

  /* =====================================================================
   * QUIZ RENDERING
   * ===================================================================== */

  function qrPayloadFor(item, number) {
    if (state.deliveryMode === 'url') {
      return baseUrl() + '#q=' + encodePayload({ n: number, c: item.q.category, q: item.q.question });
    }
    return 'Q' + number + ' • ' + item.q.category + '\n' + item.q.question;
  }

  function renderQuestion() {
    const item = state.round[state.current];
    const number = state.current + 1;
    state.locked = false;

    $('q-index').textContent = number;
    $('q-total').textContent = state.round.length;
    $('q-category').textContent = item.q.category;
    $('q-score').textContent = state.score;

    // QR code
    try {
      QRCodeGen.toCanvas($('qr-canvas'), qrPayloadFor(item, number), {
        sizePx: 340, quiet: 3, dark: '#1d120a', light: '#ffffff'
      });
    } catch (err) {
      // Only reachable if a question is long enough to exceed QR capacity.
      revealQuestion();
    }

    // Reset the fallback reveal
    $('revealed-question').hidden = true;
    $('revealed-question').textContent = '';
    $('btn-reveal').hidden = false;

    // Options
    const box = $('options');
    box.innerHTML = '';
    item.options.forEach((text, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.dataset.index = String(i);

      const letter = document.createElement('span');
      letter.className = 'option-letter';
      letter.textContent = 'ABCD'[i];

      const label = document.createElement('span');
      label.className = 'option-text';
      label.textContent = text;

      btn.append(letter, label);
      btn.addEventListener('click', () => choose(i));
      box.appendChild(btn);
    });

    $('feedback').hidden = true;
    startTimer();
  }

  function revealQuestion() {
    const item = state.round[state.current];
    const box = $('revealed-question');
    box.textContent = item.q.question;
    box.hidden = false;
    $('btn-reveal').hidden = true;
  }

  /* ---- timer ----------------------------------------------------------- */

  function startTimer() {
    stopTimer();
    const secs = state.perQuestion;
    const pill = $('timer-pill');
    const track = $('timer-track');
    const fill = $('timer-fill');

    if (!secs) {
      pill.hidden = true;
      track.hidden = true;
      return;
    }

    pill.hidden = false;
    track.hidden = false;
    pill.classList.remove('urgent');
    fill.classList.remove('urgent');
    fill.style.width = '100%';
    $('timer-secs').textContent = secs;

    state.deadline = Date.now() + secs * 1000;
    state.timerId = setInterval(() => {
      const left = Math.max(0, state.deadline - Date.now());
      const ratio = left / (secs * 1000);
      fill.style.width = (ratio * 100).toFixed(1) + '%';
      $('timer-secs').textContent = Math.ceil(left / 1000);

      const urgent = left <= 10000;
      pill.classList.toggle('urgent', urgent);
      fill.classList.toggle('urgent', urgent);

      if (left <= 0) {
        stopTimer();
        choose(-1);
      }
    }, 100);
  }

  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  /* ---- answering ------------------------------------------------------- */

  function choose(index) {
    if (state.locked) return;
    state.locked = true;
    stopTimer();

    const item = state.round[state.current];
    const timedOut = index < 0;
    const correct = !timedOut && index === item.answerIndex;

    if (correct) state.score++;
    state.answers.push({ chosen: index, correct: correct, timedOut: timedOut });
    $('q-score').textContent = state.score;

    // Mark up the option buttons
    Array.from($('options').children).forEach(btn => {
      const i = Number(btn.dataset.index);
      btn.disabled = true;
      if (i === item.answerIndex) btn.classList.add('correct');
      else if (i === index) btn.classList.add('wrong');
      else btn.classList.add('muted');
    });

    // The question is no longer a secret, so put it on the big screen for the
    // debrief regardless of whether anyone managed to scan it.
    revealQuestion();

    const head = $('feedback-head');
    head.textContent = timedOut ? 'Time’s up' : (correct ? 'Correct' : 'Not quite');
    head.className = 'feedback-head ' + (correct ? 'good' : 'bad');
    $('feedback-body').textContent = item.q.explain;

    const isLast = state.current === state.round.length - 1;
    $('btn-next').innerHTML = (isLast ? 'See results' : 'Next question') +
      ' <span class="kbd">Enter</span>';
    $('feedback').hidden = false;
    $('btn-next').focus({ preventScroll: true });
  }

  function next() {
    if (!state.locked) return;
    if (state.current === state.round.length - 1) {
      finish();
    } else {
      state.current++;
      renderQuestion();
    }
  }

  /* =====================================================================
   * RESULTS
   * ===================================================================== */

  function verdictFor(pct) {
    if (pct === 100) return 'Flawless — you know the operation inside out';
    if (pct >= 80) return 'Strong operational knowledge';
    if (pct >= 60) return 'Solid foundation, a few gaps to close';
    if (pct >= 40) return 'Getting there — worth a second run';
    return 'Plenty to pick up here — give it another go';
  }

  function finish() {
    stopTimer();
    const total = state.round.length;
    const pct = total ? Math.round((state.score / total) * 100) : 0;

    $('results-for').textContent = state.player || 'Your round';
    $('results-correct').textContent = state.score;
    $('results-total').textContent = total;
    $('results-verdict').textContent = verdictFor(pct);

    // Per-category breakdown
    const tally = {};
    state.round.forEach((item, i) => {
      const c = item.q.category;
      if (!tally[c]) tally[c] = { got: 0, of: 0 };
      tally[c].of++;
      if (state.answers[i] && state.answers[i].correct) tally[c].got++;
    });

    const bd = $('breakdown-rows');
    bd.innerHTML = '';
    CATEGORIES.filter(c => tally[c]).forEach(c => {
      const t = tally[c];
      const row = document.createElement('div');
      row.className = 'bd-row';

      const left = document.createElement('div');
      const label = document.createElement('div');
      label.className = 'bd-label';
      label.textContent = c;
      const track = document.createElement('div');
      track.className = 'bd-track';
      const fill = document.createElement('div');
      fill.className = 'bd-fill';
      fill.style.width = Math.round((t.got / t.of) * 100) + '%';
      track.appendChild(fill);
      left.append(label, track);

      const count = document.createElement('div');
      count.className = 'bd-count';
      count.textContent = t.got + '/' + t.of;

      row.append(left, count);
      bd.appendChild(row);
    });

    // Question-by-question review
    const rv = $('review-rows');
    rv.innerHTML = '';
    state.round.forEach((item, i) => {
      const ans = state.answers[i] || { chosen: -1, correct: false, timedOut: true };
      const row = document.createElement('div');
      row.className = 'rv-row';

      const mark = document.createElement('div');
      mark.className = 'rv-mark ' + (ans.correct ? 'good' : 'bad');
      mark.textContent = ans.correct ? '✓' : '✗';

      const body = document.createElement('div');
      body.className = 'rv-body';

      const cat = document.createElement('div');
      cat.className = 'rv-cat';
      cat.textContent = item.q.category;

      const q = document.createElement('p');
      q.className = 'rv-q';
      q.textContent = item.q.question;

      const a = document.createElement('p');
      a.className = 'rv-a';
      if (ans.correct) {
        const ok = document.createElement('span');
        ok.className = 'rv-ok';
        ok.textContent = item.options[item.answerIndex];
        a.appendChild(ok);
      } else {
        if (ans.timedOut || ans.chosen < 0) {
          a.append(document.createTextNode('No answer given · '));
        } else {
          const no = document.createElement('span');
          no.className = 'rv-no';
          no.textContent = item.options[ans.chosen];
          a.append(no, document.createTextNode(' · '));
        }
        const ok = document.createElement('span');
        ok.className = 'rv-ok';
        ok.textContent = item.options[item.answerIndex];
        a.appendChild(ok);
      }

      body.append(cat, q, a);
      row.append(mark, body);
      rv.appendChild(row);
    });

    // Uploading is deliberately not awaited: the results screen should never
    // wait on the network. A failed upload is queued and retried later.
    Leaderboard.submit(state.player, state.score, total);
    show('results');
  }

  /* =====================================================================
   * LEADERBOARD
   * ===================================================================== */

  /* Storage lives in leaderboard.js, which decides on its own whether scores
   * go to a shared backend or stay on this laptop. See the config block at the
   * top of that file. */

  function renderRows(rows) {
    const body = $('lb-body');
    body.innerHTML = '';
    $('lb-empty').hidden = rows.length > 0;

    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      // Your own rounds are highlighted, so you can find yourself in a board
      // that other people have also been adding to.
      tr.className = (i === 0 ? 'is-top ' : '') + (r.mine ? 'is-mine' : '');

      const rank = document.createElement('td');
      rank.className = 'lb-rank';
      rank.textContent = String(i + 1);

      const name = document.createElement('td');
      name.textContent = r.name;

      const score = document.createElement('td');
      score.className = 'lb-score';
      score.textContent = r.score + '/' + r.total;

      const pct = document.createElement('td');
      pct.textContent = r.pct + '%';

      const when = document.createElement('td');
      when.className = 'lb-when';
      when.textContent = new Date(r.at).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      tr.append(rank, name, score, pct, when);
      body.appendChild(tr);
    });
  }

  /* `note`, when given, replaces the usual status line once the rows have
   * loaded — used to report the result of a clear. It is type-checked because
   * this doubles as a click handler, which would otherwise pass an Event. */
  function renderLeaderboard(note) {
    const message = typeof note === 'string' ? note : '';
    const status = $('lb-status');

    closeAdminGate();
    $('btn-lb-refresh').hidden = !Leaderboard.isGlobal();
    status.className = 'tagline lb-status';
    status.textContent = Leaderboard.isGlobal()
      ? 'Fetching everyone’s scores…'
      : Leaderboard.describe();
    show('leaderboard');

    Leaderboard.load().then(result => {
      renderRows(result.rows);
      status.textContent = message || Leaderboard.describe(result.source);
      status.className = 'tagline lb-status' + (result.error && !message ? ' warn' : '');
    });
  }

  /* ---- clearing, behind the facilitator password ----------------------- */

  function gateMessage(text, good) {
    const msg = $('admin-gate-msg');
    msg.textContent = text || '';
    msg.className = 'admin-gate-msg' + (good ? ' good' : '');
    msg.hidden = !text;
  }

  function openAdminGate() {
    const gate = $('admin-gate');
    $('admin-gate-title').textContent = Leaderboard.canClearGlobal()
      ? 'Password required — this clears the board for everyone'
      : 'Password required — this clears this laptop’s copy';
    gateMessage('');
    $('admin-pin').value = '';
    gate.hidden = false;
    $('btn-lb-clear').hidden = true;
    $('admin-pin').focus();
  }

  function closeAdminGate() {
    $('admin-gate').hidden = true;
    $('admin-pin').value = '';
    gateMessage('');
    $('btn-lb-clear').hidden = false;
  }

  function submitAdminGate() {
    if (!Leaderboard.verifyPin($('admin-pin').value)) {
      gateMessage('That password is not right.');
      $('admin-pin').select();
      return;
    }

    const go = $('btn-admin-go');
    go.disabled = true;

    // Wiping the shared board is a lot of sequential deletes, so say something
    // while it runs rather than leaving a dead button.
    if (Leaderboard.canClearGlobal()) {
      gateMessage('Clearing the shared board…', true);
      Leaderboard.clearGlobal().then(
        count => {
          Leaderboard.clearLocal();
          go.disabled = false;
          renderLeaderboard('Shared board cleared — ' + count +
            (count === 1 ? ' round removed' : ' rounds removed'));
        },
        err => {
          go.disabled = false;
          gateMessage(err.message || 'Could not clear the shared board.');
        }
      );
      return;
    }

    Leaderboard.clearLocal();
    go.disabled = false;
    renderLeaderboard('This laptop’s copy has been cleared');
  }

  /* =====================================================================
   * WIRING
   * ===================================================================== */

  function startRound() {
    const count = Number($('set-count').value);
    const timer = Number($('set-timer').value);
    const shuffleOrder = $('set-shuffle').value === '1';

    savePrefs({ count: count, timer: timer, shuffle: shuffleOrder ? 1 : 0 });

    state.player = $('player-name').value.trim();
    state.perQuestion = timer;
    state.deliveryMode = readDeliveryMode();
    state.round = buildRound(count, shuffleOrder);
    state.current = 0;
    state.answers = [];
    state.score = 0;

    if (!state.round.length) return;
    show('quiz');
    renderQuestion();
  }

  function goHome() {
    stopTimer();
    show('home');
  }

  function init() {
    if (tryPhoneView()) return;

    // Restore facilitator settings. A stored value is ignored unless the
    // dropdown still offers it, so editing the question bank cannot leave a
    // select showing a blank choice.
    const prefs = loadPrefs();
    const restore = (id, value) => {
      if (value == null) return;
      const select = $(id);
      const wanted = String(value);
      if (Array.from(select.options).some(o => o.value === wanted)) select.value = wanted;
    };
    restore('set-count', prefs.count);
    restore('set-timer', prefs.timer);
    restore('set-shuffle', prefs.shuffle);

    state.deliveryMode = readDeliveryMode();
    $('delivery-note').innerHTML = describeDelivery(state.deliveryMode);

    $('btn-start').addEventListener('click', startRound);
    $('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') startRound(); });

    $('btn-reveal').addEventListener('click', revealQuestion);
    $('btn-next').addEventListener('click', next);
    $('btn-quit').addEventListener('click', () => {
      stopTimer();
      // Score only what was actually attempted.
      if (state.answers.length) {
        state.round = state.round.slice(0, state.answers.length);
        finish();
      } else {
        goHome();
      }
    });

    $('btn-again').addEventListener('click', startRound);
    $('btn-newteam').addEventListener('click', () => {
      $('player-name').value = '';
      goHome();
      $('player-name').focus();
    });
    $('btn-leaderboard').addEventListener('click', renderLeaderboard);
    $('btn-leaderboard-home').addEventListener('click', renderLeaderboard);
    $('btn-lb-back').addEventListener('click', goHome);
    $('btn-lb-refresh').addEventListener('click', renderLeaderboard);

    // Clearing sits behind the facilitator password in leaderboard.js.
    const clearBtn = $('btn-lb-clear');
    if (Leaderboard.isGlobal() && !Leaderboard.canClearGlobal()) {
      clearBtn.textContent = 'Clear this laptop’s copy';
    }
    clearBtn.addEventListener('click', openAdminGate);
    $('btn-admin-cancel').addEventListener('click', closeAdminGate);
    $('admin-gate').addEventListener('submit', e => {
      e.preventDefault();
      submitAdminGate();
    });

    // Keyboard control for the facilitator: A-D or 1-4 to answer, Enter to
    // advance, R to reveal the question on the main screen.
    document.addEventListener('keydown', e => {
      if ($('screen-quiz').hidden) return;
      if (e.target instanceof HTMLInputElement) return;

      const key = e.key.toLowerCase();

      if (!state.locked) {
        const byLetter = 'abcd'.indexOf(key);
        const byNumber = '1234'.indexOf(key);
        const pick = byLetter >= 0 ? byLetter : byNumber;
        if (pick >= 0 && pick < state.round[state.current].options.length) {
          e.preventDefault();
          choose(pick);
          return;
        }
        if (key === 'r') { e.preventDefault(); revealQuestion(); return; }
      }

      if (state.locked && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      }
    });

    show('home');
    $('player-name').focus();
  }

  // Re-check the hash if the phone view is opened by navigating within the tab.
  window.addEventListener('hashchange', () => {
    if (!tryPhoneView() && (window.location.hash === '' || window.location.hash === '#')) {
      show('home');
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
