import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BloomFilter } from '../src/index.js';

test('empty filter reports absent for any value', () => {
  const bf = new BloomFilter({ sizeBits: 64, hashCount: 3 });
  assert.equal(bf.has('hello'), false);
  assert.equal(bf.has(''), false);
  assert.equal(bf.count, 0);
});

test('added value is reported present', () => {
  const bf = new BloomFilter({ sizeBits: 128, hashCount: 4 });
  bf.add('alpha');
  assert.equal(bf.has('alpha'), true);
  assert.equal(bf.count, 1);
});

test('non-added value is usually absent but may be a false positive', () => {
  const bf = new BloomFilter({ sizeBits: 1024, hashCount: 4 });
  bf.add('alpha');
  bf.add('beta');
  // With 1024 bits and 4 hashes, the false-positive rate is tiny.
  assert.equal(bf.has('gamma'), false);
});

test('duplicates increment count but do not change membership', () => {
  const bf = new BloomFilter({ sizeBits: 256, hashCount: 3 });
  bf.add('x');
  bf.add('x');
  assert.equal(bf.has('x'), true);
  assert.equal(bf.count, 2);
});

test('falsePositiveRate is 0 for an empty filter', () => {
  const bf = new BloomFilter({ sizeBits: 128, hashCount: 3 });
  assert.equal(bf.falsePositiveRate(), 0);
});

test('falsePositiveRate grows with item count', () => {
  const bf = new BloomFilter({ sizeBits: 256, hashCount: 4 });
  const before = bf.falsePositiveRate();
  for (let i = 0; i < 20; i++) bf.add('item' + i);
  const after = bf.falsePositiveRate();
  assert.ok(after > before, `expected ${after} > ${before}`);
});

test('constructor computes sizeBits and hashCount from expectedItems and falsePositiveRate', () => {
  const bf = new BloomFilter({ expectedItems: 100, falsePositiveRate: 0.01 });
  // Classic formula: m = ceil(-n ln p / (ln 2)^2) = ceil(958.5...) = 959
  assert.equal(bf.sizeBits, 959);
  // k = round((m/n) ln 2) = round(6.64...) = 7
  assert.equal(bf.hashCount, 7);
});

test('toBytes returns a copy and fromBytes round-trips membership', () => {
  const bf = new BloomFilter({ sizeBits: 128, hashCount: 3 });
  bf.add('persist');
  const bytes = bf.toBytes();
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes.length, bf.byteLength);

  // Mutating the returned copy must not affect the filter.
  bytes[0] = 0xff;
  assert.equal(bf.has('persist'), true);

  const restored = BloomFilter.fromBytes(bf.toBytes(), bf.sizeBits, bf.hashCount);
  assert.equal(restored.has('persist'), true);
  assert.equal(restored.has('missing'), false);
});

test('fromBytes rejects a byte array of the wrong length', () => {
  assert.throws(() => {
    BloomFilter.fromBytes(new Uint8Array(1), 128, 3);
  }, /byte length/);
});

test('add and has reject non-string values', () => {
  const bf = new BloomFilter({ sizeBits: 64, hashCount: 2 });
  assert.throws(() => bf.add(42), TypeError);
  assert.throws(() => bf.has(null), TypeError);
});

test('constructor rejects invalid geometry', () => {
  assert.throws(() => new BloomFilter({ sizeBits: 0 }), RangeError);
  assert.throws(() => new BloomFilter({ hashCount: -1 }), RangeError);
  assert.throws(() => new BloomFilter({ expectedItems: 0, falsePositiveRate: 0.1 }), RangeError);
  assert.throws(() => new BloomFilter({ expectedItems: 10, falsePositiveRate: 1 }), RangeError);
});

test('empty string is a valid value', () => {
  const bf = new BloomFilter({ sizeBits: 64, hashCount: 2 });
  bf.add('');
  assert.equal(bf.has(''), true);
  assert.equal(bf.has('nonempty'), false);
});
