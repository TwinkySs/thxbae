// Checkys — backend (Node.js 18+, без внешних зависимостей). REST API /api/v1 + раздача public/.
// Хранилище — JSON-файл data/db.json (для учебного запуска). Логику хранения легко заменить на PostgreSQL.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const DEMO = process.env.DEMO === '1', PORT = process.env.PORT || 3000, MAXTRY = +process.env.MAX_LOGIN_TRIES || 5, K = 5, QUOTA = 4, DAY = 864e5;
const DIR = path.join(__dirname, 'data'), DBF = path.join(DIR, 'db.json'), PUB = path.join(__dirname, 'public');
fs.mkdirSync(DIR, { recursive: true });

// ---------- секреты, хеши, токены ----------
const KEYF = path.join(DIR, 'secret.key');
if (!fs.existsSync(KEYF)) fs.writeFileSync(KEYF, crypto.randomBytes(32).toString('hex'));
const SECRET = fs.readFileSync(KEYF, 'utf8');
const hash = (p, s = crypto.randomBytes(16).toString('hex')) => s + ':' + crypto.scryptSync(p, s, 32).toString('hex');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const check = (p, h) => same(hash(p, h.split(':')[0]), h);
const mac = b => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const sign = o => { const b = Buffer.from(JSON.stringify(o)).toString('base64url'); return b + '.' + mac(b); };
const unsign = t => { const [b, s] = String(t || '').split('.'); if (!s || !same(mac(b), s)) return null; const o = JSON.parse(Buffer.from(b, 'base64url')); return o.exp > Date.now() ? o : null; };
const tok = u => sign({ id: u.id, tv: u.tv, exp: Date.now() + 12 * 36e5 }); // tv — версия сессий: смена пароля/выход отзывают старые токены

// ---------- БД ----------
const TEST = { version: 1, questions: ['К концу недели я чувствую себя эмоционально опустошённым', 'Мне трудно переключиться и отдохнуть после смены', 'Я чувствую, что работа забирает все мои силы', 'Мне не хватает энергии на дела вне работы', 'Я задерживаюсь или перерабатываю сверх плана'], scale: ['Никогда', 'Редко', 'Иногда', 'Часто', 'Каждый день'],
  // Демо-методика. Пороги (m — верхняя граница индекса) хранятся на сервере и версионируются; настоящая методика утверждается отдельно (п. 19 ТЗ).
  cats: [{ code: 'ideal', n: 'Идеальные', i: '🌟', m: 1.8, tip: 'Общие рекомендации: сохраняйте режим сна, активности и отдыха.' }, { code: 'good', n: 'Хорошие', i: '👍', m: 2.4, tip: 'Поддерживайте состояние: короткие перерывы в течение смены и прогулки.' }, { code: 'norm', n: 'Норма', i: '✔️', m: 2.9, tip: 'Базовые рекомендации: следите за режимом дня и восстановлением после смены.' }, { code: 'attn', n: 'Требуют внимания', i: '⚠️', m: 3.6, sp: 1, tip: 'Рекомендация: сократите переработки, запланируйте перерыв в течение недели.' }, { code: 'crit', n: 'Требуют вмешательства', i: '🆘', m: 9, sp: 1, tip: 'Приоритетно: обратитесь к психологу в ближайшее время.' }] };
