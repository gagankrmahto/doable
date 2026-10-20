/* Doable — Claude assistant engine: a streaming tool-use loop over Doable's own tools.
 * Uses the official Anthropic SDK (bundled to vendor/anthropic.js) straight from the device with the
 * user's own API key. The conversation is append-only — earlier turns, the system prompt and the
 * tool list never change mid-chat — so Claude's thinking stays valid across turns and caching works.
 * The app supplies the tools; this file owns the loop, input validation and persistence. */
(function (global) {
  'use strict';

  const MODEL = 'claude-opus-5-5';
  const BETAS = ['server-side-fallback-2026-07-01', 'thinking-display-updates-2026-08-18'];
  const MAX_STEPS = 16; // tool rounds per message

  // Minimal JSON-Schema check for the shapes our tools use (eager input streaming means the
  // server no longer validates tool input, and the SDK's tolerant parser can truncate it).
  function validate(schema, v, path = 'input') {
    if (!schema) return null;
    const t = schema.type;
    const isType = {
      object: x => x !== null && typeof x === 'object' && !Array.isArray(x),
      array: Array.isArray,
      string: x => typeof x === 'string',
      integer: Number.isInteger,
      number: x => typeof x === 'number' && Number.isFinite(x),
      boolean: x => typeof x === 'boolean',
      null: x => x === null,
    };
    const types = Array.isArray(t) ? t : t ? [t] : [];
    if (types.length && !types.some(x => isType[x] && isType[x](v))) return `${path} should be ${types.join(' or ')}`;
    if (schema.enum && !schema.enum.includes(v)) return `${path} should be one of ${schema.enum.join(', ')}`;
    if (typeof v === 'string') {
      if (schema.pattern && !new RegExp(schema.pattern).test(v)) return `${path} has the wrong format`;
      if (schema.maxLength && v.length > schema.maxLength) return `${path} is too long`;
    }
    if (typeof v === 'number') {
      if (schema.minimum != null && v < schema.minimum) return `${path} is below ${schema.minimum}`;
      if (schema.maximum != null && v > schema.maximum) return `${path} is above ${schema.maximum}`;
    }
    if (Array.isArray(v)) {
      if (schema.maxItems && v.length > schema.maxItems) return `${path} has too many items`;
      if (schema.minItems && v.length < schema.minItems) return `${path} needs at least ${schema.minItems} item(s)`;
      for (let i = 0; i < v.length; i++) { const e = validate(schema.items, v[i], `${path}[${i}]`); if (e) return e; }
    }
    if (isType.object(v) && schema.properties) {
      for (const k of schema.required || []) if (!(k in v)) return `${path}.${k} is required`;
      for (const [k, val] of Object.entries(v)) {
        if (!schema.properties[k]) { if (schema.additionalProperties === false) return `${path}.${k} is not allowed`; continue; }
        const e = validate(schema.properties[k], val, `${path}.${k}`);
        if (e) return e;
      }
    }
    return null;
  }

  // After a mid-output fallback, blocks before the last `fallback` marker that the fallback model
  // can't continue from are dropped when echoing the turn back (text and paired server tools stay).
  function echoContent(content) {
    let last = -1;
    content.forEach((b, i) => { if (b.type === 'fallback') last = i; });
    if (last < 0) return content;
    const results = new Set(content.filter(b => /_tool_result$/.test(b.type) && b.tool_use_id).map(b => b.tool_use_id));
    return content.filter((b, i) => {
      if (i >= last) return true;
      if (b.type === 'text') return true;
      if (b.type === 'server_tool_use') return results.has(b.id);
      if (/_tool_result$/.test(b.type)) return true;
      return false; // thinking, redacted_thinking, tool_use, unknown model-internal blocks
    });
  }

  function createAssistant(opts) {
    const { getClient, tools, system, storageKey, onChange } = opts;
    const byName = new Map(tools.map(t => [t.name, t]));
    // Fixed for the life of every conversation (order and bytes never change)
    const apiTools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema, eager_input_streaming: true }));
    let data = load();
    let busy = false;
    let stream = null;
    let stopped = false;

    function load() {
      try {
        const d = JSON.parse(localStorage.getItem(storageKey));
        if (d && d.v === 1 && Array.isArray(d.messages) && Array.isArray(d.items)) return d;
      } catch { /* empty or unreadable */ }
      return { v: 1, messages: [], items: [] };
    }
    function persist() {
      try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch (e) { data.unsaved = true; }
    }
    const emit = () => onChange && onChange(api.view());
    const push = item => { data.items.push(item); emit(); return item; };

    async function runTool(block, ctx) {
      const tool = byName.get(block.name);
      if (!tool) return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: `Unknown tool ${block.name}` };
      const problem = validate(tool.input_schema, block.input);
      if (problem) {
        return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: JSON.stringify({ INVALID_JSON: JSON.stringify(block.input), problem }) };
      }
      try {
        const out = await tool.run(block.input, ctx);
        const result = out && typeof out === 'object' && 'result' in out ? out.result : out;
        if (out && out.summary) push({ role: 'tool', name: block.name, text: out.summary, changed: !!out.changed });
        return { type: 'tool_result', tool_use_id: block.id, content: typeof result === 'string' ? result : JSON.stringify(result) };
      } catch (e) {
        push({ role: 'tool', name: block.name, text: e.message || String(e), error: true });
        return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: e.message || String(e) };
      }
    }

    async function send(text, context) {
      if (busy || !text.trim()) return;
      busy = true;
      stopped = false;
      let client;
      try { client = await getClient(); } catch (e) {
        busy = false;
        push({ role: 'error', text: e.message || String(e) });
        return;
      }
      const Anthropic = global.Anthropic;
      push({ role: 'user', text: text.trim() });
      // Context for this turn travels in the user message, so nothing earlier ever changes
      data.messages.push({ role: 'user', content: [{ type: 'text', text: context }, { type: 'text', text: text.trim() }] });
      persist();
      const ctx = { changes: 0 };
      let jsonRetries = 0;
      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          const reply = push({ role: 'assistant', text: '', progress: '', streaming: true });
          stream = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 64000,
            betas: BETAS,
            fallbacks: 'default',
            thinking: { type: 'adaptive', display: 'updates' },
            output_config: { effort: 'medium' },
            cache_control: { type: 'ephemeral' },
            system,
            tools: apiTools,
            messages: data.messages,
          });
          stream.on('text', delta => { reply.text += delta; emit(); });
          // Progress notes between tool calls (display: "updates"); a new block starts a new line
          stream.on('thinking', (delta, snapshot) => { if (snapshot === delta && reply.progress) reply.progress += '\n'; reply.progress += delta; emit(); });
          let message;
          try {
            message = await stream.finalMessage();
            jsonRetries = 0;
          } catch (err) {
            data.items.splice(data.items.indexOf(reply), 1);
            if (stopped) { push({ role: 'note', text: 'Stopped.' }); return; }
            // Only unparseable tool input is retried; API and network errors are reported
            if ((Anthropic && err instanceof Anthropic.APIError) || jsonRetries++ >= 2) throw err;
            continue;
          } finally {
            stream = null;
          }
          reply.streaming = false;
          if (message.stop_reason === 'refusal') {
            // Nothing from a declined turn is kept; the conversation can carry on
            reply.text = '';
            reply.refused = true;
            emit();
            break;
          }
          const content = echoContent(message.content);
          const uses = content.filter(b => b.type === 'tool_use');
          if (message.stop_reason === 'max_tokens' && uses.length) {
            data.items.splice(data.items.indexOf(reply), 1);
            push({ role: 'error', text: 'Claude’s reply was cut off before it finished. Try asking for less at once.' });
            break;
          }
          if (!reply.text) data.items.splice(data.items.indexOf(reply), 1); // progress notes are only shown live
          data.messages.push({ role: 'assistant', content });
          persist();
          if (message.stop_reason === 'pause_turn') continue;
          if (!uses.length) break;
          const results = [];
          for (const b of uses) results.push(await runTool(b, ctx));
          data.messages.push({ role: 'user', content: results });
          persist();
          if (stopped) { push({ role: 'note', text: 'Stopped.' }); break; }
        }
      } catch (err) {
        push({ role: 'error', text: describeError(err), status: err && err.status });
      } finally {
        busy = false;
        stream = null;
        data.items.forEach(i => { i.streaming = false; });
        persist();
        emit();
        if (ctx.changes && opts.onChanges) opts.onChanges(ctx.changes);
      }
    }

    function describeError(err) {
      const A = global.Anthropic;
      if (A && err instanceof A.AuthenticationError) return 'Your API key wasn’t accepted. Check it in the assistant settings.';
      if (A && err instanceof A.PermissionDeniedError) return 'This API key doesn’t have access to Claude Opus 5.5.';
      if (A && err instanceof A.RateLimitError) return 'Too many requests right now — wait a moment and try again.';
      if (A && err instanceof A.APIConnectionError) return 'Couldn’t reach Claude. Check your internet connection.';
      if (A && err instanceof A.InternalServerError) return 'Claude is busy right now — please try again shortly.';
      if (A && err instanceof A.BadRequestError && /credit|billing|balance/i.test(err.message)) return 'Your Anthropic account needs credits. Add them at console.anthropic.com.';
      if (A && err instanceof A.APIError) return `Claude returned an error (${err.status || 'unknown'}): ${err.message}`;
      return err && err.message ? err.message : String(err);
    }

    const api = {
      send,
      stop() { stopped = true; if (stream) stream.abort(); },
      reset() { if (busy) return; data = { v: 1, messages: [], items: [] }; persist(); emit(); },
      view: () => ({ items: data.items, busy, size: JSON.stringify(data.messages).length, unsaved: !!data.unsaved }),
    };
    return api;
  }

  global.DoableAssistant = { createAssistant, validate, echoContent, MODEL };
})(typeof window !== 'undefined' ? window : globalThis);
