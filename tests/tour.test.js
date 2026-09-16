import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLegacySlide, createTourController, createSupabaseTourTransport, positionTour } from '../src/tour/steps.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function remote(initial = null) {
  let listener;
  const result = { reads: 0, removed: 0, row: initial,
    async read() { result.reads++; return result.row; },
    subscribe(callbacks) { listener = callbacks; return () => { result.removed++; }; },
    emit(row) { listener.onRow(row); },
    status(value) { listener.onStatus(value); }
  };
  return result;
}

test('legacy presentation slides resolve to reachable routes, including health and closing', () => {
  const expected = [[4,'goals','new-goal-btn'],[6,'dashboard','plan-ahorro-card'],[8,'dashboard','kpi-balance'],[9,'transactions','presupuestos-btn'],[10,'transactions','recurrentes-btn'],[11,'import','import-csv-tab'],[12,'dashboard','generar-resumen'],[18,'investments','add-holding-btn'],[19,'dashboard','toggle-usd'],[20,'goals','vincular-inv-btn'],[21,'dashboard','score-card'],[23,'dashboard','kpi-balance']];
  for (const [slide, route, target] of expected) {
    const step = resolveLegacySlide(slide);
    assert.equal(step.route, route, `slide ${slide}`);
    assert.equal(step.target, target, `slide ${slide}`);
  }
  assert.equal(resolveLegacySlide('19').enterAction, 'currency:USD');
  assert.equal(resolveLegacySlide(12).enterAction, 'overview:changes');
  for (const unknown of [0, 5, 22, 24, '4oops', null, undefined]) assert.equal(resolveLegacySlide(unknown), null);
});

test('a disabled tour neither navigates nor reads or subscribes', async () => {
  const transport = remote({ id: 'live', active: true, slide: 19 });
  const routes = [];
  const guide = createTourController({ enabled: false, transport, navigate: route => routes.push(route) });
  guide.start();
  await tick();
  assert.equal(transport.reads, 0);
  assert.equal(guide.getState().step, null);
  assert.deepEqual(routes, []);
});

test('initial snapshot and reconnect restore the live slide without toggling USD', async () => {
  const transport = remote({ id: 'live', active: true, slide: 19 });
  const actions = [];
  const routes = [];
  const guide = createTourController({ enabled: true, transport, navigate: route => routes.push(route), onAction: action => actions.push(action) });
  guide.start();
  await tick();
  assert.equal(guide.getState().mode, 'live');
  assert.equal(guide.getState().step.id, 'currency');
  assert.ok(actions.includes('currency:USD'));
  transport.status('CHANNEL_ERROR');
  transport.row = { id: 'live', active: true, slide: 23 };
  transport.status('SUBSCRIBED');
  await tick();
  assert.equal(transport.reads, 2);
  assert.equal(guide.getState().step.id, 'closing');
  assert.equal(routes.at(-1), 'dashboard');
  assert.equal(guide.getState().connection, 'connected');
  guide.stop();
});

test('only the live row can navigate; invalid or unrelated updates are ignored', async () => {
  const transport = remote();
  const routes = [];
  const guide = createTourController({ enabled: true, transport, navigate: route => routes.push(route) });
  guide.start();
  await tick();
  const before = routes.length;
  transport.emit({ id: 'other', active: true, slide: 19 });
  transport.emit({ id: 'live', active: 'false', slide: 19 });
  transport.emit({ id: 'live', active: true, slide: true });
  assert.equal(guide.getState().step.id, 'new-goal');
  assert.equal(routes.length, before);
  transport.emit({ id: 'live', active: true, slide: 22 });
  assert.equal(guide.getState().step, null);
  assert.equal(routes.length, before);
  guide.stop();
});

test('previous and next keep local control until follow is explicitly resumed', async () => {
  const transport = remote({ id: 'live', active: true, slide: 9 });
  const guide = createTourController({ enabled: true, transport });
  guide.start();
  await tick();
  guide.next();
  assert.equal(guide.getState().step.id, 'recurring');
  assert.equal(guide.getState().mode, 'local');
  transport.emit({ id: 'live', active: true, slide: 23 });
  assert.equal(guide.getState().step.id, 'recurring');
  guide.previous();
  assert.equal(guide.getState().step.id, 'budgets');
  transport.row = { id: 'live', active: true, slide: 23 };
  guide.follow();
  await tick();
  assert.equal(guide.getState().step.id, 'closing');
  guide.stop();
});