let db = fs.existsSync(DBF) ? JSON.parse(fs.readFileSync(DBF, 'utf8')) : null;
const save = () => fs.writeFileSync(DBF, JSON.stringify(db));
const uid = () => crypto.randomBytes(6).toString('hex');
function seed() {
  db = { tests: [TEST], users: {}, sessions: {}, results: {}, goals: {}, specs: {}, sem: {}, rs: {}, ap: {}, fails: {}, audit: [] };
  const t = Date.now(), hp = hash('demo12'), hh = hash('hr123');
  const U = (org, dep, id, role, nick, av, ph, must, cons) => db.users[id] = { id, org, dep, role, nick, av, ph, must, cons, status: 'active', rem: true, t: '09:00', tv: 0 };
  U('EVRZ', 'Администрация', 'EVRZ_HR', 'hr', 'HR ЕВРАЗ', '🧑‍💼', hh, 0, 1); U('ZSMK', 'Администрация', 'ZSMK_HR', 'hr', 'HR ЗСМК', '🧑‍💼', hh, 0, 1);
  U('ZSMK', 'Цех 3', 'ZSMK_010203', 'emp', 'Сибиряк', '🐻', hash('zsmk1'), 1, 0);
  const E = [['Цех 1', 'EVRZ_010203'], ['Цех 1', 'EVRZ_010204'], ['Цех 1', 'EVRZ_010205'], ['Цех 1', 'EVRZ_010206'], ['Цех 1', 'EVRZ_010207'], ['Цех 2', 'EVRZ_020201'], ['Цех 2', 'EVRZ_020202'], ['Цех 2', 'EVRZ_020203'], ['Цех 2', 'EVRZ_020204'], ['Цех 2', 'EVRZ_020205'], ['Цех 2', 'EVRZ_020206']];
  E.forEach(([dep, id], j) => {
    U('EVRZ', dep, id, 'emp', j ? 'Сотрудник' : 'Орёл', j ? '🙂' : '🦅', j ? hp : hash('evraz1'), 0, j === 10 ? 0 : 1); if (j === 10) return;
    const b = dep === 'Цех 1' ? 2.3 : 3.6;
    for (let i = 0; i < 6; i++) {
      if (i === 5 && j % 4 === 3) continue;
      const q = [0, 1, 2, 3, 4].map(k => Math.min(5, Math.max(1, Math.round(b + (dep === 'Цех 1' ? -.15 : .1) * (i - 2) + ((j * 7 + i * 3 + k * 5) % 5 - 2) * .5 + (k === 4 && dep === 'Цех 2' ? .5 : 0)))));
      const x = q.reduce((a, c) => a + c, 0) / 5, id2 = uid(); db.results[id2] = { id: id2, u: id, org: 'EVRZ', dep, v: 1, q, x, cat: catOf(x, 1).code, ts: t - (5 - i) * 7 * DAY - DAY * (1 + j % 3) };
    }
  });
  db.specs.EVRZ = { org: 'EVRZ', n: 'Анна Петрова', s: 'Психолог', f: 'Онлайн', c: '+7 900 000-00-01', sl: ['Пн, 14:00', 'Ср, 18:30', 'Пт, 12:00'] };
  db.specs.ZSMK = { org: 'ZSMK', n: 'Игорь Власов', s: 'Врач-профилактолог', f: 'Онлайн', c: '+7 900 000-00-02', sl: ['Пн, 12:00', 'Чт, 11:00', 'Пт, 15:00'] };
  db.sem.s1 = { id: 's1', org: 'EVRZ', t: 'Стресс и смены: как восстанавливаться', d: 'Чт, 22 окт, 15:00', p: 'Конференц-зал, корпус А' };
  db.sem.s2 = { id: 's2', org: 'ZSMK', t: 'Здоровый сон при сменной работе', d: 'Пт, 23 окт, 16:00', p: 'Онлайн' };
  save(); console.log('Созданы демо-данные (первый запуск).');
}
const test = () => db.tests[db.tests.length - 1];
const catOf = (x, v) => ((db && db.tests.find(t => t.version === v)) || TEST).cats.find(c => x < c.m);
if (!db) seed();

