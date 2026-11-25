# bloom-filter-tools

A small, dependency-free Bloom filter for probabilistic set membership with tunable false-positive odds and a compact bit array.

## Usage

```js
import { BloomFilter } from './src/index.js';

// 1024 bits, 4 hash functions.
const filter = new BloomFilter({ sizeBits: 1024, hashCount: 4 });
filter.add('alice');
filter.add('bob');

console.log(filter.has('alice')); // true
console.log(filter.has('carol')); // false (almost always)
console.log(filter.count);        // 2
console.log(filter.falsePositiveRate()); // ~0.0000001

// Or let the constructor size the filter from your target error rate.
const sized = new BloomFilter({ expectedItems: 1000, falsePositiveRate: 0.01 });
sized.add('alice');
console.log(sized.has('alice')); // true
```

## Why this exists

A Bloom filter answers "is this item in the set?" using far less memory than storing the items themselves. The trade-off is one-sided error: a `false` is definitive, but a `true` may be a false positive. This library gives you the two knobs that matter — bit count and hash count — and a helper that derives them from an expected item count and a target false-positive rate. It has no dependencies so it can drop into any ES module project without a build step or install.

## API

- `new BloomFilter(options)` — `options` may contain `sizeBits`, `hashCount`, or both `expectedItems` and `falsePositiveRate`. Defaults are 1024 bits and 4 hashes.
- `add(value)` — adds a string. Throws `TypeError` for non-strings.
- `has(value)` — returns `false` if the value is definitely absent, `true` if it may be present. Throws `TypeError` for non-strings.
- `count` — number of `add` calls, including duplicates.
- `falsePositiveRate()` — estimated current false-positive probability.
- `toBytes()` — returns a copy of the internal `Uint8Array`.
- `BloomFilter.fromBytes(bytes, sizeBits, hashCount)` — rebuilds a filter from `toBytes()` output.

## Edge case to know about

`count` counts every `add` call, including duplicates. The false-positive estimate is only accurate when you add distinct values. If you add the same value repeatedly, the estimate will overstate the real error rate.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

