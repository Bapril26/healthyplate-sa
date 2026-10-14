/* HealthyPlate SA – app logic (offline-first single-page app inside an Android WebView) */
(function () {
  'use strict';
  const { ING, RECIPES, STORES } = window.HP_DATA;
  const APP_NAME = 'HealthyPlate SA';
  const STORE_KEY = 'healthyplate_state_v1';
  const DEFAULT_MODEL = 'claude-sonnet-5-5';
  const FREE_SCANS_PER_DAY = 3;
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const SLOTS = [['breakfast', 'Breakfast', '🌅'], ['lunch', 'Lunch', '☀️'], ['supper', 'Supper', '🌙']];
  const GOALS = {
    lose: { n: 'Lose weight', e: '⚖️', d: 'A gentle, sustainable calorie deficit' },
    maintain: { n: 'Maintain my weight', e: '🎯', d: 'Balanced meals at maintenance calories' },
    gain: { n: 'Gain weight', e: '📈', d: 'A healthy calorie surplus' },
    muscle: { n: 'Build muscle', e: '💪', d: 'Higher protein with a small surplus' },
    healthier: { n: 'Eat healthier', e: '🥗', d: 'Better food, no calorie focus' },
  };
  const ALLERGENS = [['dairy', 'Dairy / lactose', '🥛'], ['egg', 'Eggs', '🥚'], ['gluten', 'Gluten / wheat', '🌾'], ['peanuts', 'Peanuts', '🥜'], ['nuts', 'Tree nuts', '🌰'], ['soy', 'Soy', '🫘'], ['fish', 'Fish', '🐟'], ['shellfish', 'Shellfish', '🦐'], ['sesame', 'Sesame', '🌿']];
  const DIETS = [['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['highprotein', 'High-protein'], ['lowcarb', 'Lower-carb'], ['dairyfree', 'Dairy-free'], ['glutenfree', 'Gluten-free']];
  const DISLIKE_SUGGEST = ['Mushrooms', 'Fish', 'Onion', 'Chilli', 'Avocado', 'Tofu', 'Lentils', 'Cottage cheese', 'Butternut', 'Cabbage'];
  const ACTIVITY = { low: ['Mostly sitting', 1.2], light: ['Lightly active', 1.375], moderate: ['Active 3–5 days a week', 1.55], high: ['Very active', 1.725] };
  const AISLES = { produce: '🥬 Fruit & veg', meat: '🍗 Meat', dairy: '🥛 Dairy, eggs & chilled', bakery: '🍞 Bakery', pantry: '🥫 Pantry', frozen: '🧊 Frozen', other: '📝 Other items' };
  const CATS = {
    breakfast: { n: 'Breakfast', e: '🍳', g: 'g-breakfast' },
    lunch: { n: 'Lunch', e: '🥗', g: 'g-lunch' },
    supper: { n: 'Supper', e: '🍲', g: 'g-supper' },
    prep: { n: 'Meal Prep', e: '🍱', g: 'g-prep' },
  };
  const SUBS = {
    breakfast: [['all', 'All'], ['oats', 'Oats & porridge'], ['eggs', 'Eggs & omelettes'], ['smoothie', 'Smoothies'], ['yoghurt', 'Yoghurt & fruit'], ['toast', 'Wholegrain toast'], ['highprotein', 'High-protein'], ['quick', 'Quick for work'], ['budget', 'Budget'], ['loss', 'Weight loss'], ['gain', 'Weight gain']],
    other: [['all', 'All'], ['quick', 'Quick (≤20 min)'], ['budget', 'Budget'], ['highprotein', 'High-protein'], ['vegetarian', 'Vegetarian'], ['lowcarb', 'Lower-carb'], ['loss', 'Weight loss'], ['gain', 'Weight gain']],
  };
  const RBY = Object.fromEntries(RECIPES.map(r => [r.id, r]));

  // ───────── State ─────────
  function defaults() {
    return { profile: null, draft: null, saved: [], plan: {}, shopping: [], notes: [], diary: {}, premium: false, scans: { date: '', count: 0 }, apiKey: '', model: DEFAULT_MODEL };
  }
  let S;
  try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { S = defaults(); }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('Could not save on this device'); } }
  const P = () => S.profile || {};

  // ───────── Helpers ─────────
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const rnd = n => Math.round(n);
  const money = n => 'R' + (n >= 100 ? Math.round(n) : n.toFixed(n < 10 ? 2 : 0));
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const todayIdx = () => (new Date().getDay() + 6) % 7;
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // Router: uses the URL hash in the Android app (so the back button works) and an in-page stack when embedded.
  const USE_HASH = !window.HP_EMBED;
  let ROUTE = '/home'; const STACK = [];
  const curRoute = () => USE_HASH ? (location.hash.replace(/^#/, '') || '/home') : ROUTE;
  const isEdit = () => (curRoute().split('?')[1] || '') === 'edit';
  function go(path) {
    if (USE_HASH) { if (location.hash === '#' + path) render(); else location.hash = path; return; }
    STACK.push(ROUTE); ROUTE = path; closeSheet(); render();
  }
  function replaceRoute(path) { if (USE_HASH) history.replaceState(null, '', '#' + path); else ROUTE = path; }
  function askConfirm(msg, yesLabel, onYes) {
    sheet('<h2>' + esc(msg) + '</h2><div class="actions mt"><button class="btn ghost" data-act="closeSheet">Cancel</button><button class="btn danger" data-act="confirmYes">' + esc(yesLabel) + '</button></div>');
    askConfirm.cb = onYes;
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600); }

  function fmtQty(id, g) {
    const i = ING[id];
    if (i.u) {
      const n = Math.round((g / i.u.g) * 2) / 2;
      if (n > 0) {
        const nTxt = n % 1 ? (Math.floor(n) ? Math.floor(n) + '½' : '½') : String(n);
        return nTxt + ' ' + (n > 1 ? i.u.many : i.u.one) + (i.u.g >= 30 ? ' (' + rnd(g) + ' g)' : '');
      }
    }
    const amt = g >= 1000 ? (g / 1000).toFixed(g % 1000 ? 2 : 0).replace(/\.?0+$/, '') + (i.ml ? ' L' : ' kg') : rnd(g) + (i.ml ? ' ml' : ' g');
    return amt + ' ' + i.n.toLowerCase();
  }

  // ───────── Nutrition & suitability ─────────
  const NUT = {};
  function nut(r) {
    if (NUT[r.id]) return NUT[r.id];
    let k = 0, p = 0, c = 0, f = 0, cost = 0; const tags = new Set();
    r.ing.forEach(([id, g]) => { const i = ING[id]; k += i.k * g / 100; p += i.p * g / 100; c += i.c * g / 100; f += i.f * g / 100; cost += i.r * g / 1000; i.t.forEach(t => tags.add(t)); });
    const s = r.serves;
    return (NUT[r.id] = { kcal: rnd(k / s), p: rnd(p / s), c: rnd(c / s), f: rnd(f / s), cost: cost / s, total: cost, tags });
  }
  function allergyHits(r) {
    const al = P().allergies || [];
    const n = nut(r); const hits = al.filter(a => n.tags.has(a)).map(a => (ALLERGENS.find(x => x[0] === a) || [a, a])[1]);
    const other = (P().allergyOther || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    other.forEach(o => { const stem = o.replace(/s$/, ''); if (stem.length > 2 && r.ing.some(([id]) => ING[id].n.toLowerCase().includes(stem))) hits.push(o); });
    return hits;
  }
  function dislikeHits(r) {
    const d = (P().dislikes || []).map(s => s.toLowerCase().trim().replace(/s$/, '')).filter(s => s.length > 2);
    return d.filter(x => r.ing.some(([id]) => ING[id].n.toLowerCase().includes(x)) || (x === 'fish' && nut(r).tags.has('fish')));
  }
  function dietOk(r, diets) {
    const n = nut(r);
    return (diets || []).every(d => {
      if (d === 'vegetarian') return !n.tags.has('meat') && !n.tags.has('fish');
      if (d === 'vegan') return !['meat', 'fish', 'dairy', 'egg', 'honey'].some(t => n.tags.has(t));
      if (d === 'highprotein') return n.p >= 25;
      if (d === 'lowcarb') return n.c <= 30;
      if (d === 'dairyfree') return !n.tags.has('dairy');
      if (d === 'glutenfree') return !n.tags.has('gluten');
      return true;
    });
  }
  function filterOk(r, key) {
    const n = nut(r);
    switch (key) {
      case 'all': return true;
      case 'quick': return r.time <= (r.cat === 'breakfast' ? 10 : 20);
      case 'budget': return n.cost <= (r.cat === 'breakfast' ? 15 : 25);
      case 'highprotein': return n.p >= 25;
      case 'lowcarb': return n.c <= 30;
      case 'vegetarian': return dietOk(r, ['vegetarian']);
      case 'loss': return n.kcal <= (r.cat === 'breakfast' ? 400 : 500);
      case 'gain': return n.kcal >= 550;
      default: return (r.sub || []).includes(key);
    }
  }
  // Safe for recommendations: no allergens, fits diet, no dislikes
  const recommendable = r => !allergyHits(r).length && dietOk(r, P().diets) && !dislikeHits(r).length;
  function goalScore(r) {
    const n = nut(r); const g = P().goal; const t = P().cookTime || 60;
    let s = 0;
    if (g === 'lose') s += (600 - n.kcal) / 40 + n.p / 10;
    else if (g === 'gain') s += n.kcal / 60;
    else if (g === 'muscle') s += n.p / 4;
    else s += 5;
    if (r.time > t) s -= 6;
    if (P().budget && n.cost * 21 * (P().people || 1) > P().budget) s -= 2;
    return s;
  }
  function slotRecipes(slot) {
    return RECIPES.filter(r => r.cat === slot || (r.cat === 'prep' && (r.sub || []).includes(slot)));
  }
  function pickFor(slot, seed, exclude) {
    const list = slotRecipes(slot).filter(recommendable).filter(r => !(exclude || []).includes(r.id));
    if (!list.length) return null;
    const scored = list.map(r => ({ r, s: goalScore(r) + (hash(seed + r.id) % 1000) / 160 })).sort((a, b) => b.s - a.s);
    return scored[0].r;
  }

  // ───────── Targets (estimates) ─────────
  function targets() {
    const p = P(); const out = { known: false, kcal: 2000, protein: null, explain: '' };
    if (!(p.age && p.height && p.weight)) { out.explain = 'Add your age, height and weight in your profile for a personal estimate. Until then we use a general 2 000 kcal reference.'; return out; }
    const sx = p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78;
    const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + sx;
    const mult = (ACTIVITY[p.activity] || ACTIVITY.light)[1];
    const tdee = bmr * mult;
    let adj = 0, why = 'maintenance';
    const teen = p.age < 18;
    if (p.goal === 'lose' && !teen) { adj = -500; why = 'a moderate deficit of about 500 kcal (roughly 0.25–0.5 kg per week)'; }
    if (p.goal === 'gain') { adj = 300; why = 'a gentle surplus of about 300 kcal'; }
    if (p.goal === 'muscle') { adj = 250; why = 'a small surplus of about 250 kcal to support muscle growth'; }
    const floor = p.sex === 'male' ? 1500 : 1200;
    let kcal = Math.round((tdee + adj) / 10) * 10;
    if (p.goal === 'lose' && kcal < floor) { kcal = floor; why += ', but we never go below ' + floor + ' kcal'; }
    const protein = Math.round(p.weight * (p.goal === 'muscle' ? 1.6 : p.goal === 'lose' ? 1.2 : 1.0));
    out.known = true; out.kcal = kcal; out.protein = protein; out.bmr = Math.round(bmr); out.tdee = Math.round(tdee);
    out.explain = 'Your body uses roughly ' + out.tdee.toLocaleString('en-ZA') + ' kcal a day (Mifflin–St Jeor formula × your activity level). Your target uses ' + why + '.';
    if (teen) out.explain += ' Because you are under 18, we do not set a calorie deficit. Please speak to a doctor or dietitian about weight goals.';
    if (p.goal === 'lose' && p.target && p.target < p.weight && !teen) {
      const diff = p.weight - p.target;
      out.timeline = 'At a sensible pace, reaching ' + p.target + ' kg could take roughly ' + Math.ceil(diff / 0.5) + '–' + Math.ceil(diff / 0.25) + ' weeks. Everyone is different, so treat this as a rough guide, not a promise.';
      const bmiT = p.target / Math.pow(p.height / 100, 2);
      if (bmiT < 18.5) out.timeline += ' Note: this target is below the healthy weight range for your height. Please discuss it with a doctor or dietitian.';
    }
    return out;
  }

  // ───────── Rendering helpers ─────────
  function rcard(r, opts) {
    opts = opts || {};
    const n = nut(r); const hits = allergyHits(r); const fav = S.saved.includes(r.id);
    return '<a class="rcard" href="#/recipe/' + r.id + '">' +
      '<div class="rimg ' + CATS[r.cat].g + '">' + r.e +
      (opts.slot ? '<span class="pill navy slot">' + esc(opts.slot) + '</span>' : '') +
      (fav ? '<span class="fav">❤️</span>' : '') + '</div>' +
      '<div class="rbody"><h3>' + esc(r.name) + '</h3>' +
      '<div class="meta"><span>🔥 <b>' + n.kcal + '</b> kcal</span><span>⏱ ' + r.time + ' min</span><span>💪 ' + n.p + ' g protein</span><span>≈ ' + money(n.cost) + '/serving</span></div>' +
      (hits.length ? '<div class="alert warn" style="margin:10px 0 0;padding:8px 12px">⚠️ Contains ' + esc(hits.join(', ')) + '</div>' : '') +
      '</div></a>';
  }
  function topbar(title, back) {
    return '<div class="topbar">' + (back ? '<button class="iconbtn" data-act="back" aria-label="Back">←</button>' : '<img class="logo-sm" src="icon.png" alt="">') + '<h1>' + esc(title) + '</h1></div>';
  }
  function ring(val, max) {
    const pct = Math.max(0, Math.min(1, max ? val / max : 0)); const C = 2 * Math.PI * 44;
    const over = val > max;
    return '<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#E8E4DA" stroke-width="10"/>' +
      '<circle cx="50" cy="50" r="44" fill="none" stroke="' + (over ? '#E8A33C' : '#8DC63F') + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (C * pct).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg>' +
      '<div class="lbl"><div><b>' + rnd(val) + '</b>of ' + max + ' kcal</div></div></div>';
  }
  function diaryToday() { return S.diary[todayKey()] || []; }
  function diaryTotals(list) { return list.reduce((a, e) => ({ kcal: a.kcal + (e.kcal || 0), p: a.p + (e.p || 0), c: a.c + (e.c || 0), f: a.f + (e.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 }); }

  // ───────── Screens ─────────
  const views = {};

  views.welcome = () => '<section class="ob welcome">' +
    '<img class="logo-lg" src="icon.png" alt="' + APP_NAME + ' logo">' +
    '<h1>Welcome to HealthyPlate</h1><div class="tag">Healthy eating, made simple, South African style.</div>' +
    '<p>Plan your week, cook delicious recipes with ingredients from your local supermarket, and stay within your budget.</p>' +
    '<div class="feat"><div><span>📷</span>Snap a photo of your plate for an instant calorie estimate</div>' +
    '<div><span>🍽️</span>Breakfast, lunch, supper and meal-prep recipes with calories worked out</div>' +
    '<div><span>🛒</span>Shopping lists with rand prices and store links: Checkers, Pick n Pay, Shoprite & more</div>' +
    '<div><span>🎯</span>Built around your goal: lose weight, build muscle, or simply eat better</div></div>' +
    '<p class="small">Let’s set up your plan. It takes less than a minute.</p>' +
    '<button class="btn block" data-act="startSetup">Get Started</button></section>';

  function setupShell(step, inner, opts) {
    const total = 6; const edit = isEdit();
    return '<section class="ob"><div class="row"><button class="iconbtn" data-act="back" aria-label="Back">←</button><div class="spacer"></div>' +
      (opts && opts.skip && !edit ? '<button class="linkbtn" data-act="setupNext" data-step="' + step + '">Skip</button>' : '') + '</div>' +
      '<div class="progress"><i style="width:' + (step / total * 100) + '%"></i></div><div class="grow">' + inner + '</div>' +
      '<div class="foot"><button class="btn block" data-act="setupNext" data-step="' + step + '" ' + (opts && opts.disabled ? 'disabled' : '') + '>' + (edit ? 'Save' : (step === total ? 'Start using HealthyPlate' : 'Continue')) + '</button></div></section>';
  }
  const D = () => (S.draft = S.draft || Object.assign({ people: 1, cookTime: 30, diets: [], allergies: [], dislikes: [], stores: [] }, S.profile || {}));
  function chipSet(field, options, multi, warn) {
    const cur = D()[field];
    return '<div class="chips wrapc">' + options.map(([v, l]) => {
      const on = multi ? (cur || []).includes(v) : cur === v;
      return '<button class="chip ' + (on ? (warn ? 'warnon' : 'on') : '') + '" data-act="pick" data-field="' + field + '" data-val="' + esc(v) + '" data-multi="' + (multi ? 1 : 0) + '">' + esc(l) + '</button>';
    }).join('') + '</div>';
  }
  views.setup = (step) => {
    step = +step || 1; const d = D();
    if (step === 1) return setupShell(1, '<h1>What is your main goal?</h1><p class="muted">We use it to choose recipes and portion sizes for you.</p>' +
      Object.entries(GOALS).map(([k, g]) => '<button class="choice ' + (d.goal === k ? 'on' : '') + '" data-act="pick" data-field="goal" data-val="' + k + '" data-multi="0"><span class="ce">' + g.e + '</span><span><b>' + g.n + '</b><small>' + g.d + '</small></span></button>').join(''), { disabled: !d.goal });
    if (step === 2) return setupShell(2, '<h1>About you</h1><p class="muted">Used only to estimate your daily calories. Stored on this phone only.</p>' +
      '<label class="f">First name (for your greeting)</label><input class="in" data-bind="name" value="' + esc(d.name || '') + '" placeholder="e.g. Thandi" autocomplete="given-name">' +
      '<div class="two"><div><label class="f">Age</label><input class="in" type="number" inputmode="numeric" data-bind="age" data-num="1" value="' + esc(d.age || '') + '" placeholder="years"></div>' +
      '<div><label class="f">Height (cm)</label><input class="in" type="number" inputmode="numeric" data-bind="height" data-num="1" value="' + esc(d.height || '') + '" placeholder="e.g. 168"></div></div>' +
      '<div class="two"><div><label class="f">Current weight (kg)</label><input class="in" type="number" inputmode="decimal" data-bind="weight" data-num="1" value="' + esc(d.weight || '') + '" placeholder="e.g. 72"></div>' +
      '<div><label class="f">Target weight (optional)</label><input class="in" type="number" inputmode="decimal" data-bind="target" data-num="1" value="' + esc(d.target || '') + '" placeholder="kg"></div></div>' +
      '<label class="f">Sex (for the calorie formula, optional)</label>' + chipSet('sex', [['female', 'Female'], ['male', 'Male'], ['', 'Prefer not to say']], false) +
      '<label class="f">How active are you?</label>' + chipSet('activity', Object.entries(ACTIVITY).map(([k, v]) => [k, v[0]]), false), { skip: true });
    if (step === 3) return setupShell(3, '<h1>Dietary preferences</h1><p class="muted">Choose any that apply. You can change this later.</p>' + chipSet('diets', DIETS, true), { skip: true });
    if (step === 4) return setupShell(4, '<h1>Allergies & dislikes</h1>' +
      '<div class="alert info">We take allergies seriously. Recipes containing your allergens are flagged in red and are never recommended. Always check product labels too.</div>' +
      '<label class="f">Allergies & intolerances</label>' + chipSet('allergies', ALLERGENS.map(a => [a[0], a[2] + ' ' + a[1]]), true, true) +
      '<input class="in" data-bind="allergyOther" value="' + esc(d.allergyOther || '') + '" placeholder="Other allergies, comma separated">' +
      '<label class="f">Foods you dislike</label>' + chipSet('dislikes', DISLIKE_SUGGEST.map(x => [x, x]), true) +
      '<input class="in" data-bind="dislikeOther" value="' + esc(d.dislikeOther || '') + '" placeholder="Anything else? e.g. coriander, olives">', { skip: true });
    if (step === 5) return setupShell(5, '<h1>Your kitchen & budget</h1>' +
      '<label class="f">Preferred cooking time</label>' + chipSet('cookTime', [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour+']], false) +
      '<label class="f">How many people do you cook for?</label><div class="stepper"><button data-act="people" data-d="-1" aria-label="Fewer">−</button><span>' + (d.people || 1) + '</span><button data-act="people" data-d="1" aria-label="More">+</button></div>' +
      '<label class="f">Weekly food budget (R)</label><input class="in" type="number" inputmode="numeric" data-bind="budget" data-num="1" value="' + esc(d.budget || '') + '" placeholder="e.g. 800">' +
      '<div class="chips">' + [400, 600, 800, 1200, 1800].map(v => '<button class="chip ' + (d.budget === v ? 'on' : '') + '" data-act="pick" data-field="budget" data-val="' + v + '" data-multi="0">R' + v + '</button>').join('') + '</div>' +
      '<label class="f">Where do you usually shop?</label>' + chipSet('stores', STORES.map(s => [s.id, s.n]), true), { skip: true });
    const t = (function () { const keep = S.profile; S.profile = d; const x = targets(); S.profile = keep; return x; })();
    return setupShell(6, '<h1>Your plan is ready' + (d.name ? ', ' + esc(d.name) : '') + ' 🎉</h1>' +
      '<div class="card"><div class="pill">' + (GOALS[d.goal] || GOALS.healthier).e + ' ' + (GOALS[d.goal] || GOALS.healthier).n + '</div>' +
      '<h2 class="mt">≈ ' + t.kcal.toLocaleString('en-ZA') + ' kcal per day</h2>' + (t.protein ? '<p><b>Protein:</b> about ' + t.protein + ' g per day</p>' : '') +
      '<p class="muted">' + esc(t.explain) + '</p>' + (t.timeline ? '<p class="muted">' + esc(t.timeline) + '</p>' : '') + '</div>' +
      '<p class="disclaimer">All calorie targets and nutrition values are estimates for general guidance only. HealthyPlate does not give medical advice or diagnoses. If you have a medical condition, are pregnant, or are under 18, please speak to a doctor or registered dietitian before changing your diet.</p>');
  };

  views.home = () => {
    const p = P(); const g = GOALS[p.goal] || GOALS.healthier; const t = targets();
    const tot = diaryTotals(diaryToday()); const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const seed = todayKey(); const used = [];
    const ideas = SLOTS.map(([k, l]) => { const r = pickFor(k, seed + k, used); if (r) used.push(r.id); return r ? rcard(r, { slot: l }) : ''; }).join('');
    const tiles = [['#/cat/breakfast', 'Breakfast', '🍳', 'g-breakfast'], ['#/cat/lunch', 'Lunch', '🥗', 'g-lunch'], ['#/cat/supper', 'Supper', '🍲', 'g-supper'], ['#/cat/prep', 'Meal Prep', '🍱', 'g-prep'], ['#/plan', 'My Meal Plan', '📅', 'g-plan'], ['#/shop', 'Shopping List', '🛒', 'g-shop'], ['#/saved', 'Saved Recipes', '❤️', 'g-saved'], ['#/notes', 'My Notes', '📝', 'g-notes'], ['#/profile', 'Profile & Settings', '⚙️', 'g-profile']];
    return '<div class="hello"><div class="row"><div class="spacer"><p class="muted" style="margin:0">' + greet + (p.name ? ',' : '') + '</p><h1>' + (p.name ? esc(p.name) : 'Welcome back') + ' 👋</h1></div><img class="logo-sm" src="icon.png" alt=""></div>' +
      '<span class="pill">' + g.e + ' Goal: ' + g.n + '</span>' + (S.premium ? ' <span class="pill navy">★ Premium</span>' : '') + '</div>' +
      '<div class="wrap">' +
      '<form class="search" data-form="search" role="search"><span>🔍</span><input name="q" placeholder="Search recipes, ingredients, cuisines…" enterkeyhint="search" aria-label="Search recipes"></form>' +
      '<a class="card today-card mt" href="#/today" style="text-decoration:none;color:inherit">' + ring(tot.kcal, t.kcal) + '<div><h3>Today</h3><p class="muted small" style="margin:0 0 4px">Protein ' + rnd(tot.p) + (t.protein ? ' / ' + t.protein : '') + ' g · Carbs ' + rnd(tot.c) + ' g · Fat ' + rnd(tot.f) + ' g</p><span class="linkbtn">View food diary →</span></div></a>' +
      '<div class="quick"><a class="btn" href="#/scan">📷 Snap calories</a><button class="btn navy" data-act="surprise">🎲 Surprise Me</button></div>' +
      '<div class="grid3">' + tiles.map(([h2, n, e, gc]) => '<a class="tile ' + gc + '" href="' + h2 + '"><span class="te">' + e + '</span><b>' + n + '</b></a>').join('') + '</div>' +
      '<div class="section-h"><h2>Today’s Meal Ideas</h2><a class="small" href="#/plan">Plan week →</a></div>' +
      (ideas ? '<div class="hscroll">' + ideas + '</div>' : '<div class="card muted">No recipes match all your preferences yet. Try relaxing a dietary filter in your profile.</div>') +
      '</div>';
  };

  let catFilter = {};
  views.cat = (cat) => {
    const c = CATS[cat]; if (!c) return views.home();
    const subs = cat === 'breakfast' ? SUBS.breakfast : SUBS.other;
    const f = catFilter[cat] || 'all';
    const list = RECIPES.filter(r => r.cat === cat && filterOk(r, f)).sort((a, b) => (allergyHits(a).length - allergyHits(b).length) || (recommendable(b) - recommendable(a)) || (goalScore(b) - goalScore(a)));
    return topbar(c.n, true) + '<div class="wrap">' +
      '<div class="chips">' + subs.map(([k, l]) => '<button class="chip ' + (f === k ? 'on' : '') + '" data-act="catFilter" data-cat="' + cat + '" data-val="' + k + '">' + l + '</button>').join('') + '</div>' +
      '<p class="muted small">' + list.length + ' recipe' + (list.length === 1 ? '' : 's') + ' · sorted for your goal</p>' +
      (list.length ? '<div class="list2">' + list.map(r => rcard(r)).join('') + '</div>' : '<div class="empty-state"><div class="big">🍽️</div><p>No recipes in this filter yet.</p></div>') + '</div>';
  };

  let servings = {};
  views.recipe = (id) => {
    const r = RBY[id]; if (!r) return views.home();
    const n = nut(r); const hits = allergyHits(r); const dis = dislikeHits(r); const fav = S.saved.includes(r.id);
    const sv = servings[id] || P().people || r.serves; const scale = sv / r.serves;
    const t = targets();
    return '<div class="hero ' + CATS[r.cat].g + '">' + r.e +
      '<button class="iconbtn back" data-act="back" aria-label="Back">←</button>' +
      '<button class="iconbtn favbtn" data-act="fav" data-id="' + r.id + '" aria-label="Save recipe">' + (fav ? '❤️' : '🤍') + '</button></div>' +
      '<div class="detail"><div class="wrap">' +
      '<span class="pill">' + CATS[r.cat].e + ' ' + CATS[r.cat].n + ' · ' + esc(r.cuisine) + '</span>' +
      '<h1 class="mt">' + esc(r.name) + '</h1><p class="muted">' + esc(r.desc) + '</p>' +
      (hits.length ? '<div class="alert warn"><b>⚠️ Allergy warning:</b> this recipe contains <b>' + esc(hits.join(', ')) + '</b>, which is in your allergy list. We won’t recommend it. Only make it if you can safely replace these ingredients, and check every product label.</div>' : '') +
      (dis.length ? '<div class="alert info">Contains something you dislike: ' + esc(dis.join(', ')) + '</div>' : '') +
      '<div class="stats"><div><b>' + n.kcal + '</b><span>kcal</span></div><div><b>' + n.p + 'g</b><span>protein</span></div><div><b>' + n.c + 'g</b><span>carbs</span></div><div><b>' + n.f + 'g</b><span>fat</span></div></div>' +
      '<p class="muted small center mt">Per serving · estimated from the ingredient quantities' + (t.known ? ' · ' + Math.round(n.kcal / t.kcal * 100) + '% of your daily target' : '') + '</p>' +
      '<div class="card"><div class="row wrapr"><span>⏱ <b>' + r.time + ' min</b></span><span class="spacer"></span><span>≈ <b>' + money(n.cost) + '</b> per serving</span></div>' +
      '<div class="row mt"><b>Servings</b><span class="spacer"></span><div class="stepper"><button data-act="serv" data-id="' + id + '" data-d="-1" aria-label="Fewer servings">−</button><span>' + sv + '</span><button data-act="serv" data-id="' + id + '" data-d="1" aria-label="More servings">+</button></div></div></div>' +
      '<div class="actions"><button class="btn" data-act="addPlan" data-id="' + id + '">📅 Add to plan</button><button class="btn soft" data-act="logRecipe" data-id="' + id + '">✅ I ate this</button></div>' +
      '<div class="section-h"><h2>Ingredients</h2><button class="linkbtn" data-act="addToList" data-id="' + id + '">+ Shopping list</button></div>' +
      '<div class="card">' + r.ing.map(([iid, g]) => {
        const i = ING[iid]; const flag = (P().allergies || []).filter(a => i.t.includes(a));
        return '<div class="ing"><div class="q">' + esc(fmtQty(iid, g * scale)) + (flag.length ? ' <span class="flag">⚠️ ' + esc(flag.join(', ')) + '</span>' : '') + '<br><span class="price">≈ ' + money(i.r * g * scale / 1000) + '</span></div>' +
          '<button class="storebtn" data-act="where" data-ing="' + iid + '">Where to buy</button></div>';
      }).join('') +
      '<p class="small muted mt">Total ≈ <b>' + money(n.total * scale) + '</b> for ' + sv + ' serving' + (sv > 1 ? 's' : '') + '. Prices are estimates; specials change weekly.</p></div>' +
      '<h2 class="mt">Method</h2><ol class="steps">' + r.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
      '<p class="disclaimer">Nutrition is estimated from standard food values; brands and portion sizes vary. Packaged foods (bread, stock cubes, sauces) can contain hidden allergens, so always read labels.</p>' +
      '</div></div>';
  };

  views.search = () => {
    const q = decodeURIComponent((curRoute().split('?q=')[1] || '').replace(/\+/g, ' '));
    return topbar('Search', true) + '<div class="wrap"><div class="search"><span>🔍</span><input id="sq" value="' + esc(q) + '" placeholder="Name, ingredient, cuisine, “vegan”…" autofocus aria-label="Search"></div>' +
      '<div class="chips mt">' + ['Chicken', 'Vegan', 'High protein', 'Budget', 'Oats', 'Curry', 'South African', 'Low carb'].map(s => '<button class="chip" data-act="quickSearch" data-val="' + s + '">' + s + '</button>').join('') + '</div>' +
      '<div id="results" class="mt">' + searchResults(q) + '</div></div>';
  };
  function searchResults(q) {
    q = (q || '').toLowerCase().trim(); if (!q) return '<p class="muted">Try “chicken”, “vegan”, “oats” or “South African”.</p>';
    const words = q.split(/\s+/);
    const list = RECIPES.filter(r => {
      const n = nut(r);
      const hay = [r.name, r.cuisine, r.desc, CATS[r.cat].n, (r.sub || []).join(' '), r.ing.map(([i]) => ING[i].n).join(' '),
        dietOk(r, ['vegan']) ? 'vegan plant' : '', dietOk(r, ['vegetarian']) ? 'vegetarian' : '', n.p >= 25 ? 'high protein high-protein' : '', n.c <= 30 ? 'low carb lower-carb' : '',
        !n.tags.has('gluten') ? 'gluten free gluten-free' : '', !n.tags.has('dairy') ? 'dairy free dairy-free' : '', filterOk(r, 'budget') ? 'budget cheap' : '', filterOk(r, 'quick') ? 'quick fast' : ''].join(' ').toLowerCase();
      return words.every(w => hay.includes(w.replace(/s$/, '')));
    });
    return list.length ? '<p class="muted small">' + list.length + ' result' + (list.length > 1 ? 's' : '') + '</p><div class="list2">' + list.map(r => rcard(r)).join('') + '</div>' : '<div class="empty-state"><div class="big">🔎</div><p>No recipes found for “' + esc(q) + '”.</p></div>';
  }

  views.plan = () => {
    const ti = todayIdx(); let weekKcal = 0, weekCost = 0; const people = P().people || 1;
    const days = DAYS.map((dn, di) => {
      const day = S.plan[di] || {}; let dk = 0;
      const slots = SLOTS.map(([k, l, e]) => {
        const r = RBY[day[k]];
        if (r) { const n = nut(r); dk += n.kcal; weekCost += n.cost * people; }
        return r ? '<div class="slot"><a class="se ' + CATS[r.cat].g + '" href="#/recipe/' + r.id + '">' + r.e + '</a><a class="st" href="#/recipe/' + r.id + '" style="text-decoration:none;color:inherit"><small>' + l + '</small><b>' + esc(r.name) + '</b></a><span class="small muted">' + nut(r).kcal + '</span><button class="xbtn" data-act="clearSlot" data-day="' + di + '" data-slot="' + k + '" aria-label="Remove">✕</button></div>'
          : '<button class="slot empty" style="width:100%;text-align:left" data-act="chooseSlot" data-day="' + di + '" data-slot="' + k + '"><span class="se" style="background:var(--green-soft)">' + e + '</span><span class="st"><small>' + l + '</small><b class="muted">+ Add a meal</b></span></button>';
      }).join('');
      weekKcal += dk;
      return '<div class="day"><h3>' + dn + (di === ti ? ' <span class="pill" style="font-size:12px">Today</span>' : '') + '<span class="small muted">' + (dk ? dk + ' kcal' : '') + '</span></h3>' + slots + '</div>';
    }).join('');
    const filled = Object.values(S.plan).reduce((a, d) => a + Object.values(d || {}).filter(Boolean).length, 0);
    const t = targets();
    return topbar('My Meal Plan', false) + '<div class="wrap">' +
      '<div class="card"><div class="row wrapr"><div class="spacer"><b>' + filled + '/21</b> meals planned<br><span class="small muted">≈ ' + money(weekCost) + ' for ' + people + ' ' + (people > 1 ? 'people' : 'person') + (P().budget ? ' · budget R' + P().budget : '') + '</span></div></div>' +
      '<p class="small muted" style="margin:8px 0 0">These three meals give about ' + (filled ? Math.round(weekKcal / 7) : 0) + ' kcal/day on average. Your target is ≈ ' + t.kcal + ' kcal, so use snacks to fill the gap.</p>' +
      '<div class="actions mt"><button class="btn" data-act="autoPlan">✨ Auto-fill week</button><button class="btn soft" data-act="planToList">🛒 Make shopping list</button></div>' +
      (filled ? '<button class="linkbtn" data-act="clearPlan">Clear the whole week</button>' : '') + '</div>' + days + '</div>';
  };

  views.shop = () => {
    const items = S.shopping; const people = P().people || 1;
    const groups = {}; let total = 0, left = 0;
    items.forEach((it, ix) => {
      const a = it.ing ? ING[it.ing].a : 'other'; (groups[a] = groups[a] || []).push([it, ix]);
      if (it.ing) { const c = ING[it.ing].r * it.g / 1000; total += c; if (!it.checked) left += c; }
    });
    const budget = P().budget;
    return topbar('Shopping List', false) + '<div class="wrap">' +
      '<div class="card"><div class="budget"><span>Estimated total</span><span>' + money(total) + '</span></div>' +
      (budget ? '<div class="bar mt"><i style="width:' + Math.min(100, total / budget * 100) + '%;background:' + (total > budget ? '#E8A33C' : '#8DC63F') + '"></i></div><p class="small muted" style="margin:6px 0 0">' + (total > budget ? 'About ' + money(total - budget) + ' over' : money(budget - total) + ' under') + ' your weekly budget of R' + budget + '. Still to buy: ' + money(left) + '.</p>' : '<p class="small muted" style="margin:6px 0 0">Add a weekly budget in your profile to track spending.</p>') +
      '<div class="actions mt"><button class="btn soft sm" data-act="planToList">🔄 From meal plan</button><button class="btn ghost sm" data-act="storeGuide">💡 Cheapest stores</button></div></div>' +
      '<form class="row mb" data-form="addItem"><input class="in" name="item" placeholder="Add an item (e.g. dishwashing liquid)" aria-label="Add item"><button class="btn sm" style="min-height:50px">Add</button></form>' +
      (items.length ? Object.keys(AISLES).filter(a => groups[a]).map(a => '<div class="card"><h3>' + AISLES[a] + '</h3>' + groups[a].map(([it, ix]) =>
        '<div class="shop-item ' + (it.checked ? 'done' : '') + '"><input type="checkbox" data-act="check" data-ix="' + ix + '" ' + (it.checked ? 'checked' : '') + ' aria-label="Bought">' +
        '<div class="nm">' + (it.ing ? esc(fmtQty(it.ing, it.g)) + '<br><span class="small muted">≈ ' + money(ING[it.ing].r * it.g / 1000) + '</span>' : esc(it.name)) + '</div>' +
        (it.ing ? '<button class="storebtn" data-act="where" data-ing="' + it.ing + '">Buy</button>' : '') +
        '<button class="xbtn" data-act="delItem" data-ix="' + ix + '" aria-label="Remove">✕</button></div>').join('') + '</div>').join('') +
        '<div class="row"><button class="linkbtn" data-act="clearChecked">Remove ticked items</button><span class="spacer"></span><button class="linkbtn" style="color:var(--warn)" data-act="clearList">Clear list</button></div>'
        : '<div class="empty-state"><div class="big">🛒</div><p>Your list is empty. Plan some meals, then tap “From meal plan”, or add ingredients from any recipe.</p></div>') +
      '<p class="disclaimer">Quantities are for ' + people + ' ' + (people > 1 ? 'people' : 'person') + '. Prices are estimates based on typical South African supermarket prices and will differ by store, brand and week.</p></div>';
  };

  views.saved = () => {
    const list = S.saved.map(id => RBY[id]).filter(Boolean);
    return topbar('Saved Recipes', true) + '<div class="wrap">' + (list.length ? '<div class="list2">' + list.map(r => rcard(r)).join('') + '</div>' : '<div class="empty-state"><div class="big">❤️</div><p>Tap the heart on any recipe to save it here.</p><a class="btn" href="#/home">Browse recipes</a></div>') + '</div>';
  };

  views.notes = () => (S.notes = S.notes.filter(n => n.title || n.body), topbar('My Notes', true)) + '<div class="wrap"><a class="btn block mb" href="#/note/new">+ New note</a>' +
    (S.notes.length ? S.notes.slice().sort((a, b) => b.updated - a.updated).map(n => '<a class="card note" href="#/note/' + n.id + '"><h3>' + esc(n.title || 'Untitled note') + '</h3><p>' + esc(n.body || '') + '</p><span class="small muted">' + new Date(n.updated).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) + '</span></a>').join('')
      : '<div class="empty-state"><div class="big">📝</div><p>Keep cooking tips, recipe tweaks, weigh-ins or shopping reminders here.</p></div>') + '</div>';
  views.note = (id) => {
    let n = S.notes.find(x => x.id === id);
    if (!n) { n = { id: uid(), title: '', body: '', updated: Date.now() }; S.notes.push(n); save(); replaceRoute('/note/' + n.id); }
    return topbar('Note', true) + '<div class="wrap"><input class="in mb" data-note="' + n.id + '" data-field="title" value="' + esc(n.title) + '" placeholder="Title"><textarea class="in" data-note="' + n.id + '" data-field="body" placeholder="Write your note…">' + esc(n.body) + '</textarea>' +
      '<p class="small muted">Saved automatically.</p><button class="btn danger block" data-act="delNote" data-id="' + n.id + '">Delete note</button></div>';
  };

  views.today = () => {
    const list = diaryToday(); const tot = diaryTotals(list); const t = targets();
    const bar = (l, v, max, unit) => '<div class="macro"><span>' + l + '</span><div class="bar"><i style="width:' + (max ? Math.min(100, v / max * 100) : 0) + '%"></i></div><span class="small">' + rnd(v) + (max ? '/' + max : '') + unit + '</span></div>';
    return topbar('Food Diary · Today', true) + '<div class="wrap"><div class="card today-card">' + ring(tot.kcal, t.kcal) + '<div class="spacer">' +
      bar('Protein', tot.p, t.protein, 'g') + bar('Carbs', tot.c, 0, 'g') + bar('Fat', tot.f, 0, 'g') + '</div></div>' +
      '<p class="small muted">' + (tot.kcal > t.kcal ? 'You’re about ' + rnd(tot.kcal - t.kcal) + ' kcal over today’s estimate. That’s fine now and then; it averages out over the week.' : 'About ' + rnd(t.kcal - tot.kcal) + ' kcal left for today (estimate).') + '</p>' +
      '<div class="actions mb"><a class="btn" href="#/scan">📷 Scan a meal</a><button class="btn soft" data-act="manualLog">✍️ Add manually</button></div>' +
      (list.length ? '<div class="card">' + list.map(e => '<div class="food-row"><div><b>' + esc(e.name) + '</b><br><span class="small muted">' + (e.src === 'scan' ? '📷 Photo estimate' : e.src === 'recipe' ? '🍽️ Recipe' : '✍️ Manual') + ' · ' + new Date(e.at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) + '</span></div><div class="row"><b>' + rnd(e.kcal) + ' kcal</b><button class="xbtn" data-act="delDiary" data-id="' + e.id + '" aria-label="Remove">✕</button></div></div>').join('') + '</div>'
        : '<div class="empty-state"><div class="big">🍽️</div><p>Nothing logged yet today.</p></div>') + '</div>';
  };

  // Photo scanner
  let scan = { img: null, loading: false, result: null, error: null, mult: 1, demo: false };
  function scansLeft() { if (S.premium) return Infinity; if (S.scans.date !== todayKey()) return FREE_SCANS_PER_DAY; return Math.max(0, FREE_SCANS_PER_DAY - S.scans.count); }
  views.scan = () => {
    const left = scansLeft();
    let body = '';
    if (!scan.img) {
      body = '<label class="scan-drop" style="display:block"><div class="big">📷</div><h2>Snap your plate</h2><p class="muted">Take a clear photo from above, with the whole plate in view, in good light.</p><span class="btn">Take or choose a photo</span>' +
        '<input id="photo" type="file" accept="image/*" capture="environment" hidden></label>' +
        '<p class="small muted center mt">' + (left === Infinity ? '★ Premium: unlimited scans' : left + ' of ' + FREE_SCANS_PER_DAY + ' free scans left today') + '</p>' +
        (window.HP_EMBED ? '<div class="alert info">In this browser preview, photo scanning runs in demo mode. Real scans work in the Android app. <button class="linkbtn" data-act="demoScan">Try a demo result</button></div>' : !S.apiKey ? '<div class="alert info">The AI scanner isn’t connected yet. Add your scanner key under <a href="#/profile">Profile → Photo scanner</a>, or <button class="linkbtn" data-act="demoScan">try a demo result</button>.</div>' : '');
    } else {
      body = '<img class="scan-img" src="' + scan.img + '" alt="Your meal photo">';
      if (scan.loading) body += '<div class="card center"><div class="spinner"></div><p>Analysing your meal…</p></div>';
      else if (scan.error) body += '<div class="alert warn mt"><b>Couldn’t analyse this photo.</b><br>' + esc(scan.error) + '</div><div class="actions"><button class="btn" data-act="rescan">Try again</button><button class="btn ghost" data-act="resetScan">New photo</button></div>';
      else if (scan.result) body += scanResultHtml();
    }
    return topbar('Calorie Scanner', true) + '<div class="wrap">' + body +
      '<p class="disclaimer">Photo calories are AI estimates and can’t be exact. Portion size, oil, sauces and hidden ingredients are hard to see in a photo. Use the portion slider to adjust. Not medical advice.</p></div>';
  };
  function scanResultHtml() {
    const r = scan.result; const m = scan.mult;
    if (r.is_food === false || !(r.items || []).length) return '<div class="alert info mt">We couldn’t spot any food in this photo. Try again with the plate centred and well lit.</div><button class="btn block" data-act="resetScan">Take another photo</button>';
    const tot = r.total || diaryTotals((r.items || []).map(i => ({ kcal: i.kcal, p: i.protein_g, c: i.carbs_g, f: i.fat_g })));
    const kcal = (tot.kcal || 0) * m;
    const al = new Set((r.possible_allergens || []).map(x => String(x).toLowerCase()));
    const KW = { dairy: ['cheese', 'milk', 'yoghurt', 'yogurt', 'cream', 'butter'], egg: ['egg'], gluten: ['bread', 'pasta', 'wheat', 'roti', 'vetkoek', 'pastry', 'batter', 'crumbed', 'noodle', 'bun', 'wrap'], peanuts: ['peanut'], nuts: ['almond', 'cashew', 'walnut', 'pecan', 'macadamia', 'pistachio', 'hazelnut'], soy: ['soy', 'tofu'], fish: ['fish', 'hake', 'tuna', 'salmon', 'pilchard', 'snoek', 'sardine'], shellfish: ['prawn', 'shrimp', 'crab', 'mussel', 'calamari', 'lobster', 'oyster'], sesame: ['sesame', 'tahini', 'hummus'] };
    (r.items || []).forEach(i => { const nm = String(i.name || '').toLowerCase(); Object.entries(KW).forEach(([a, ws]) => { if (ws.some(w => nm.includes(w))) al.add(a); }); });
    const mine = (P().allergies || []).filter(a => al.has(a)).map(a => ALLERGENS.find(x => x[0] === a)[1]);
    return '<div class="card mt">' + (scan.demo ? '<span class="pill amber">Demo result</span>' : '') +
      '<h2 class="mt">' + esc(r.meal_name || 'Your meal') + '</h2>' +
      '<div class="stats"><div><b>' + rnd(kcal) + '</b><span>kcal</span></div><div><b>' + rnd((tot.protein_g || tot.p || 0) * m) + 'g</b><span>protein</span></div><div><b>' + rnd((tot.carbs_g || tot.c || 0) * m) + 'g</b><span>carbs</span></div><div><b>' + rnd((tot.fat_g || tot.f || 0) * m) + 'g</b><span>fat</span></div></div>' +
      '<p class="small muted center mt">Confidence: <b>' + esc(r.confidence || 'medium') + '</b>' + (r.notes ? ' · ' + esc(r.notes) : '') + '</p>' +
      (mine.length ? '<div class="alert warn"><b>⚠️ Possible allergen:</b> this meal may contain ' + esc(mine.join(', ')) + ', which is on your allergy list. A photo can’t confirm ingredients, so please check before eating.</div>' : '') +
      '<label class="f">Portion: ' + (m === 1 ? 'as pictured' : Math.round(m * 100) + '%') + '</label><input type="range" min="0.25" max="2" step="0.25" value="' + m + '" data-act-input="mult" aria-label="Portion size">' +
      '<h3 class="mt">What we see</h3>' + r.items.map(i => '<div class="food-row"><div><b>' + esc(i.name) + '</b><br><span class="small muted">' + esc(i.portion || (i.grams ? rnd(i.grams * m) + ' g' : '')) + '</span></div><b>' + rnd((i.kcal || 0) * m) + ' kcal</b></div>').join('') + '</div>' +
      '<div class="actions"><button class="btn" data-act="logScan">✅ Add to today</button><button class="btn ghost" data-act="resetScan">New photo</button></div>';
  }
  const SCAN_PROMPT = 'You are a nutrition estimation assistant inside a South African healthy-eating app. Look at this photo of food and estimate what is on the plate. Recognise South African foods (e.g. pap, boerewors, chakalaka, bunny chow, vetkoek, biltong, bobotie, samoosas, gatsby, koeksisters) as well as general foods. Estimate realistic portion weights and include likely hidden cooking oil and sauces. Respond with ONLY a JSON object, no other text, in exactly this shape: {"is_food": true, "meal_name": "short name", "items": [{"name": "food item", "portion": "e.g. 1 cup (180 g)", "grams": 180, "kcal": 230, "protein_g": 5, "carbs_g": 45, "fat_g": 2}], "total": {"kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}, "confidence": "low|medium|high", "possible_allergens": ["dairy","egg","gluten","peanuts","nuts","soy","fish","shellfish","sesame"], "notes": "one short sentence on what most affects accuracy"}. Only list allergens that are plausibly present. If the image does not contain food, return {"is_food": false, "items": []}.';
  async function runScan() {
    if (!scan.img) return;
    if (scansLeft() <= 0) { go('/premium'); toast('You’ve used today’s free scans'); return; }
    if (!S.apiKey) { scan.error = 'The scanner isn’t connected. Add a scanner key in Profile → Photo scanner.'; render(); return; }
    scan.loading = true; scan.error = null; scan.result = null; scan.demo = false; render();
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': S.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: S.model || DEFAULT_MODEL, max_tokens: 1500, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: scan.img.split(',')[1] } }, { type: 'text', text: SCAN_PROMPT }] }] }),
      });
      if (!res.ok) { let msg = 'Error ' + res.status; try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch (e) { /* ignore */ } throw new Error(msg); }
      const j = await res.json();
      const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('The result could not be read. Please try again.');
      scan.result = JSON.parse(m[0]); scan.mult = 1;
      if (S.scans.date !== todayKey()) S.scans = { date: todayKey(), count: 0 };
      S.scans.count++; save();
    } catch (e) {
      scan.error = (e && e.message) || 'Network problem. Check your internet connection.';
    }
    scan.loading = false; if (curRoute().startsWith('/scan')) render();
  }
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => { const s = Math.min(1, 1024 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.85)); };
      img.onerror = () => reject(new Error('Could not open that image'));
      img.src = url;
    });
  }

  views.profile = () => {
    const p = P(); const t = targets(); const g = GOALS[p.goal] || GOALS.healthier;
    const row = (label, val, step) => '<div class="food-row"><div><span class="small muted">' + label + '</span><br><b>' + (val || '<span class="muted">Not set</span>') + '</b></div><a class="storebtn" style="text-decoration:none;align-self:center" href="#/setup/' + step + '?edit">Edit</a></div>';
    const names = (arr, src) => (arr || []).map(v => (src.find(x => x[0] === v) || [v, v])[1]).join(', ');
    return topbar('Profile & Settings', false) + '<div class="wrap">' +
      '<div class="card">' + row('Name', esc(p.name), 2) + row('Goal', g.e + ' ' + g.n, 1) +
      row('Body', [p.age && p.age + ' yrs', p.height && p.height + ' cm', p.weight && p.weight + ' kg', p.target && '→ ' + p.target + ' kg'].filter(Boolean).join(' · '), 2) +
      row('Dietary preferences', esc(names(p.diets, DIETS)), 3) +
      row('Allergies', esc([names(p.allergies, ALLERGENS), p.allergyOther].filter(Boolean).join(', ')), 4) +
      row('Dislikes', esc([(p.dislikes || []).join(', '), p.dislikeOther].filter(Boolean).join(', ')), 4) +
      row('Cooking', (p.cookTime ? (p.cookTime >= 60 ? '1 hour+' : p.cookTime + ' min') : '') + ' · ' + (p.people || 1) + ' ' + ((p.people || 1) > 1 ? 'people' : 'person') + (p.budget ? ' · R' + p.budget + '/week' : ''), 5) +
      row('Stores', esc((p.stores || []).map(s => (STORES.find(x => x.id === s) || {}).n).filter(Boolean).join(', ')), 5) + '</div>' +
      '<div class="card"><h3>Your daily estimate</h3><h2>≈ ' + t.kcal.toLocaleString('en-ZA') + ' kcal' + (t.protein ? ' · ' + t.protein + ' g protein' : '') + '</h2><p class="small muted">' + esc(t.explain) + '</p>' + (t.timeline ? '<p class="small muted">' + esc(t.timeline) + '</p>' : '') + '</div>' +
      '<a class="card" href="#/premium" style="display:block;text-decoration:none;color:inherit;background:linear-gradient(135deg,#15243F,#2A4A7A);color:#fff"><h3 style="color:#fff">' + (S.premium ? '★ Premium active' : '★ Go Premium') + '</h3><p style="margin:0;color:#DCE3EE">' + (S.premium ? 'Thanks for supporting HealthyPlate. Manage your subscription.' : 'Unlimited photo scans, auto meal plans and more.') + '</p></a>' +
      '<div class="card"><h3>📷 Photo scanner</h3><p class="small muted">The calorie scanner uses an AI vision service. For testing, paste your Claude API key here. It is stored only on this phone. Before launch this should move to a secure Fusion Labs server.</p>' +
      '<label class="f">Scanner key</label><input class="in" type="password" data-setting="apiKey" value="' + esc(S.apiKey) + '" placeholder="sk-ant-…" autocomplete="off">' +
      '<label class="f">AI model</label><input class="in" data-setting="model" value="' + esc(S.model || DEFAULT_MODEL) + '"></div>' +
      '<div class="card"><h3>Data</h3><p class="small muted">Everything is stored privately on this phone.</p><button class="btn danger block" data-act="reset">Reset app & delete my data</button></div>' +
      '<p class="disclaimer center">' + APP_NAME + ' v1.0 · by Fusion Labs<br>Nutrition values and calorie targets are estimates for general guidance and are not medical advice.</p></div>';
  };

  let premPlan = 'year';
  views.premium = () => topbar('HealthyPlate Premium', true) + '<div class="wrap">' +
    '<div class="card center" style="background:linear-gradient(135deg,#15243F,#2A4A7A);color:#fff"><img class="logo-sm" style="width:64px;height:64px;border-radius:16px" src="icon.png" alt=""><h1 class="mt" style="color:#fff">Eat well, effortlessly</h1><p style="color:#DCE3EE">Everything you need to reach your goal.</p></div>' +
    '<div class="card"><ul class="checklist"><li>Unlimited photo calorie scans</li><li>Auto-fill your weekly meal plan</li><li>Shopping lists with budget tracking</li><li>New South African recipes every month</li><li>Priority support from Fusion Labs</li></ul></div>' +
    (S.premium ? '<div class="alert ok"><b>★ Premium is active</b> (test mode).</div><button class="btn ghost block" data-act="premiumOff">Turn off test premium</button>' :
      '<button class="plan-opt ' + (premPlan === 'year' ? 'on' : '') + '" data-act="premPlan" data-val="year"><span class="spacer"><b>Yearly</b> <span class="pill">Save 32%</span><br><span class="small muted">R399 per year (≈ R33/month)</span></span><span class="price-big">R399</span></button>' +
      '<button class="plan-opt ' + (premPlan === 'month' ? 'on' : '') + '" data-act="premPlan" data-val="month"><span class="spacer"><b>Monthly</b><br><span class="small muted">Cancel anytime</span></span><span class="price-big">R49</span></button>' +
      '<button class="btn block" data-act="premiumOn">Start 7-day free trial</button><p class="small muted center mt">Test version: no payment is taken. Google Play billing will be connected before launch.</p>') + '</div>';

  // ───────── Sheets ─────────
  function sheet(html) { const w = $('#sheet'); w.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>'; w.hidden = false; }
  function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }
  function storeLink(s, q) { return 'https://www.google.com/search?q=' + encodeURIComponent('site:' + s.d + ' ' + q); }
  function whereToBuy(iid) {
    const i = ING[iid]; const pref = P().stores || [];
    const stores = STORES.slice().sort((a, b) => (pref.includes(b.id) ? 1 : 0) - (pref.includes(a.id) ? 1 : 0));
    sheet('<h2>' + esc(i.n) + '</h2><p class="muted">Typical price ≈ <b>' + money(i.r) + ' per ' + (i.ml ? 'litre' : 'kg') + '</b>. Available at all major supermarkets.</p>' +
      '<div class="alert info small">' + storeGuideText() + '</div>' +
      '<h3>Check today’s price</h3>' + stores.map(s => '<a class="btn ghost block mb" target="_blank" rel="noopener" href="' + storeLink(s, i.n) + '">' + (pref.includes(s.id) ? '⭐ ' : '') + esc(s.n) + ' ↗</a>').join('') +
      '<button class="btn block" data-act="closeSheet">Done</button>');
  }
  function storeGuideText() {
    return '<b>Price guide:</b> Shoprite and Usave are usually the cheapest for staples like maize meal, rice, tinned fish and beans. Checkers and Pick n Pay are mid-range with strong weekly specials (Xtra Savings and Smart Shopper). Woolworths is usually the priciest but strong on fresh quality. Makro is good for bulk buying. Specials change every week.';
  }
  function chooseRecipeSheet(day, slot) {
    const list = slotRecipes(slot).sort((a, b) => (recommendable(b) - recommendable(a)) || (goalScore(b) - goalScore(a)));
    sheet('<h2>' + DAYS[day] + ' · ' + SLOTS.find(s => s[0] === slot)[1] + '</h2><p class="muted small">Best matches for your goal first. Allergy-flagged recipes are marked.</p>' +
      list.map(r => { const n = nut(r); const h = allergyHits(r); return '<button class="slot" style="width:100%;text-align:left;border:0" data-act="setSlot" data-day="' + day + '" data-slot="' + slot + '" data-id="' + r.id + '"><span class="se ' + CATS[r.cat].g + '">' + r.e + '</span><span class="st"><b>' + esc(r.name) + '</b><small>' + n.kcal + ' kcal · ' + r.time + ' min' + (h.length ? ' · ⚠️ ' + esc(h.join(', ')) : '') + '</small></span></button>'; }).join('') +
      '<button class="btn ghost block mt" data-act="closeSheet">Cancel</button>');
  }
  function addPlanSheet(id) {
    const r = RBY[id]; const def = r.cat === 'prep' ? ((r.sub || []).find(s => ['breakfast', 'lunch', 'supper'].includes(s)) || 'lunch') : r.cat;
    addPlanSheet.slot = def;
    sheet('<h2>Add to meal plan</h2><p class="muted">' + esc(r.name) + '</p><label class="f">Meal</label><div class="chips">' + SLOTS.map(([k, l]) => '<button class="chip ' + (def === k ? 'on' : '') + '" data-act="apSlot" data-val="' + k + '">' + l + '</button>').join('') + '</div>' +
      '<label class="f">Day</label>' + DAYS.map((d, i) => '<button class="btn ghost block mb" data-act="apDay" data-day="' + i + '" data-id="' + id + '">' + d + (i === todayIdx() ? ' (today)' : '') + '</button>').join('') +
      '<button class="btn soft block" data-act="closeSheet">Cancel</button>');
  }

  // ───────── Router ─────────
  function render() {
    const raw = curRoute();
    const [path] = raw.split('?'); const parts = path.split('/').filter(Boolean);
    let name = parts[0] || 'home'; const arg = parts[1];
    if (!S.profile && name !== 'setup' && name !== 'welcome') { name = 'welcome'; }
    if (name !== 'setup' && S.profile) S.draft = null;
    const fn = views[name] || views.home;
    const noTabs = ['welcome', 'setup'].includes(name);
    document.body.classList.toggle('no-tabs', noTabs);
    $('#tabbar').hidden = noTabs;
    document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === name));
    $('#app').innerHTML = fn(arg);
    const photo = $('#photo'); if (photo) photo.addEventListener('change', onPhoto);
    if (render.lastPath !== path) { window.scrollTo(0, 0); render.lastPath = path; }
  }
  async function onPhoto(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { scan = { img: await resizeImage(f), loading: false, result: null, error: null, mult: 1, demo: false }; render(); runScan(); }
    catch (err) { toast(err.message); }
  }

  // ───────── Actions ─────────
  const A = {
    back() {
      if (USE_HASH) { if (history.length > 1) history.back(); else go('/home'); return; }
      ROUTE = STACK.pop() || '/home'; closeSheet(); render();
    },
    confirmYes() { const cb = askConfirm.cb; askConfirm.cb = null; closeSheet(); if (cb) cb(); },
    startSetup() { S.draft = null; D(); go('/setup/1'); },
    pick(el) {
      const d = D(); const f = el.dataset.field; let v = el.dataset.val;
      if (['cookTime', 'budget'].includes(f)) v = +v;
      if (el.dataset.multi === '1') { const arr = d[f] || (d[f] = []); const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); }
      else d[f] = v;
      if (f === 'diets' && v === 'vegan' && d.diets.includes('vegan') && !d.diets.includes('vegetarian')) d.diets.push('vegetarian');
      render();
    },
    people(el) { const d = D(); d.people = Math.max(1, Math.min(12, (d.people || 1) + +el.dataset.d)); render(); },
    setupNext(el) {
      const step = +el.dataset.step; const d = D(); const edit = isEdit();
      if (step === 1 && !d.goal) return;
      if (step === 4) {
        if (d.dislikeOther) { d.dislikeOther.split(',').map(s => s.trim()).filter(Boolean).forEach(s => { if (!d.dislikes.includes(s)) d.dislikes.push(s); }); d.dislikeOther = ''; }
      }
      if (edit) { S.profile = Object.assign({}, d); S.draft = null; save(); toast('Profile updated'); A.back(); return; }
      if (step >= 6) { S.profile = Object.assign({}, d); S.draft = null; save(); go('/home'); toast('Welcome to HealthyPlate!'); return; }
      save(); go('/setup/' + (step + 1));
    },
    surprise() {
      const h = new Date().getHours(); const slot = h < 11 ? 'breakfast' : h < 15 ? 'lunch' : 'supper';
      const r = pickFor(slot, String(Math.random()), []); if (r) go('/recipe/' + r.id); else toast('No matching recipes. Try relaxing your filters.');
    },
    catFilter(el) { catFilter[el.dataset.cat] = el.dataset.val; render(); },
    fav(el) { const id = el.dataset.id; const i = S.saved.indexOf(id); if (i >= 0) { S.saved.splice(i, 1); toast('Removed from saved'); } else { S.saved.push(id); toast('Saved ❤️'); } save(); render(); },
    serv(el) { const id = el.dataset.id; const r = RBY[id]; const cur = servings[id] || P().people || r.serves; servings[id] = Math.max(1, Math.min(20, cur + +el.dataset.d)); render(); },
    addPlan(el) { addPlanSheet(el.dataset.id); },
    apSlot(el) { addPlanSheet.slot = el.dataset.val; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); },
    apDay(el) { const d = +el.dataset.day; (S.plan[d] = S.plan[d] || {})[addPlanSheet.slot] = el.dataset.id; save(); closeSheet(); toast('Added to ' + DAYS[d]); },
    chooseSlot(el) { chooseRecipeSheet(+el.dataset.day, el.dataset.slot); },
    setSlot(el) { const d = +el.dataset.day; (S.plan[d] = S.plan[d] || {})[el.dataset.slot] = el.dataset.id; save(); closeSheet(); render(); },
    clearSlot(el) { const d = S.plan[+el.dataset.day]; if (d) delete d[el.dataset.slot]; save(); render(); },
    clearPlan() { askConfirm('Clear all meals from this week’s plan?', 'Clear week', () => { S.plan = {}; save(); render(); }); },
    autoPlan() {
      if (!S.premium) { go('/premium'); toast('Auto-fill is a Premium feature'); return; }
      const week = String(Date.now()); const used = { breakfast: [], lunch: [], supper: [] };
      for (let d = 0; d < 7; d++) {
        S.plan[d] = S.plan[d] || {};
        SLOTS.forEach(([k]) => {
          if (S.plan[d][k]) return;
          let r = pickFor(k, week + d + k, used[k]);
          if (!r) { used[k] = []; r = pickFor(k, week + d + k, []); }
          if (r) { S.plan[d][k] = r.id; used[k].push(r.id); }
        });
      }
      save(); render(); toast('Week planned around your goal ✨');
    },
    planToList() {
      const people = P().people || 1; const map = {};
      Object.values(S.plan).forEach(day => Object.values(day || {}).forEach(id => { const r = RBY[id]; if (!r) return; r.ing.forEach(([iid, g]) => { map[iid] = (map[iid] || 0) + g * people / r.serves; }); }));
      if (!Object.keys(map).length) { toast('Add meals to your plan first'); return; }
      const checked = new Set(S.shopping.filter(i => i.ing && i.checked).map(i => i.ing));
      S.shopping = S.shopping.filter(i => !i.ing).concat(Object.entries(map).map(([iid, g]) => ({ ing: iid, g, checked: checked.has(iid) })));
      save(); go('/shop'); toast('Shopping list updated from your plan');
    },
    addToList(el) {
      const r = RBY[el.dataset.id]; const sv = servings[r.id] || P().people || r.serves;
      r.ing.forEach(([iid, g]) => { const ex = S.shopping.find(i => i.ing === iid); const add = g * sv / r.serves; if (ex) { ex.g += add; ex.checked = false; } else S.shopping.push({ ing: iid, g: add, checked: false }); });
      save(); toast(r.ing.length + ' ingredients added to your list');
    },
    check(el) { const it = S.shopping[+el.dataset.ix]; if (it) { it.checked = el.checked; save(); render(); } },
    delItem(el) { S.shopping.splice(+el.dataset.ix, 1); save(); render(); },
    clearChecked() { S.shopping = S.shopping.filter(i => !i.checked); save(); render(); },
    clearList() { askConfirm('Clear your whole shopping list?', 'Clear list', () => { S.shopping = []; save(); render(); }); },
    where(el) { whereToBuy(el.dataset.ing); },
    storeGuide() { sheet('<h2>💡 Where is it cheapest?</h2><div class="alert info">' + storeGuideText() + '</div><p class="small muted">Tip: buy maize meal, rice, oats, lentils and tinned goods in bulk, buy fruit and veg in season, and compare specials in each store’s app before you shop.</p><button class="btn block" data-act="closeSheet">Got it</button>'); },
    closeSheet() { closeSheet(); },
    logRecipe(el) {
      const r = RBY[el.dataset.id]; const n = nut(r); const k = todayKey();
      (S.diary[k] = S.diary[k] || []).push({ id: uid(), name: r.name, kcal: n.kcal, p: n.p, c: n.c, f: n.f, src: 'recipe', at: Date.now() });
      save(); toast('Logged ' + n.kcal + ' kcal for today ✅');
    },
    delDiary(el) { const k = todayKey(); S.diary[k] = (S.diary[k] || []).filter(e => e.id !== el.dataset.id); save(); render(); },
    manualLog() { sheet('<h2>Add food manually</h2><form data-form="manual"><label class="f">What did you eat?</label><input class="in" name="name" required placeholder="e.g. Apple"><label class="f">Calories (kcal)</label><input class="in" name="kcal" type="number" inputmode="numeric" required placeholder="e.g. 80"><div class="two"><div><label class="f">Protein (g)</label><input class="in" name="p" type="number" inputmode="decimal"></div><div><label class="f">Carbs (g)</label><input class="in" name="c" type="number" inputmode="decimal"></div></div><button class="btn block mt">Add to today</button></form><button class="btn ghost block mt" data-act="closeSheet">Cancel</button>'); },
    demoScan() {
      scan = { img: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><rect width="400" height="260" fill="#F3EFE6"/><circle cx="200" cy="130" r="110" fill="#fff" stroke="#ddd" stroke-width="4"/><text x="200" y="160" font-size="90" text-anchor="middle">🍛</text></svg>'), loading: false, error: null, mult: 1, demo: true,
        result: { is_food: true, meal_name: 'Chicken curry with rice (demo)', items: [{ name: 'Chicken curry', portion: '1 cup (220 g)', grams: 220, kcal: 330, protein_g: 28, carbs_g: 12, fat_g: 19 }, { name: 'White rice', portion: '1 cup cooked (160 g)', grams: 160, kcal: 210, protein_g: 4, carbs_g: 46, fat_g: 0.5 }, { name: 'Sambals (tomato & onion)', portion: '2 tbsp (40 g)', grams: 40, kcal: 15, protein_g: 0.5, carbs_g: 3, fat_g: 0 }], total: { kcal: 555, protein_g: 32.5, carbs_g: 61, fat_g: 19.5 }, confidence: 'medium', possible_allergens: [], notes: 'Oil in the curry is the biggest unknown.' } };
      render();
    },
    rescan() { runScan(); },
    resetScan() { scan = { img: null, loading: false, result: null, error: null, mult: 1, demo: false }; render(); },
    logScan() {
      const r = scan.result; const m = scan.mult; const t = r.total || {}; const k = todayKey();
      (S.diary[k] = S.diary[k] || []).push({ id: uid(), name: (r.meal_name || 'Scanned meal') + (m !== 1 ? ' (' + Math.round(m * 100) + '%)' : ''), kcal: (t.kcal || 0) * m, p: (t.protein_g || 0) * m, c: (t.carbs_g || 0) * m, f: (t.fat_g || 0) * m, src: 'scan', at: Date.now() });
      save(); A.resetScan(); go('/today'); toast('Added to today ✅');
    },
    delNote(el) { const id = el.dataset.id; askConfirm('Delete this note?', 'Delete', () => { S.notes = S.notes.filter(n => n.id !== id); save(); go('/notes'); }); },
    quickSearch(el) { const i = $('#sq'); i.value = el.dataset.val; $('#results').innerHTML = searchResults(i.value); replaceRoute('/search?q=' + encodeURIComponent(i.value)); },
    premPlan(el) { premPlan = el.dataset.val; render(); },
    premiumOn() { S.premium = true; save(); render(); toast('Premium activated (test mode) ★'); },
    premiumOff() { S.premium = false; save(); render(); },
    reset() { askConfirm('Delete all your HealthyPlate data from this phone? This cannot be undone.', 'Delete everything', () => { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* storage unavailable */ } S = defaults(); STACK.length = 0; go('/welcome'); }); },
  };

  document.addEventListener('click', e => {
    if (!USE_HASH) { const a = e.target.closest('a[href^="#/"]'); if (a) { e.preventDefault(); go(a.getAttribute('href').slice(1)); return; } }
    const el = e.target.closest('[data-act]'); if (!el) { if (e.target.id === 'sheet') closeSheet(); return; }
    const fn = A[el.dataset.act]; if (!fn) return;
    if (el.tagName !== 'INPUT') e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.bind) { const d = D(); d[el.dataset.bind] = el.dataset.num ? (el.value === '' ? null : +el.value) : el.value; return; }
    if (el.dataset.setting) { S[el.dataset.setting] = el.value.trim(); save(); return; }
    if (el.dataset.note) { const n = S.notes.find(x => x.id === el.dataset.note); if (n) { n[el.dataset.field] = el.value; n.updated = Date.now(); clearTimeout(A._nt); A._nt = setTimeout(save, 300); } return; }
    if (el.id === 'sq') { $('#results').innerHTML = searchResults(el.value); replaceRoute('/search?q=' + encodeURIComponent(el.value)); return; }
    if (el.dataset.actInput === 'mult') { scan.mult = +el.value; const y = window.scrollY; render(); window.scrollTo(0, y); }
  });
  document.addEventListener('submit', e => {
    const f = e.target; const kind = f.dataset.form; if (!kind) return; e.preventDefault();
    const fd = new FormData(f);
    if (kind === 'search') go('/search?q=' + encodeURIComponent(fd.get('q') || ''));
    if (kind === 'addItem') { const v = String(fd.get('item') || '').trim(); if (v) { S.shopping.push({ ing: null, name: v, checked: false }); save(); render(); } }
    if (kind === 'manual') {
      const k = todayKey(); (S.diary[k] = S.diary[k] || []).push({ id: uid(), name: String(fd.get('name')), kcal: +fd.get('kcal') || 0, p: +fd.get('p') || 0, c: +fd.get('c') || 0, f: 0, src: 'manual', at: Date.now() });
      save(); closeSheet(); render(); toast('Added ✅');
    }
  });
  if (USE_HASH) window.addEventListener('hashchange', () => { closeSheet(); render(); });
  render();
})();
