// Claude assistant engine tests with a scripted fake SDK client: node test/assistant.test.js
const assert = require('assert');

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
class APIError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
class AuthenticationError extends APIError {}
globalThis.Anthropic = { APIError, AuthenticationError, PermissionDeniedError: class extends APIError {}, RateLimitError: class extends APIError {}, APIConnectionError: class extends APIError {}, InternalServerError: class extends APIError {}, BadRequestError: class extends APIError {} };
require('../web/assistant.js');
const { createAssistant, validate, echoContent } = globalThis.DoableAssistant;

// A fake client that replays scripted turns and records every request body
function fakeClient(script) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(params) {
          calls.push(JSON.parse(JSON.stringify(params)));
          const step = script.shift();
          const handlers = {};
          return {
            on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return this; },
            abort() {},
            async finalMessage() {
              if (step.throws) throw step.throws;
              for (const b of step.content) {
                if (b.type === 'text') (handlers.text || []).forEach(f => f(b.text, b.text));
                if (b.type === 'thinking' && b.thinking) (handlers.thinking || []).forEach(f => f(b.thinking, b.thinking));
              }
              return { content: step.content, stop_reason: step.stop_reason || 'end_turn' };
            },
          };
        },
      },
    },
  };
}
const ran = [];
const tools = [{
  name: 'create_tasks',
  description: 'Create tasks',
  input_schema: { type: 'object', properties: { tasks: { type: 'array', minItems: 1, items: { type: 'object', properties: { title: { type: 'string' }, due: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }, required: ['title'], additionalProperties: false } } }, required: ['tasks'], additionalProperties: false },
  run(input, ctx) { ran.push(input); ctx.changes++; return { result: { created: input.tasks.length }, summary: `Added ${input.tasks.length}`, changed: true }; },
}];

