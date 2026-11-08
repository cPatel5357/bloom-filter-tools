const DEFAULT_HASH_COUNT = 4;
const DEFAULT_SIZE_BITS = 1024;

/**
 * A Bloom filter implemented as a typed array of bits.
 *
 * Why a Uint8Array instead of a Uint32Array? The bit array is addressed by
 * individual bits, and a byte array lets us set and test a single bit with
 * simple masks. It also avoids endianness questions entirely.
 */
export class BloomFilter {
  /**
   * @param {object} [options]
   * @param {number} [options.sizeBits] Number of bits in the filter.
   * @param {number} [options.hashCount] Number of hash functions (k).
   * @param {number} [options.expectedItems] When provided alongside hashCount,
   *   sizeBits is computed from the classic formula -n ln(p) / (ln 2)^2.
   * @param {number} [options.falsePositiveRate] Desired false-positive rate.
   */
  constructor(options = {}) {
    let sizeBits = options.sizeBits;
    let hashCount = options.hashCount;

    if (options.expectedItems != null && options.falsePositiveRate != null) {
      const n = options.expectedItems;
      const p = options.falsePositiveRate;
      if (!(n > 0)) throw new RangeError('expectedItems must be positive');
      if (!(p > 0 && p < 1)) throw new RangeError('falsePositiveRate must be in (0, 1)');
      const m = Math.ceil((-n * Math.log(p)) / (Math.LN2 * Math.LN2));
      const k = Math.max(1, Math.round((m / n) * Math.LN2));
      sizeBits = m;
      hashCount = k;
    }

    if (sizeBits == null) sizeBits = DEFAULT_SIZE_BITS;
    if (hashCount == null) hashCount = DEFAULT_HASH_COUNT;

    if (!Number.isInteger(sizeBits) || sizeBits <= 0) {
      throw new RangeError('sizeBits must be a positive integer');
    }
    if (!Number.isInteger(hashCount) || hashCount <= 0) {
      throw new RangeError('hashCount must be a positive integer');
    }

    this.sizeBits = sizeBits;
    this.hashCount = hashCount;
    this.byteLength = Math.ceil(sizeBits / 8);
    this.bits = new Uint8Array(this.byteLength);
    this.itemCount = 0;
  }

  /**
   * The 32-bit FNV-1a hash. It is fast, has no dependencies, and is
   * deterministic across platforms. We use it as the base for double hashing.
   *
   * @param {string} value
   * @returns {number} unsigned 32-bit integer
   */
  static fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      // Multiply by the FNV prime modulo 2^32. Use Math.imul for 32-bit wrap.
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  /**
   * A second, independent 32-bit hash. FNV-1a alone would give us correlated
   * probes, so we mix in the length and a different constant to decorrelate.
   *
   * @param {string} value
   * @returns {number} unsigned 32-bit integer
   */
  static fnv1aVariant(value) {
    let hash = 0x9e3779b9 ^ value.length;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x85ebca6b);
    }
    return hash >>> 0;
  }

  /**
   * Computes the k bit positions for a value using enhanced double hashing.
   *
   * @param {string} value
   * @returns {number[]} bit indices in [0, sizeBits)
   */
  _positions(value) {
    const h1 = BloomFilter.fnv1a(value);
    const h2 = BloomFilter.fnv1aVariant(value) | 1; // ensure odd step
    const positions = new Array(this.hashCount);
    let combined = h1;
    for (let i = 0; i < this.hashCount; i++) {
      positions[i] = combined % this.sizeBits;
      combined = (combined + h2) >>> 0;
    }
    return positions;
  }

  /**
   * Adds a value to the filter. Adding the same value twice is harmless but
   * increments itemCount each time; itemCount is an estimate, not a guarantee.
   *
   * @param {string} value
   */
  add(value) {
    if (typeof value !== 'string') {
      throw new TypeError('value must be a string');
    }
    const positions = this._positions(value);
    for (const pos of positions) {
      const byteIndex = pos >>> 3;
      const bitIndex = pos & 7;
      this.bits[byteIndex] |= 1 << bitIndex;
    }
    this.itemCount++;
  }

  /**
   * Tests whether a value might be in the filter.
   *
   * @param {string} value
   * @returns {boolean} false means definitely absent; true means possibly present.
   */
  has(value) {
    if (typeof value !== 'string') {
      throw new TypeError('value must be a string');
    }
    const positions = this._positions(value);
    for (const pos of positions) {
      const byteIndex = pos >>> 3;
      const bitIndex = pos & 7;
      if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * The number of items added. Duplicates are counted, so this is an upper
   * bound on the number of distinct items.
   *
   * @returns {number}
   */
  get count() {
    return this.itemCount;
  }

  /**
   * Estimated current false-positive probability based on the number of items
   * added and the filter geometry. It is only meaningful when distinct items
   * are added; duplicates inflate it.
   *
   * @returns {number}
   */
  falsePositiveRate() {
    if (this.itemCount === 0) return 0;
    return Math.pow(1 - Math.exp((-this.hashCount * this.itemCount) / this.sizeBits), this.hashCount);
  }

  /**
   * Returns a copy of the raw bit array. Useful for serialization or for
   * inspecting the filter in tests.
   *
   * @returns {Uint8Array}
   */
  toBytes() {
    return this.bits.slice();
  }

  /**
   * Rebuilds a filter from a previous toBytes() call. The size and hash count
   * must match the original, otherwise the bit positions will not align.
   *
   * @param {Uint8Array} bytes
   * @param {number} sizeBits
   * @param {number} hashCount
   * @returns {BloomFilter}
   */
  static fromBytes(bytes, sizeBits, hashCount) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError('bytes must be a Uint8Array');
    }
    const filter = new BloomFilter({ sizeBits, hashCount });
    if (bytes.length !== filter.byteLength) {
      throw new RangeError('byte length does not match sizeBits');
    }
    filter.bits.set(bytes);
    return filter;
  }
}
