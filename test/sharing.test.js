// Passcode sharing crypto: node test/sharing.test.js
const assert = require('assert');
require('../web/sharing.js');
const S = globalThis.Sharing;

(async () => {
  const snapshot = { name: 'Freelance', projects: [{ name: 'Clinic website', progress: 50, milestones: [{ title: 'Design', done: true }] }], note: 'नमस्ते 🙏' };
  const sealed = await S.seal(snapshot, 'mango 42');
  assert.deepStrictEqual(Object.keys(sealed).sort(), ['blob', 'iv', 'salt', 'v']);
  assert.ok(!sealed.blob.includes('Clinic'), 'ciphertext does not leak content');
  assert.deepStrictEqual(await S.open(sealed, 'mango 42'), snapshot, 'round-trips, unicode included');
  assert.deepStrictEqual(await S.open(sealed, 'mango 42'.normalize('NFKC')), snapshot, 'passcode is unicode-normalised');
  await assert.rejects(() => S.open(sealed, 'mango 43'), 'wrong passcode fails');
  await assert.rejects(() => S.open({ ...sealed, blob: sealed.blob.slice(0, -8) + 'AAAAAAAA' }, 'mango 42'), 'tampered blob fails');
  const again = await S.seal(snapshot, 'mango 42');
  assert.notStrictEqual(again.blob, sealed.blob, 'fresh salt and iv each time');
  const ids = new Set(Array.from({ length: 50 }, S.newShareId));
  assert.strictEqual(ids.size, 50);
  assert.ok([...ids].every(id => /^[A-Za-z0-9_-]{16}$/.test(id)));
  console.log('sharing tests passed');
})().catch(e => { console.error(e); process.exit(1); });
