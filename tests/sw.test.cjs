const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('worker serves its exact resource version and leaves other revisions to the network', async () => {
  const listeners = {};
  const requested = [];
  const scope = 'https://wash.example/';
  vm.runInNewContext(fs.readFileSync('scripts/sw-template.js', 'utf8'), {
    URL, CACHE: 'wash-fit-current', ASSETS: ['./', './js/app.js?v=current'],
    self: {location: {origin: 'https://wash.example'}, registration: {scope}, addEventListener: (name, fn) => { listeners[name] = fn; }},
    caches: {open: async () => ({match: async request => { requested.push(request.url); return 'current-resource'; }})},
    fetch: async () => { throw new Error('Unexpected network request'); }
  });
  let response;
  const request = url => listeners.fetch({request: {method: 'GET', url}, respondWith: promise => { response = promise; }});
  request(scope + 'js/app.js?v=current');
  assert.equal(await response, 'current-resource');
  assert.deepEqual(requested, [scope + 'js/app.js?v=current']);
  for (const path of ['js/app.js?v=previous', 'js/app.js', '?verify=current']) {
    response = undefined;
    request(scope + path);
    assert.equal(response, undefined, 'A different resource revision must not use this cache');
  }
});

function worker({ online = true, status = 200, installFailure = false } = {}) {
  const listeners = {}, calls = [];
  const current = { ok: status >= 200 && status < 300, body: 'current HTML' };
  const offline = { body: 'installed offline HTML' };
  vm.runInNewContext(fs.readFileSync('scripts/sw-template.js', 'utf8'), {
    URL, CACHE: 'wash-fit-current', ASSETS: ['./'],
    self: {
      location: { origin: 'https://wash.example' }, registration: { scope: 'https://wash.example/app/' },
      addEventListener: (name, fn) => { listeners[name] = fn; },
      skipWaiting: async () => { calls.push('activate'); }, clients: { claim: async () => { calls.push('claim'); } }
    },
    caches: { open: async () => ({
      addAll: async () => { calls.push('cache'); if (installFailure) throw new Error('Download failed'); },
      match: async path => { calls.push(path); return offline; }
    }), keys: async () => ['wash-fit-old', 'wash-fit-current', 'other-app'], delete: async key => { calls.push(key); } },
    fetch: async () => { calls.push('network'); if (!online) throw new Error('Offline'); return current; }
  });
  const navigate = (path = '') => {
    let response;
    listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://wash.example/app/' + path }, respondWith: value => { response = value; } });
    return response;
  };
  return { listeners, calls, current, offline, navigate };
}

test('updates activate automatically only after every offline asset is cached', async () => {
  const app = worker(); let installation;
  app.listeners.install({ waitUntil: promise => { installation = promise; } });
  await installation;
  assert.deepEqual(app.calls, ['cache', 'activate']);
  let activation;
  app.listeners.activate({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.ok(app.calls.includes('claim'));
  assert.ok(app.calls.includes('wash-fit-old'));
  assert.ok(!app.calls.includes('other-app'));
  const failure = worker({ installFailure: true });
  failure.listeners.install({ waitUntil: promise => { installation = promise; } });
  await assert.rejects(installation);
  assert.deepEqual(failure.calls, ['cache']);
});

test('opening or reloading uses current HTML online and the installed HTML offline', async () => {
  for (const path of ['', 'index.html', '?facility=example']) {
    const app = worker();
    assert.equal(await app.navigate(path), app.current);
    assert.deepEqual(app.calls, ['network']);
    const offline = worker({ online: false });
    assert.equal(await offline.navigate(path), offline.offline);
    assert.deepEqual(offline.calls, ['network', './']);
  }
  const unavailable = worker({ status: 503 });
  assert.equal(await unavailable.navigate(), unavailable.offline);
  assert.equal(worker().navigate('api/drive-archive'), undefined);
});

test('updates have no manual control or forced page reload', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const app = fs.readFileSync('js/app.js', 'utf8');
  assert.ok(!html.includes('Guardar y actualizar aplicación'));
  assert.ok(!app.includes('updateAvailable'));
  assert.ok(!app.includes('controllerchange'));
});
