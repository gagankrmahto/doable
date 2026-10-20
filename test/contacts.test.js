// Google Contacts import parsers: node test/contacts.test.js
// Loads the parser functions out of app.js without running the app.
const assert = require('assert');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'web', 'app.js'), 'utf8');
const grab = name => { const m = src.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`)); assert.ok(m, `found ${name}`); return m[0]; };
// eslint-disable-next-line no-new-func
const lib = new Function(`${grab('normBday')}${grab('parseVcf')}${grab('parseCsv')} return { normBday, parseVcf, parseCsv };`)();

// Dates
assert.strictEqual(lib.normBday('1990-05-15'), '1990-05-15');
assert.strictEqual(lib.normBday('19900515'), '1990-05-15');
assert.strictEqual(lib.normBday('--05-15'), '--05-15');
assert.strictEqual(lib.normBday('--0515'), '--05-15');
assert.strictEqual(lib.normBday('1604-05-15'), '--05-15'); // Apple "no year"
assert.strictEqual(lib.normBday('not a date'), null);

// vCard as exported by Google Contacts (folded line, escaped comma, anniversary via X-ABDATE)
const vcf = [
  'BEGIN:VCARD', 'VERSION:3.0', 'FN:Ravi Kumar', 'N:Kumar;Ravi;;;', 'TEL;TYPE=CELL:+91 98765 43210', 'BDAY:1992-03-08',
  'item1.X-ABDATE:2018-11-25', 'item1.X-ABLabel:Anniversary', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:3.0', 'FN:Priya\\, Sharma', 'BDAY:--07-19', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:3.0', 'FN:No Birthday Person', 'TEL:12345', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:4.0', 'FN:Long Name', ' Continued', 'ANNIVERSARY:20100214', 'END:VCARD',
].join('\r\n');
const v = lib.parseVcf(vcf);
assert.deepStrictEqual(v.map(p => p.name), ['Ravi Kumar', 'Priya, Sharma', 'Long NameContinued']);
assert.deepStrictEqual(v[0], { name: 'Ravi Kumar', birthday: '1992-03-08', anniversary: '2018-11-25', phone: '+919876543210' });
assert.strictEqual(v[1].birthday, '--07-19');
assert.strictEqual(v[2].anniversary, '2010-02-14');

// Google CSV (new column names)
const csv = 'First Name,Middle Name,Last Name,Birthday,Event 1 - Label,Event 1 - Value,Phone 1 - Label,Phone 1 - Value\n'
  + 'Anita,,Rao,1985-12-01,Anniversary,2012-05-20,Mobile,+91 90000 11111 ::: 080 1234\n'
  + '"Dev ""DJ""",,Joshi,--04-10,,,,\n'
  + 'Nobody,,Here,,,,,\n';
const c = lib.parseCsv(csv);
assert.deepStrictEqual(c.map(p => p.name), ['Anita Rao', 'Dev "DJ" Joshi']);
assert.deepStrictEqual(c[0], { name: 'Anita Rao', birthday: '1985-12-01', anniversary: '2012-05-20', phone: '+919000011111' });
assert.strictEqual(c[1].birthday, '--04-10');

console.log('contacts import tests passed');
