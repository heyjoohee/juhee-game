// 틀린그림찾기 게임
(() => {
  'use strict';

  // ---------- 설정 ----------
  const GENRES = [
    { key: 'travel', ko: '외국', emoji: '✈️' },
    { key: 'food', ko: '음식', emoji: '🍱' },
    { key: 'juhee', ko: '주희', emoji: '🙋‍♀️' },
    { key: 'animal', ko: '동물', emoji: '🐾' },
  ];
  const ALL = { key: 'all', ko: '전체 랜덤', emoji: '🎲' };
  const TIME = { 1: 90, 2: 80, 3: 70, 4: 60, 5: 50 };
  const WRONG_SEC = 3, HINT_SEC = 10;
  const PT_FOUND = 100, PT_SEC = 10, PT_WRONG = 30, PT_NOHINT = 200;
  const BAD_WORDS = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '좆', '지랄', '느금', '니미', '섹스', 'fuck', 'shit', 'sex', 'bitch'];

  // ---------- 유틸 ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800);
  }
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  // ---------- 데이터 ----------
  let PUZZLES = [];
  const genreOf = (ko) => (GENRES.find((g) => g.ko === ko) || {}).key;
  const loadData = fetch('images/answers.json').then((r) => r.json()).then((list) => {
    PUZZLES = list.map((p) => ({ ...p, key: genreOf(p.genre) }));
  });

  // ---------- 닉네임 ----------
  const nickInput = $('#nickInput');
  nickInput.value = store.get('sd-nick', '');
  function checkNick(n) {
    n = (n || '').trim();
    if (n.length < 2 || n.length > 10) return '닉네임은 2~10자로 적어주세요.';
    const flat = n.replace(/\s/g, '').toLowerCase();
    if (BAD_WORDS.some((w) => flat.includes(w))) return '다른 닉네임을 써주세요 🙏';
    return '';
  }
  nickInput.addEventListener('input', () => { $('#nickErr').textContent = ''; });

  // ---------- 화면 전환 ----------
  const history = [];
  function show(id, push = true) {
    const cur = $('.screen.on');
    if (push && cur && cur.id !== id) history.push(cur.id);
    $$('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
    window.scrollTo(0, 0);
  }
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => show(history.pop() || 'home', false)));

  let mode = 'challenge';
  $$('[data-go]').forEach((b) => b.addEventListener('click', async () => {
    const go = b.dataset.go;
    if (go === 'howto') return openHowto();
    if (go === 'rank') { show('rank'); return renderRank(store.get('sd-rank-tab', 'all')); }
    if (go === 'challenge') {
      const err = checkNick(nickInput.value);
      if (err) { $('#nickErr').textContent = err; nickInput.focus(); return; }
      store.set('sd-nick', nickInput.value.trim());
    }
    mode = go;
    await loadData;
    renderGenres();
    show('genre');
  }));

  function genreThumb(key) {
    const list = key === 'all' ? PUZZLES : PUZZLES.filter((p) => p.key === key);
    const p = list.find((x) => x.stars === 1) || list[0];
    return p ? p.original : '';
  }
  function renderGenres() {
    $('#genreTitle').textContent = mode === 'challenge' ? '🏆 어떤 장르로 도전?' : '🎯 연습할 장르';
    const grid = $('#genreGrid'); grid.innerHTML = '';
    GENRES.forEach((g) => {
      const n = PUZZLES.filter((p) => p.key === g.key).length;
      if (!n) return;
      const b = document.createElement('button');
      b.className = 'genre';
      b.innerHTML = `<img alt="" loading="lazy"><span class="lab">${g.emoji} ${g.ko}<small>사진 ${n}장</small></span>`;
      b.querySelector('img').src = genreThumb(g.key);
      b.onclick = () => (mode === 'challenge' ? startChallenge(g.key) : renderPractice(g.key));
      grid.appendChild(b);
    });
    if (mode === 'challenge') {
      const b = document.createElement('button');
      b.className = 'genre wide';
      b.textContent = `${ALL.emoji} ${ALL.ko} (모든 장르 섞기)`;
      b.onclick = () => startChallenge('all');
      grid.appendChild(b);
    }
  }

  function renderPractice(key) {
    const g = GENRES.find((x) => x.key === key);
    $('#practiceTitle').textContent = `${g.emoji} ${g.ko}`;
    const grid = $('#photoGrid'); grid.innerHTML = '';
    const cleared = store.get('sd-cleared', {});
    PUZZLES.filter((p) => p.key === key).sort((a, b) => a.stars - b.stars).forEach((p) => {
      const b = document.createElement('button');
      b.className = 'photo';
      b.innerHTML = `<img alt="" loading="lazy"><span class="st">${'★'.repeat(p.stars)}</span>${cleared[p.id] ? '<span class="done">완료</span>' : ''}`;
      b.querySelector('img').src = p.original;
      b.onclick = () => startPractice(p);
      grid.appendChild(b);
    });
    show('practice');
  }

  // ---------- 게임 진행 ----------
  const G = {
    run: null, // { mode, genre, stages:[], idx, total, results:[] }
    p: null, found: [], wrong: 0, hintUsed: false,
    timeLeft: 0, timeMax: 0, last: 0, raf: 0, active: false, paused: false,
  };

  function buildStages(genre) {
    const pool = genre === 'all' ? PUZZLES : PUZZLES.filter((p) => p.key === genre);
    const used = new Set();
    const out = [];
    for (let s = 1; s <= 5; s++) {
      let c = pool.filter((p) => p.stars === s && !used.has(p.id));
      for (let d = 1; !c.length && d <= 4; d++) c = pool.filter((p) => Math.abs(p.stars - s) === d && !used.has(p.id));
      const p = pick(c.length ? c : pool);
      used.add(p.id); out.push({ ...p, level: s });
    }
    return out;
  }

  function startChallenge(genre) {
    G.run = { mode: 'challenge', genre, stages: buildStages(genre), idx: 0, total: 0, results: [] };
    show('play');
    startStage();
  }
  function startPractice(p) {
    G.run = { mode: 'practice', genre: p.key, stages: [{ ...p, level: p.stars }], idx: 0, total: 0, results: [] };
    show('play');
    startStage();
  }

  const picA = $('#picA'), picB = $('#picB'), board = $('#board');
  const imgA = $('img', picA), imgB = $('img', picB);

  function loadImg(img, src) {
    return new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = src; });
  }

  async function startStage() {
    const run = G.run, p = run.stages[run.idx];
    G.p = p; G.found = []; G.wrong = 0; G.hintUsed = false; G.active = false;
    $$('.layer').forEach((l) => (l.innerHTML = ''));
    resetZoom();
    $('#stageLabel').textContent = run.mode === 'challenge' ? `스테이지 ${run.idx + 1}/5` : p.name;
    $('#starLabel').textContent = '★'.repeat(p.level) + '☆'.repeat(5 - p.level);
    $('#scoreLabel').textContent = run.mode === 'challenge' ? `${run.total}점` : '연습';
    $('#dots').innerHTML = p.diffs.map(() => '<b></b>').join('');
    $('#hintBtn').disabled = false;
    G.timeMax = TIME[p.level] || 60; G.timeLeft = G.timeMax;
    drawTime();
    $('#loading').classList.add('on');
    picA.style.visibility = picB.style.visibility = 'hidden';
    const [okA, okB] = await Promise.all([loadImg(imgA, p.original), loadImg(imgB, p.modified)]);
    $('#loading').classList.remove('on');
    if (!okA || !okB) { toast('사진을 불러오지 못했어요'); return; }
    // 다음 스테이지 미리 불러오기
    const nx = run.stages[run.idx + 1];
    if (nx) { new Image().src = nx.original; new Image().src = nx.modified; }
    picA.style.visibility = picB.style.visibility = 'visible';
    layout();
    G.active = true; G.paused = false; G.last = performance.now();
    cancelAnimationFrame(G.raf); G.raf = requestAnimationFrame(tick);
  }

  // 두 사진을 양옆/위아래 중 더 크게 보이는 쪽으로 배치
  function layout() {
    const p = G.p; if (!p) return;
    const r = board.getBoundingClientRect();
    const gap = 8, padX = 16, padY = 14;
    const W = r.width - padX, H = r.height - padY;
    const side = Math.min((W - gap) / 2 / p.width, H / p.height);
    const stack = Math.min(W / p.width, (H - gap) / 2 / p.height);
    const s = Math.max(side, stack);
    board.classList.toggle('stack', stack > side);
    const w = Math.floor(p.width * s), h = Math.floor(p.height * s);
    for (const pic of [picA, picB]) { pic.style.width = w + 'px'; pic.style.height = h + 'px'; }
    drawMarks();
  }
  window.addEventListener('resize', () => { if ($('#play').classList.contains('on')) layout(); });

  function picScale() { return picA.clientWidth / G.p.width; }
  function radiusPx(d) { return d.r * Math.min(G.p.width, G.p.height) * picScale(); }

  function addMark(i, cls = '') {
    const d = G.p.diffs[i];
    for (const pic of [picA, picB]) {
      const m = document.createElement('div');
      m.className = 'mark ' + cls; m.dataset.i = i;
      m.style.left = d.x * 100 + '%'; m.style.top = d.y * 100 + '%';
      $('.layer', pic).appendChild(m);
    }
    sizeMarks();
  }
  function sizeMarks() {
    $$('.mark').forEach((m) => {
      const R = Math.max(18, radiusPx(G.p.diffs[+m.dataset.i]) * 1.15);
      m.style.width = m.style.height = R * 2 + 'px';
    });
  }
  function drawMarks() { if (G.p) sizeMarks(); }

  // ---------- 타이머 ----------
  function tick(now) {
    if (!G.active) return;
    if (!G.paused) {
      G.timeLeft -= (now - G.last) / 1000;
      if (G.timeLeft <= 0) { G.timeLeft = 0; drawTime(); return timeUp(); }
      drawTime();
    }
    G.last = now;
    G.raf = requestAnimationFrame(tick);
  }
  function drawTime() {
    const f = Math.max(0, G.timeLeft / G.timeMax);
    $('#timefill').style.width = f * 100 + '%';
    $('#secs').textContent = Math.ceil(G.timeLeft) + '초';
    const tb = $('#timebar');
    tb.classList.toggle('warn', G.timeLeft <= 20 && G.timeLeft > 10);
    tb.classList.toggle('danger', G.timeLeft <= 10);
  }
  document.addEventListener('visibilitychange', () => {
    if (!G.active) return;
    G.paused = document.hidden;
    G.last = performance.now();
  });
  function floatText(txt, cls) {
    const f = document.createElement('div'); f.className = 'float ' + cls; f.textContent = txt;
    board.appendChild(f); setTimeout(() => f.remove(), 900);
  }

  // ---------- 탭 판정 ----------
  function handleTap(pic, cx, cy) {
    if (!G.active) return;
    const rect = $('.inner', pic).getBoundingClientRect();
    const nx = (cx - rect.left) / rect.width, ny = (cy - rect.top) / rect.height;
    if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return;
    const p = G.p, minSide = Math.min(p.width, p.height), sc = picScale() * zoom.s;
    let best = -1, bestD = Infinity;
    p.diffs.forEach((d, i) => {
      if (G.found.includes(i)) return;
      const rImg = d.r * minSide;
      const dist = Math.hypot((nx - d.x) * p.width, (ny - d.y) * p.height);
      const tol = Math.max(rImg * 1.3, 22 / sc); // 손가락용 최소 여유 22px
      if (dist < tol && dist < bestD) { best = i; bestD = dist; }
    });
    if (best >= 0) {
      G.found.push(best);
      addMark(best);
      $$('#dots b')[G.found.length - 1].classList.add('on');
      buzz(30);
      floatText('찾았다!', 'good');
      if (G.found.length === p.diffs.length) stageClear();
    } else {
      // 이미 찾은 곳을 다시 누른 경우는 감점 없음
      const again = p.diffs.some((d, i) => G.found.includes(i) && Math.hypot((nx - d.x) * p.width, (ny - d.y) * p.height) < d.r * minSide * 1.3);
      if (again) return;
      G.wrong++;
      G.timeLeft = Math.max(0, G.timeLeft - WRONG_SEC);
      drawTime();
      const x = document.createElement('div'); x.className = 'xmark'; x.textContent = '✕';
      x.style.left = nx * 100 + '%'; x.style.top = ny * 100 + '%';
      $('.layer', pic).appendChild(x); setTimeout(() => x.remove(), 700);
      board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
      floatText(`-${WRONG_SEC}초`, 'bad');
      buzz(90);
      if (G.timeLeft <= 0) timeUp();
    }
  }

  $('#hintBtn').addEventListener('click', () => {
    if (!G.active || G.hintUsed) return;
    const left = G.p.diffs.map((_, i) => i).filter((i) => !G.found.includes(i));
    if (!left.length) return;
    G.hintUsed = true; $('#hintBtn').disabled = true;
    G.timeLeft = Math.max(1, G.timeLeft - HINT_SEC); drawTime();
    floatText(`-${HINT_SEC}초`, 'bad');
    const d = G.p.diffs[pick(left)];
    for (const pic of [picA, picB]) {
      const r = document.createElement('div'); r.className = 'ring';
      const R = Math.max(22, radiusPx(d) * 1.4);
      r.style.width = r.style.height = R * 2 + 'px';
      r.style.left = d.x * 100 + '%'; r.style.top = d.y * 100 + '%';
      $('.layer', pic).appendChild(r); setTimeout(() => r.remove(), 1700);
    }
  });

  // ---------- 확대/이동 (두 사진 동시에) ----------
  const zoom = { s: 1, tx: 0, ty: 0 };
  function applyZoom() {
    const w = picA.clientWidth, h = picA.clientHeight;
    zoom.s = Math.min(4, Math.max(1, zoom.s));
    zoom.tx = Math.min(0, Math.max(w - w * zoom.s, zoom.tx));
    zoom.ty = Math.min(0, Math.max(h - h * zoom.s, zoom.ty));
    const t = `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.s})`;
    $$('.pic .inner').forEach((el) => (el.style.transform = t));
    $$('.mark, .ring').forEach((m) => (m.style.borderWidth = 4 / zoom.s + 'px'));
    $('#zoomReset').classList.toggle('on', zoom.s > 1.01);
  }
  function resetZoom() { zoom.s = 1; zoom.tx = 0; zoom.ty = 0; applyZoom(); }
  $('#zoomReset').addEventListener('click', resetZoom);

  for (const pic of [picA, picB]) {
    const pts = new Map();
    let start = null, pinch = null, moved = false;
    pic.addEventListener('pointerdown', (e) => {
      pic.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, tx: zoom.tx, ty: zoom.ty, t: Date.now() }; moved = false; pinch = null; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const rect = pic.getBoundingClientRect();
        const cx = (a.x + b.x) / 2 - rect.left, cy = (a.y + b.y) / 2 - rect.top;
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: zoom.s, px: (cx - zoom.tx) / zoom.s, py: (cy - zoom.ty) / zoom.s, rect };
        moved = true;
      }
    });
    pic.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const cx = (a.x + b.x) / 2 - pinch.rect.left, cy = (a.y + b.y) / 2 - pinch.rect.top;
        zoom.s = Math.min(4, Math.max(1, pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
        zoom.tx = cx - pinch.px * zoom.s; zoom.ty = cy - pinch.py * zoom.s;
        applyZoom();
      } else if (start && pts.size === 1) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 8) moved = true;
        if (moved && zoom.s > 1) { zoom.tx = start.tx + dx; zoom.ty = start.ty + dy; applyZoom(); }
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        if (!moved && start && Date.now() - start.t < 600 && e.type === 'pointerup') handleTap(pic, e.clientX, e.clientY);
        start = null; pinch = null;
      } else if (pts.size === 1) {
        const [a] = [...pts.values()];
        start = { x: a.x, y: a.y, tx: zoom.tx, ty: zoom.ty, t: 0 }; pinch = null;
      }
    };
    pic.addEventListener('pointerup', end);
    pic.addEventListener('pointercancel', end);
    pic.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = pic.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const px = (cx - zoom.tx) / zoom.s, py = (cy - zoom.ty) / zoom.s;
      zoom.s = Math.min(4, Math.max(1, zoom.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      zoom.tx = cx - px * zoom.s; zoom.ty = cy - py * zoom.s;
      applyZoom();
    }, { passive: false });
  }

  // ---------- 스테이지 결과 ----------
  function stopTimer() { G.active = false; cancelAnimationFrame(G.raf); }

  function stageClear() {
    stopTimer();
    const run = G.run, p = G.p;
    const remain = Math.ceil(G.timeLeft);
    const pts = {
      found: p.diffs.length * PT_FOUND,
      time: remain * PT_SEC,
      wrong: -G.wrong * PT_WRONG,
      nohint: G.hintUsed ? 0 : PT_NOHINT,
    };
    const sum = Math.max(0, pts.found + pts.time + pts.wrong + pts.nohint);
    const cleared = store.get('sd-cleared', {}); cleared[p.id] = true; store.set('sd-cleared', cleared);
    setTimeout(() => {
      if (run.mode === 'practice') {
        return openModal(`
          <div class="emoji">🎉</div><h2>다 찾았어요!</h2>
          <p>${p.name} · ${'★'.repeat(p.level)}<br>남은 시간 ${remain}초 · 오답 ${G.wrong}번</p>
          <div class="btns">
            <button class="btn mint" data-a="again">🔁 다시 하기</button>
            <button class="btn" data-a="list">📷 다른 사진</button>
            <button class="btn ghost" data-a="home">홈으로</button>
          </div>`);
      }
      run.total += sum; run.results.push(sum); run.idx++;
      $('#scoreLabel').textContent = `${run.total}점`;
      const last = run.idx >= 5;
      openModal(`
        <div class="emoji">${last ? '🏆' : '✨'}</div>
        <h2>${last ? '올 클리어!' : `스테이지 ${run.idx} 클리어!`}</h2>
        <div class="breakdown">
          <div><span>찾은 곳 ${p.diffs.length}개</span><b>+${pts.found}</b></div>
          <div><span>남은 시간 ${remain}초</span><b>+${pts.time}</b></div>
          ${G.wrong ? `<div><span>오답 ${G.wrong}번</span><b>${pts.wrong}</b></div>` : ''}
          ${pts.nohint ? `<div><span>힌트 없이 클리어</span><b>+${pts.nohint}</b></div>` : ''}
          <div class="tot"><span>누적 점수</span><span>${run.total}점</span></div>
        </div>
        <div class="btns">${last
          ? '<button class="btn coral" data-a="finish">🏅 랭킹 등록</button>'
          : `<button class="btn coral" data-a="next">다음 스테이지 ${'★'.repeat(run.idx + 1)} →</button>`}</div>`);
    }, 450);
  }

  function timeUp() {
    stopTimer();
    const run = G.run, p = G.p;
    // 못 찾은 곳 보여주기
    p.diffs.forEach((_, i) => { if (!G.found.includes(i)) addMark(i, 'miss'); });
    buzz([60, 60, 60]);
    setTimeout(() => {
      if (run.mode === 'practice') {
        return openModal(`
          <div class="emoji">⏰</div><h2>시간 끝!</h2>
          <p>${G.found.length}/5개 찾았어요.<br>흰 점선이 못 찾은 곳이에요.</p>
          <div class="btns">
            <button class="btn mint" data-a="again">🔁 다시 하기</button>
            <button class="btn" data-a="list">📷 다른 사진</button>
            <button class="btn ghost" data-a="home">홈으로</button>
          </div>`, true);
      }
      const partial = G.found.length * PT_FOUND;
      run.total += partial;
      $('#scoreLabel').textContent = `${run.total}점`;
      openModal(`
        <div class="emoji">⏰</div><h2>시간 끝!</h2>
        <p>스테이지 ${run.idx + 1}에서 ${G.found.length}/5개 찾았어요 (+${partial}점)</p>
        <div class="btns"><button class="btn coral" data-a="finish">결과 보기</button></div>`, true);
    }, 1400);
  }

  async function finishRun() {
    const run = G.run, nick = store.get('sd-nick', '');
    const stages = run.results.length;
    openModal(`<div class="emoji">⏳</div><h2>기록 저장 중…</h2>`);
    let rank = null, ok = true;
    try { rank = await Rank.submit(run.genre, nick, run.total, stages); } catch (e) { ok = false; }
    const g = run.genre === 'all' ? ALL : GENRES.find((x) => x.key === run.genre);
    openModal(`
      <div class="emoji">${stages >= 5 ? '👑' : '🎮'}</div>
      <h2>${nick} 님의 점수</h2>
      <div class="bignum">${run.total.toLocaleString()}점</div>
      <p>${g.emoji} ${g.ko} · ${stages}/5 스테이지 클리어<br>
      ${ok ? (rank ? `<b>${g.ko} 랭킹 ${rank}위!</b>` : '기록을 저장했어요') : '랭킹 저장에 실패했어요 (인터넷 연결 확인)'}
      ${Rank.shared ? '' : '<br><small>※ 지금은 이 기기에만 저장돼요</small>'}</p>
      <div class="btns">
        <button class="btn coral" data-a="retry">🔁 다시 도전</button>
        <button class="btn sun" data-a="rank">🥇 랭킹 보기</button>
        <button class="btn ghost" data-a="home">홈으로</button>
      </div>`);
  }

  // ---------- 모달 ----------
  const modal = $('#modal');
  function openModal(html, keepBoard) { $('#modalSheet').innerHTML = html; modal.classList.add('on'); }
  function closeModal() { modal.classList.remove('on'); }
  modal.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    const act = a.dataset.a, run = G.run;
    closeModal();
    if (act === 'next') startStage();
    else if (act === 'again') startStage();
    else if (act === 'finish') finishRun();
    else if (act === 'retry') startChallenge(run.genre);
    else if (act === 'list') { history.length = 0; history.push('home', 'genre'); renderPractice(run.genre); }
    else if (act === 'rank') { history.length = 0; history.push('home'); show('rank', false); renderRank(run.genre); }
    else if (act === 'home') { history.length = 0; show('home', false); }
    else if (act === 'quit-yes') { stopTimer(); history.length = 0; show('home', false); }
    else if (act === 'quit-no') { G.paused = false; G.last = performance.now(); }
  });
  $('#quitBtn').addEventListener('click', () => {
    if (!G.active) { history.length = 0; return show('home', false); }
    G.paused = true;
    openModal(`<div class="emoji">🚪</div><h2>그만할까요?</h2>
      <p>${G.run.mode === 'challenge' ? '지금 나가면 이번 기록은 랭킹에 안 올라가요.' : '연습을 끝내요.'}</p>
      <div class="btns"><button class="btn coral" data-a="quit-no">계속하기</button><button class="btn ghost" data-a="quit-yes">나가기</button></div>`);
  });

  // ---------- 게임 방법 ----------
  let slide = 0;
  function openHowto() { slide = 0; drawSlide(); $('#howto').classList.add('on'); }
  function drawSlide() {
    $$('#howto .slide').forEach((s, i) => s.classList.toggle('on', i === slide));
    $$('#pager b').forEach((b, i) => b.classList.toggle('on', i === slide));
    $('#howNext').textContent = slide < 2 ? '다음' : '시작하기!';
  }
  $('#howNext').addEventListener('click', () => {
    if (slide < 2) { slide++; drawSlide(); }
    else { $('#howto').classList.remove('on'); store.set('sd-howto', 1); }
  });
  if (!store.get('sd-howto', 0)) openHowto();

  // ---------- 랭킹 ----------
  const Rank = {
    db: null, shared: false,
    ready: (async () => {
      const c = window.FIREBASE_CONFIG || {};
      if (!c.projectId || !c.apiKey) return;
      const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      try {
        await load('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
        await load('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
        firebase.initializeApp(c);
        Rank.db = firebase.firestore();
        Rank.shared = true;
      } catch (e) { console.warn('Firebase 연결 실패, 기기 저장으로 전환', e); }
    })(),
    async submit(genre, nick, score, stages) {
      await this.ready;
      if (this.db) {
        await this.db.collection('scores_' + genre).add({ nick, score: Math.round(score), stages, ts: firebase.firestore.FieldValue.serverTimestamp() });
      } else {
        const list = store.get('sd-rank-' + genre, []);
        list.push({ nick, score, stages, ts: Date.now() });
        store.set('sd-rank-' + genre, list);
      }
      const top = await this.top(genre);
      const i = top.findIndex((r) => r.nick === nick);
      return i >= 0 ? i + 1 : null;
    },
    async top(genre) {
      await this.ready;
      let rows;
      if (this.db) {
        // 무료 요금제(하루 읽기 5만 건) 고려해 상위 100개만 읽음
        const snap = await this.db.collection('scores_' + genre).orderBy('score', 'desc').limit(100).get();
        rows = snap.docs.map((d) => d.data());
      } else {
        rows = store.get('sd-rank-' + genre, []).sort((a, b) => b.score - a.score);
      }
      // 닉네임별 최고 기록만
      const seen = new Set(), out = [];
      for (const r of rows) { if (seen.has(r.nick)) continue; seen.add(r.nick); out.push(r); }
      return out;
    },
  };

  const tabs = [ALL, ...GENRES];
  $('#rankTabs').innerHTML = tabs.map((g) => `<button data-k="${g.key}">${g.emoji} ${g.ko}</button>`).join('');
  $$('#rankTabs button').forEach((b) => b.addEventListener('click', () => renderRank(b.dataset.k)));
  $('#rankRefresh').addEventListener('click', () => renderRank(store.get('sd-rank-tab', 'all')));

  // 테스트용 (주소 뒤에 ?debug 를 붙였을 때만)
  if (location.search.includes('debug')) window.__sd = { G, Rank, setTime: (s) => { G.timeLeft = s; } };

  async function renderRank(key) {
    store.set('sd-rank-tab', key);
    $$('#rankTabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === key));
    const list = $('#rankList');
    list.innerHTML = '<div class="empty">불러오는 중…</div>';
    let rows;
    try { rows = await Rank.top(key); } catch (e) { list.innerHTML = '<div class="empty">랭킹을 불러오지 못했어요 😢</div>'; return; }
    const me = store.get('sd-nick', '');
    list.innerHTML = '';
    if (!rows.length) list.innerHTML = '<div class="empty">아직 기록이 없어요.<br>첫 번째 주인공이 되어보세요!</div>';
    rows.slice(0, 50).forEach((r, i) => {
      const el = document.createElement('div');
      el.className = 'rank-item' + (r.nick === me ? ' me' : '');
      const medal = ['🥇', '🥈', '🥉'][i] || i + 1;
      el.innerHTML = `<div class="no"></div><div class="nm"></div><div style="text-align:right"><div class="pt"></div><div class="sg"></div></div>`;
      el.querySelector('.no').textContent = medal;
      el.querySelector('.nm').textContent = r.nick;
      el.querySelector('.pt').textContent = Number(r.score).toLocaleString() + '점';
      el.querySelector('.sg').textContent = `${r.stages}/5 클리어`;
      list.appendChild(el);
    });
    $('#rankNotice').textContent = Rank.shared ? '모든 사람의 기록이 모여요 · 닉네임별 최고 기록' : '※ 아직 온라인 랭킹이 연결되지 않아 이 기기의 기록만 보여요.';
  }
})();