test('inactive presentation returns to the local step, while close removes subscription permanently', async () => {
  const transport = remote({ id: 'live', active: true, slide: 19 });
  let closes = 0;
  const guide = createTourController({ enabled: true, transport, onClose: () => closes++ });
  guide.start();
  await tick();
  transport.emit({ id: 'live', active: false, slide: 19 });
  assert.equal(guide.getState().mode, 'local');
  assert.equal(guide.getState().step.id, 'new-goal');
  guide.close();
  transport.emit({ id: 'live', active: true, slide: 4 });
  assert.equal(guide.getState().step, null);
  assert.equal(transport.removed, 1);
  assert.equal(closes, 1);
});

test('a stale snapshot cannot override an update or revive an unmounted guide', async () => {
  let finish;
  const transport = remote();
  transport.read = () => new Promise(resolve => { finish = resolve; });
  const guide = createTourController({ enabled: true, transport });
  guide.start();
  transport.emit({ id: 'live', active: true, slide: 21 });
  finish({ id: 'live', active: true, slide: 4 });
  await tick();
  assert.equal(guide.getState().step.id, 'health');
  guide.follow();
  guide.stop();
  finish({ id: 'live', active: true, slide: 23 });
  await tick();
  assert.equal(guide.getState().step.id, 'health');
});

test('safe actions are explicit; entering a new-goal step does not submit or click anything', () => {
  const actions = [];
  const guide = createTourController({ enabled: true, onAction: action => actions.push(action) });
  guide.start();
  assert.deepEqual(actions, []);
  guide.activate();
  assert.deepEqual(actions, ['goals:new']);
  guide.stop();
});

test('Supabase transport scopes reads and changes to id=live and releases the channel', async () => {
  const calls = [];
  let receive;
  let status;
  const channel = { on(type, filter, callback) { calls.push([type, filter]); receive = callback; return channel; }, subscribe(callback) { status = callback; return channel; } };
  const client = {
    from(table) { calls.push(['from', table]); return { select(fields) { calls.push(['select', fields]); return { eq(key, value) { calls.push(['eq', key, value]); return { async maybeSingle() { return { data: { id: 'live', slide: 4, active: true }, error: null }; } }; } }; } }; },
    channel(name) { calls.push(['channel', name]); return channel; },
    removeChannel(value) { assert.equal(value, channel); calls.push(['removed']); return Promise.resolve('ok'); }
  };
  const transport = createSupabaseTourTransport(client);
  assert.deepEqual(await transport.read(), { id: 'live', slide: 4, active: true });
  const rows = [];
  const statuses = [];
  const cleanup = transport.subscribe({ onRow: row => rows.push(row), onStatus: value => statuses.push(value) });
  receive({ new: { id: 'other', slide: 4, active: true } });
  receive({ new: { id: 'live', slide: 6, active: true } });
  status('SUBSCRIBED');
  cleanup();
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 'live'));
  assert.deepEqual(calls.find(call => call[0] === 'postgres_changes')[1], { event: 'UPDATE', schema: 'public', table: 'charla_state', filter: 'id=eq.live' });
  assert.deepEqual(rows, [{ id: 'live', slide: 6, active: true }]);
  assert.deepEqual(statuses, ['SUBSCRIBED']);
  assert.ok(calls.some(call => call[0] === 'removed'));
});

test('tooltip placement remains inside desktop and mobile viewports, with missing anchors supported', () => {
  for (const width of [320, 390, 1440]) {
    for (const rect of [null, { left: -100, right: -20, top: 1, bottom: 100 }, { left: width - 50, right: width, top: 700, bottom: 740 }, { left: 20, right: 160, top: 40, bottom: 100 }]) {
      const pos = positionTour(rect, { width, height: 800 }, { width: 340, height: 200 });
      assert.ok(pos.left >= 8);
      assert.ok(pos.top >= 8);
      assert.ok(pos.left + pos.width <= width - 8);
      assert.ok(pos.top + pos.height <= 792);
    }
  }
});
