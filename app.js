const GROUP_ID = 35956498;
const MIN_RANK = 10;
const BL_SHEET = '1NXhPXTju0qDgGRz6sO6d3vUZw5LjY6kRj34sIzPhZjY';
const BL_TAB = 'Blacklists (BL)';
const PROXY = 'roproxy.com';
const FIT_HEIGHT = 620;

const col = (row, i) => (row[i] || '').trim();

function buildBlacklist(rows) {
  const bl = new Map();
  for (const row of rows) {
    const username = col(row, 1);
    if (username) bl.set(username.toLowerCase(), { type: col(row, 3), end: col(row, 4), reason: col(row, 5) });
  }
  return bl;
}

function parseNames(input) {
  const names = input.split(/[\s,;]+/).filter(Boolean);
  return [...new Map(names.map(n => [n.toLowerCase(), n])).values()];
}

function evaluate(name, user, role, bl) {
  const reasons = [];
  if (!user) reasons.push('User not found on Roblox');
  else if (!role || role.rank < MIN_RANK) reasons.push('Not Rank 3+');
  if (bl) {
    const temp = bl.type.toLowerCase() === 'temporary';
    const kind = temp ? `Temporary${bl.end ? ': ' + bl.end : ''}` : 'Permanent';
    reasons.push(`Blacklisted - ${kind}${bl.reason ? ` (${bl.reason})` : ''}`);
  }
  return {
    username: user ? user.name : name,
    typed: name,
    role: role ? role.name : user ? 'Not in group' : '-',
    eligible: !reasons.length,
    reasons,
  };
}