// ---------- вспомогательное ----------
const E = (s, e) => { throw { s, e }; };
const pub = u => ({ id: u.id, org: u.org, dep: u.dep, role: u.role, nick: u.nick, av: u.av, must: u.must, cons: u.cons, rem: u.rem, t: u.t });
const audit = (u, a, e) => { db.audit.push({ ts: Date.now(), actor: u.id, org: u.org, a, e }); save(); };
const own = (c, u) => Object.values(db[c]).filter(x => x.u === u.id);
const year = ts => new Date(ts).getFullYear();
const left = u => QUOTA - own('ap', u).filter(a => a.st !== 'Отменено' && year(a.ts) === year(Date.now())).length;
const routes = [];
// roles: null — открытый; 'any' — любой вошедший; 'emp' | 'hr' — по роли (с проверкой смены пароля и согласия)
const R = (m, p, roles, fn) => routes.push({ m, roles, fn, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') });
const A = '/api/v1';

// ---------- аутентификация ----------
R('POST', A + '/auth/login', null, ({ body }) => {
  const l = String(body.login || '').trim().toUpperCase(), u = db.users[l], f = db.fails[l] || (db.fails[l] = { n: 0, until: 0 });
  if (f.until > Date.now()) E(429, 'too_many_attempts');
  if (!u || !check(String(body.password || ''), u.ph)) { if (++f.n >= MAXTRY) { f.until = Date.now() + 15 * 60e3; f.n = 0; } save(); E(401, 'bad_credentials'); }
  if (u.status !== 'active') E(403, 'blocked');
  f.n = 0; save(); return { token: tok(u), user: pub(u) };
});
R('POST', A + '/auth/logout', 'any', ({ u }) => { u.tv++; save(); });
R('POST', A + '/auth/password', 'any', ({ u, body }) => { const p = String(body.password || ''); if (p.length < 6) E(400, 'weak_password'); u.ph = hash(p); u.must = 0; u.tv++; save(); return { token: tok(u) }; });
R('GET', A + '/me', 'any', ({ u }) => pub(u));
R('PATCH', A + '/me', 'any', ({ u, body }) => {
  if (typeof body.nick === 'string') u.nick = body.nick.trim().slice(0, 30) || u.nick;
  if ('rem' in body) u.rem = !!body.rem;
  if (/^\d\d:\d\d$/.test(body.t || '')) u.t = body.t;
  if (body.cons === 0 || body.cons === 1) u.cons = body.cons;
  save(); return pub(u);
});

// ---------- тестирование ----------
R('GET', A + '/tests/available', 'emp', () => { const t = test(); return { version: t.version, questions: t.questions, scale: t.scale, categories: t.cats }; });
const openSession = u => own('sessions', u).find(s => s.status === 'open');
R('POST', A + '/test-sessions', 'emp', ({ u }) => { let s = openSession(u); if (!s) { s = { id: uid(), u: u.id, v: test().version, answers: [], status: 'open', ts: Date.now() }; db.sessions[s.id] = s; save(); } return s; });
const mine = (u, id) => { const s = db.sessions[id]; if (!s || s.u !== u.id || s.status !== 'open') E(404, 'not_found'); return s; };
R('POST', A + '/test-sessions/:id/answers', 'emp', ({ u, params, body }) => { const s = mine(u, params.id), v = +body.value; if (!(v >= 1 && v <= 5)) E(400, 'bad_value'); if (s.answers.length >= test().questions.length) E(409, 'complete_it'); s.answers.push(v); save(); return s; });
R('POST', A + '/test-sessions/:id/complete', 'emp', ({ u, params }) => {
  const s = mine(u, params.id); if (s.answers.length !== test().questions.length) E(409, 'incomplete');
  const x = s.answers.reduce((a, c) => a + c, 0) / s.answers.length, c = catOf(x, s.v), r = { id: uid(), u: u.id, org: u.org, dep: u.dep, v: s.v, q: s.answers, x, cat: c.code, ts: Date.now() };
  db.results[r.id] = r; s.status = 'done'; save(); return { x, ts: r.ts, cat: c };
});
R('GET', A + '/results/history', 'emp', ({ u }) => own('results', u).sort((a, b) => a.ts - b.ts).map(r => ({ id: r.id, x: r.x, ts: r.ts, v: r.v, cat: catOf(r.x, r.v) })));
R('GET', A + '/goals', 'emp', ({ u }) => own('goals', u));
R('POST', A + '/goals', 'emp', ({ u, body }) => { const to = +body.to, n = String(body.n || '').trim().slice(0, 80); if (!n || !(to >= 1 && to <= 5)) E(400, 'bad_goal'); const g = { id: uid(), u: u.id, n, to }; db.goals[g.id] = g; save(); return g; });

// ---------- специалисты и запись ----------
const taken = u => Object.values(db.ap).filter(a => a.org === u.org && a.st !== 'Отменено').map(a => a.s);
R('GET', A + '/specialists', 'emp', ({ u }) => ({ sp: db.specs[u.org] || null, taken: taken(u) }));
R('GET', A + '/appointments', 'emp', ({ u }) => ({ items: own('ap', u).sort((a, b) => b.ts - a.ts), left: left(u) }));
R('POST', A + '/appointments', 'emp', ({ u, body }) => {
  const sp = db.specs[u.org]; if (!sp || !sp.sl.includes(body.slot)) E(400, 'bad_slot'); if (taken(u).includes(body.slot)) E(409, 'slot_taken'); if (left(u) <= 0) E(409, 'quota');
  const a = { id: uid(), u: u.id, org: u.org, sp: sp.n, s: body.slot, st: 'Запланировано', ts: Date.now() }; db.ap[a.id] = a; save(); return a;
});
R('PATCH', A + '/appointments/:id', 'emp', ({ u, params, body }) => { const a = db.ap[params.id]; if (!a || a.u !== u.id) E(404, 'not_found'); if (body.status === 'Отменено' && a.st === 'Запланировано') a.st = 'Отменено'; save(); return a; });

// ---------- семинары ----------
R('GET', A + '/seminars', 'emp', ({ u }) => Object.values(db.sem).filter(s => s.org === u.org).map(s => ({ ...s, r: (db.rs[s.id + '_' + u.id] || {}).v || null })));
R('POST', A + '/seminars/:id/response', 'emp', ({ u, params, body }) => { const s = db.sem[params.id]; if (!s || s.org !== u.org) E(404, 'not_found'); if (!['Иду', 'Не иду'].includes(body.v)) E(400, 'bad_value'); db.rs[s.id + '_' + u.id] = { sem: s.id, u: u.id, v: body.v }; save(); });

// ---------- панель HR (только своё предприятие, только агрегаты) ----------
const staff = u => Object.values(db.users).filter(x => x.org === u.org && x.role === 'emp');
R('GET', A + '/hr/employees', 'hr', ({ u }) => staff(u).map(x => ({ id: x.id, dep: x.dep, status: x.status, cons: x.cons })));
R('POST', A + '/hr/employees', 'hr', ({ u, body }) => {
  const code = String(body.code || '').trim() || String(Math.floor(1e5 + Math.random() * 9e5)); if (!/^\d{4,8}$/.test(code)) E(400, 'bad_code');
  const id = u.org + '_' + code; if (db.users[id]) E(409, 'exists'); const pw = crypto.randomBytes(4).toString('hex');
  db.users[id] = { id, org: u.org, dep: String(body.dep || '').trim().slice(0, 40) || 'Без подразделения', role: 'emp', nick: 'Сотрудник', av: '🙂', ph: hash(pw), must: 1, cons: 0, status: 'active', rem: true, t: '09:00', tv: 0 };
  audit(u, 'create_employee', id); return { id, pw };
});
R('PATCH', A + '/hr/employees/:id', 'hr', ({ u, params, body }) => { const x = db.users[params.id]; if (!x || x.org !== u.org || x.role !== 'emp') E(404, 'not_found'); if (!['active', 'blocked'].includes(body.status)) E(400, 'bad_value'); x.status = body.status; audit(u, 'set_status:' + body.status, x.id); });
R('GET', A + '/hr/seminars', 'hr', ({ u }) => Object.values(db.sem).filter(s => s.org === u.org).map(s => { const r = Object.values(db.rs).filter(x => x.sem === s.id); return { ...s, yes: r.filter(x => x.v === 'Иду').length, no: r.filter(x => x.v === 'Не иду').length }; }));
R('POST', A + '/hr/seminars', 'hr', ({ u, body }) => { const t = String(body.t || '').trim().slice(0, 100); if (!t) E(400, 'bad_title'); const s = { id: 's' + uid(), org: u.org, t, d: String(body.d || 'Дата уточняется').slice(0, 60), p: String(body.p || 'Место уточняется').slice(0, 80) }; db.sem[s.id] = s; audit(u, 'create_seminar', s.id); return s; });
R('GET', A + '/hr/audit', 'hr', ({ u }) => db.audit.filter(a => a.org === u.org).slice(-50));
R('GET', A + '/hr/summary', 'hr', ({ u }) => {
  const emp = staff(u).filter(x => x.status === 'active'), ids = new Set(emp.map(x => x.id)), now = Date.now(), last = {}, prev = {};
  const rs = Object.values(db.results).filter(r => ids.has(r.u)).sort((a, b) => a.ts - b.ts); rs.forEach(r => { prev[r.u] = last[r.u]; last[r.u] = r; });
  const L = Object.keys(last), pc = n => emp.length ? Math.round(n / emp.length * 100) : 0, av = a => a.reduce((s, x) => s + x, 0) / a.length, ot = a => av(a.map(r => r.q[4])), pv = L.filter(i => prev[i]).map(i => prev[i]);
  // k-анонимность: группы меньше K человек не раскрываются (avg = null)
  const deps = [...new Set(emp.map(x => x.dep))].map(d => { const a = L.filter(i => db.users[i].dep === d).map(i => last[i].x); return { dep: d, avg: a.length >= K ? av(a) : null }; });
  const wk = [5, 4, 3, 2, 1, 0].map(k => { const r = rs.filter(x => Math.floor((now - x.ts) / (7 * DAY)) === k); return new Set(r.map(x => x.u)).size >= K ? { s: av(r.map(x => x.x)), d: k } : null; }).filter(Boolean);
  const od = pv.length >= K ? Math.round((ot(L.map(i => last[i])) / ot(pv) - 1) * 100) : null;
  const recs = deps.filter(d => d.avg >= 3.2).map(d => d.dep + ': высокий индекс выгорания — пересмотреть нагрузку и сроки'); if (od > 10) recs.push('Растут переработки — пересмотреть графики');
  return { K, org: u.org, part: pc(L.filter(i => now - last[i].ts < 7 * DAY).length), inst: pc(emp.filter(x => x.cons).length), od, nc: emp.length >= K ? Object.values(db.ap).filter(a => a.org === u.org && a.st !== 'Отменено').length : null, deps, wk, recs };
});

// ---------- демо-режим (DEMO=1): быстрый вход и сброс данных между показами ----------
R('GET', A + '/demo', null, () => ({ demo: DEMO }));
R('POST', A + '/demo/reset', null, () => { if (!DEMO) E(404, 'not_found'); seed(); });

// ---------- HTTP ----------
const send = (res, s, o) => { res.writeHead(s, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
const body = req => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) { req.destroy(); no({ s: 413, e: 'too_large' }); } }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { no({ s: 400, e: 'bad_json' }); } }); });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const r = routes.find(r => r.m === req.method && r.re.test(url.pathname)); if (!r) E(404, 'not_found');
      let u = null;
      if (r.roles) {
        const t = unsign((req.headers.authorization || '').slice(7)); u = t && db.users[t.id];
        if (!u || u.tv !== t.tv || u.status !== 'active') E(401, 'unauthorized');
        if (r.roles !== 'any') { if (u.role !== r.roles) E(403, 'forbidden'); if (u.must) E(403, 'password_change_required'); if (u.role === 'emp' && !u.cons) E(403, 'consent_required'); }
      }
      const out = await r.fn({ u, body: await body(req), params: r.re.exec(url.pathname).groups || {} });
      return send(res, 200, out === undefined ? { ok: 1 } : out);
    }
    const f = path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) E(404, 'not_found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); fs.createReadStream(f).pipe(res);
  } catch (e) { if (!e.s) console.error(e); send(res, e.s || 500, { e: e.e || 'server_error' }); }
}).listen(PORT, () => {
  console.log('Checkys' + (DEMO ? ' [ДЕМО-РЕЖИМ]' : '') + ': http://localhost:' + PORT);
  Object.values(require('os').networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).forEach(i => console.log('  Для телефона в той же сети: http://' + i.address + ':' + PORT));
});