(async () => {
  // 1. Validator
  assert.strictEqual(validate(tools[0].input_schema, { tasks: [{ title: 'A', due: '2026-10-21' }] }), null);
  assert.ok(validate(tools[0].input_schema, { tasks: [{ title: 'A', due: 'tomorrow' }] }).includes('format'));
  assert.ok(validate(tools[0].input_schema, { tasks: [] }).includes('at least'));
  assert.ok(validate(tools[0].input_schema, { tasks: [{ title: 'A', extra: 1 }] }).includes('not allowed'));
  assert.ok(validate(tools[0].input_schema, {}).includes('required'));
  assert.strictEqual(validate({ type: ['string', 'null'] }, null), null);

  // 2. Fallback echo: model-internal blocks before the last fallback marker are dropped
  const echoed = echoContent([{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Part' }, { type: 'tool_use', id: 't1' }, { type: 'fallback', from: {}, to: {} }, { type: 'thinking', thinking: '' }, { type: 'text', text: 'Rest' }]);
  assert.deepStrictEqual(echoed.map(b => b.type), ['text', 'fallback', 'thinking', 'text']);
  const plain = [{ type: 'thinking' }, { type: 'text', text: 'x' }];
  assert.strictEqual(echoContent(plain), plain);

  // 3. A tool round trip: invalid input is rejected without running, then a valid call runs
  const client = fakeClient([
    { content: [{ type: 'thinking', thinking: '', signature: 's1' }, { type: 'tool_use', id: 'tu1', name: 'create_tasks', input: { tasks: [{ title: 'Call Mom', due: 'Sunday' }] } }], stop_reason: 'tool_use' },
    { content: [{ type: 'thinking', thinking: 'Fixing the date', signature: 's2' }, { type: 'tool_use', id: 'tu2', name: 'create_tasks', input: { tasks: [{ title: 'Call Mom', due: '2026-10-25' }] } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Added **Call Mom** for Sunday.' }] },
  ]);
  let changes = 0;
  const views = [];
  const a = createAssistant({ getClient: async () => client, tools, system: 'SYSTEM', storageKey: 'chat', onChange: v => views.push({ busy: v.busy, items: JSON.stringify(v.items) }), onChanges: n => { changes = n; } });
  await a.send('Remind me to call Mom on Sunday', 'Context: today is 2026-10-21');
  assert.strictEqual(ran.length, 1, 'tool ran once (invalid input skipped)');
  assert.strictEqual(changes, 1, 'one change reported for undo');
  assert.strictEqual(client.calls.length, 3);
  const req = client.calls[0];
  assert.strictEqual(req.model, 'claude-opus-5-5');
  assert.deepStrictEqual(req.betas, ['server-side-fallback-2026-07-01', 'thinking-display-updates-2026-08-18']);
  assert.strictEqual(req.fallbacks, 'default');
  assert.deepStrictEqual(req.thinking, { type: 'adaptive', display: 'updates' });
  assert.deepStrictEqual(req.output_config, { effort: 'medium' });
  assert.ok(req.tools.every(t => t.eager_input_streaming === true));
  assert.ok(!('tool_choice' in req), 'no forced tool use');
  assert.strictEqual(req.messages[0].content[0].text, 'Context: today is 2026-10-21');
  // Append-only: every request starts with the previous request's messages, byte for byte
  for (let i = 1; i < client.calls.length; i++) {
    const prev = client.calls[i - 1], cur = client.calls[i];
    assert.strictEqual(JSON.stringify(cur.messages.slice(0, prev.messages.length)), JSON.stringify(prev.messages));
    assert.strictEqual(cur.system, prev.system);
    assert.strictEqual(JSON.stringify(cur.tools), JSON.stringify(prev.tools));
  }
  const bad = client.calls[1].messages[2].content[0];
  assert.ok(bad.is_error && JSON.parse(bad.content).INVALID_JSON, 'invalid input answered with INVALID_JSON');
  assert.strictEqual(client.calls[1].messages[1].content[0].signature, 's1', 'thinking block echoed unchanged');
  const items = a.view().items;
  assert.deepStrictEqual(items.map(i => i.role), ['user', 'tool', 'assistant'], 'tool-only turns leave no empty bubble');
  assert.strictEqual(items[2].text, 'Added **Call Mom** for Sunday.');
  assert.ok(views.some(v => v.busy && v.items.includes('Fixing the date')), 'progress note shown while working');
  assert.strictEqual(views[views.length - 1].busy, false, 'not busy at the end');
  const saved = JSON.parse(store.get('chat'));
  assert.strictEqual(saved.messages.length, 6);

  // 4. Persistence: a new engine picks the conversation back up
  const client2 = fakeClient([{ content: [{ type: 'text', text: 'Sure.' }] }]);
  const b = createAssistant({ getClient: async () => client2, tools, system: 'SYSTEM', storageKey: 'chat' });
  await b.send('Thanks', 'Context 2');
  assert.strictEqual(JSON.stringify(client2.calls[0].messages.slice(0, 6)), JSON.stringify(saved.messages));

  // 5. Refusal: nothing from the declined turn is kept
  const c3 = fakeClient([{ content: [{ type: 'text', text: 'partial' }], stop_reason: 'refusal' }]);
  const c = createAssistant({ getClient: async () => c3, tools, system: 'S', storageKey: 'c3' });
  await c.send('something', 'ctx');
  assert.strictEqual(JSON.parse(store.get('c3')).messages.length, 1, 'only the user turn is stored');
  assert.ok(c.view().items.some(i => i.refused));

  // 6. Cut off mid tool call: not appended, error shown
  const c4 = fakeClient([{ content: [{ type: 'tool_use', id: 'x', name: 'create_tasks', input: { tasks: [{ title: 'A' }] } }], stop_reason: 'max_tokens' }]);
  const d = createAssistant({ getClient: async () => c4, tools, system: 'S', storageKey: 'c4' });
  await d.send('go', 'ctx');
  assert.strictEqual(JSON.parse(store.get('c4')).messages.length, 1);
  assert.ok(d.view().items.some(i => i.role === 'error'));

  // 7. Unparseable tool JSON is re-issued; API errors are reported, not retried
  const c5 = fakeClient([{ throws: new SyntaxError('bad json') }, { content: [{ type: 'text', text: 'ok' }] }]);
  const e = createAssistant({ getClient: async () => c5, tools, system: 'S', storageKey: 'c5' });
  await e.send('hi', 'ctx');
  assert.strictEqual(c5.calls.length, 2);
  assert.strictEqual(e.view().items.pop().text, 'ok');
  const c6 = fakeClient([{ throws: new AuthenticationError(401, 'invalid x-api-key') }]);
  const f = createAssistant({ getClient: async () => c6, tools, system: 'S', storageKey: 'c6' });
  await f.send('hi', 'ctx');
  assert.strictEqual(c6.calls.length, 1);
  const err = f.view().items.pop();
  assert.ok(err.role === 'error' && /API key/.test(err.text) && err.status === 401);

  // 8. Missing key surfaces as an error without getting stuck busy
  const g = createAssistant({ getClient: async () => { throw new Error('Add your Anthropic API key first.'); }, tools, system: 'S', storageKey: 'c7' });
  await g.send('hi', 'ctx');
  assert.strictEqual(g.view().busy, false);
  assert.ok(/API key/.test(g.view().items.pop().text));

  console.log('assistant tests passed');
})().catch(e => { console.error(e); process.exit(1); });