if (typeof module !== 'undefined') module.exports = { buildBlacklist, parseNames, evaluate };

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  let eligible = [], ineligible = [];

  const fit = () => document.documentElement.style.zoom = innerWidth < 700 ? 1 : Math.max(0.7, Math.min(1.3, innerHeight / FIT_HEIGHT));
  fit();
  addEventListener('resize', fit);

  // Clippy
  const POSES = ['Wave', 'Salute', 'Question', 'Clipboard', 'Cheer', 'Hooray', 'Hips', 'Stern', 'Oops', 'Think', 'Shrug', 'Tada',
    'IdleA', 'IdleABlink', 'IdleB', 'IdleBBlink', 'Sleepy'];
  const PERCHES = ['Sit', 'Lie'];
  const poseUrl = pose => `img/Clippy_${pose}.png`;
  const perchUrl = kind => `img/Clippy_${kind}.webp`;
  [...POSES.map(poseUrl), ...PERCHES.map(perchUrl)].forEach(url => new Image().src = url);

  let timers = [], turns = 0, perches = 0;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const rest = () => { timers.forEach(clearTimeout); timers = []; };
  const setPose = pose => $('clippyImg').src = poseUrl(pose);

  function perch() {
    const kind = PERCHES[Math.floor(Math.random() * PERCHES.length)];
    rest();
    $('perch').src = perchUrl(kind);
    $('perch').className = `perch ${kind.toLowerCase()}`;
    document.body.classList.add('perched');
    later(() => {
      document.body.classList.remove('perched');
      turns = 0;
      if (++perches < 2) return idle();
      setPose('Sleepy');
      $('say').textContent = 'Zzz...';
    }, 25000 + Math.random() * 15000);
  }

  function idle(variant = 'IdleA') {
    rest();
    $('clippy').classList.add('breathe');
    setPose(variant);
    const blink = () => {
      setPose(variant + 'Blink');
      later(() => { setPose(variant); later(blink, 2200 + Math.random() * 3000); }, 150);
    };
    later(blink, 1800);
    later(() => ++turns > 2 ? perch() : idle(variant === 'IdleA' ? 'IdleB' : 'IdleA'), 7000 + Math.random() * 5000);
  }

  function say(pose, text, settle = true) {
    rest();
    turns = perches = 0;
    document.body.classList.remove('perched');
    $('clippy').classList.remove('breathe');
    setPose(Array.isArray(pose) ? pose[Math.floor(Math.random() * pose.length)] : pose);
    $('say').textContent = text;
    if (settle) later(idle, 8000);
  }

  $('openCredits').onclick = () => $('credits').showModal();
  $('openApp').onclick = () => $('names').focus();

  async function request(url, init, tries = 3) {
    const res = await fetch(url, init);
    if (res.status === 429 && tries > 1) {
      $('status').textContent = 'Roblox rate limit reached, waiting 30 seconds...';
      await new Promise(done => setTimeout(done, 30000));
      return request(url, init, tries - 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return res;
  }

  function fetchBlacklist() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => reject(new Error("can't read the blacklist sheet"));
      // Google silently answers with the first tab when BL_TAB does not exist, so check it is the blacklist.
      window.ugldBlacklist = data => data.table && /End of BL/.test(data.table.cols[4]?.label)
        ? resolve(buildBlacklist(data.table.rows.map(row => row.c.map(cell => cell ? String(cell.f ?? cell.v ?? '') : ''))))
        : fail();
      script.onerror = fail;
      script.onload = () => script.remove();
      script.src = `https://docs.google.com/spreadsheets/d/${BL_SHEET}/gviz/tq?tqx=responseHandler:ugldBlacklist&sheet=${encodeURIComponent(BL_TAB)}`;
      document.head.append(script);
    });
  }

  async function lookupUsers(names) {
    const users = new Map();
    for (let i = 0; i < names.length; i += 100) {
      const res = await request(`https://users.${PROXY}/v1/usernames/users`, {
        method: 'POST',
        body: JSON.stringify({ usernames: names.slice(i, i + 100), excludeBannedUsers: false }),
      });
      for (const u of (await res.json()).data) users.set(u.requestedUsername.toLowerCase(), u);
    }
    return users;
  }

  async function groupRole(userId) {
    const res = await request(`https://groups.${PROXY}/v2/users/${userId}/groups/roles`);
    const hit = (await res.json()).data.find(e => e.group.id === GROUP_ID);
    return hit && hit.role;
  }

  function render(results) {
    $('results').tBodies[0].replaceChildren(...results.map(r => {
      const tr = document.createElement('tr');
      tr.className = r.eligible ? 'ok' : 'no';
      const renamed = r.username.toLowerCase() !== r.typed.toLowerCase();
      for (const text of [renamed ? `${r.username} (was ${r.typed})` : r.username, r.role, r.eligible ? 'ELIGIBLE' : 'INELIGIBLE', r.reasons.join(' | ')])
        tr.insertCell().textContent = text;
      return tr;
    }));
  }

  async function run() {
    const names = parseNames($('names').value);
    if (!names.length) return say('Question', 'Give me at least one username first.');
    $('check').disabled = true;
    $('status').textContent = 'Reading blacklist...';
    say('Clipboard', 'Checking the blacklist and the group ranks. One moment...', false);
    try {
      const [blacklist, users] = await Promise.all([fetchBlacklist(), lookupUsers(names)]);
      const results = [];
      for (const [i, name] of names.entries()) {
        $('status').textContent = `Checking ${i + 1}/${names.length}: ${name}`;
        const user = users.get(name.toLowerCase());
        const role = user && await groupRole(user.id);
        const bl = blacklist.get(name.toLowerCase()) || (user && blacklist.get(user.name.toLowerCase()));
        results.push(evaluate(name, user, role, bl));
      }
      results.sort((a, b) => b.eligible - a.eligible);
      eligible = results.filter(r => r.eligible).map(r => r.username);
      ineligible = results.filter(r => !r.eligible).map(r => r.username);
      render(results);
      $('status').textContent = `${results.length} checked: ${eligible.length} eligible, ${ineligible.length} ineligible`;
      $('copyOk').disabled = !eligible.length;
      $('copyNo').disabled = !ineligible.length;
      const unknown = names.filter(n => !users.has(n.toLowerCase())).length;
      const counts = `${eligible.length} eligible, ${ineligible.length} ineligible.`;
      if (unknown) say('Oops', `${counts} ${unknown} name(s) not found on Roblox, check for typos.`);
      else if (!ineligible.length) say(['Cheer', 'Hooray'], 'Everyone passed. Nobody ineligible.');
      else if (eligible.length) say(['Salute', 'Hips'], counts);
      else say('Stern', 'Nobody passed.');
    } catch (err) {
      console.error(err);
      $('status').textContent = 'Error: ' + err.message;
      say('Shrug', "I can't reach Roblox or the blacklist sheet. Try again in a minute.");
    } finally {
      $('check').disabled = false;
    }
  }

  $('check').onclick = run;
  const copy = async (text, what) => {
    await navigator.clipboard.writeText(text);
    $('status').textContent = `Copied ${what}`;
    say('Tada', `Copied ${what}.`);
  };
  $('names').oninput = () => {
    const n = parseNames($('names').value).length;
    say('Think', n ? `${n} username(s) in the box. Hit Check when ready.` : 'The box is empty.');
  };
  $('copyOk').onclick = () => copy(eligible.join('\n'), `${eligible.length} eligible username(s)`);
  $('copyNo').onclick = () => copy(ineligible.join('\n'), `${ineligible.length} ineligible username(s)`);

  const tick = () => $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  tick();
  setInterval(tick, 30000);

  say('Wave', 'Paste some usernames and I will check them for you.');
}
