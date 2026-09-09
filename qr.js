/* ---------------------------------------------------------------------------
 * qr.js — self-contained QR Code encoder (ISO/IEC 18004)
 *
 * Byte mode, error-correction level L, versions 1-15 (up to 523 bytes).
 * Bundled rather than loaded from a CDN so the game works with no internet
 * connection at the venue.
 *
 *   QRCodeGen.encode("some text")  ->  { size, modules }
 *   QRCodeGen.toCanvas(canvas, "some text", { sizePx, quiet, dark, light })
 * ------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  /* ---- GF(256) arithmetic, primitive polynomial x^8+x^4+x^3+x^2+1 ------- */

  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function initTables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gmul(a, b) {
    return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
  }

  /* ---- Reed-Solomon error correction ----------------------------------- */

  // Product of (x - alpha^i) for i in [0, degree), highest power first.
  function generatorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];                      // multiply by x
        next[j + 1] ^= gmul(poly[j], EXP[i]);    // multiply by alpha^i
      }
      poly = next;
    }
    return poly;
  }

  function ecCodewords(data, ecLen) {
    const gen = generatorPoly(ecLen);
    const buf = new Uint8Array(data.length + ecLen);
    buf.set(data);
    for (let i = 0; i < data.length; i++) {
      const factor = buf[i];
      if (factor === 0) continue;
      for (let j = 0; j < gen.length; j++) buf[i + j] ^= gmul(gen[j], factor);
    }
    return buf.slice(data.length);
  }

  /* ---- Version tables (EC level L) -------------------------------------
   * [ dataCodewords, ecPerBlock, blocksG1, dcPerBlockG1, blocksG2, dcPerBlockG2 ]
   */
  const VERSIONS = {
    1:  [19,   7, 1,  19, 0,   0],
    2:  [34,  10, 1,  34, 0,   0],
    3:  [55,  15, 1,  55, 0,   0],
    4:  [80,  20, 1,  80, 0,   0],
    5:  [108, 26, 1, 108, 0,   0],
    6:  [136, 18, 2,  68, 0,   0],
    7:  [156, 20, 2,  78, 0,   0],
    8:  [194, 24, 2,  97, 0,   0],
    9:  [232, 30, 2, 116, 0,   0],
    10: [274, 18, 2,  68, 2,  69],
    11: [324, 20, 4,  81, 0,   0],
    12: [370, 24, 2,  92, 2,  93],
    13: [428, 26, 4, 107, 0,   0],
    14: [461, 30, 3, 115, 1, 116],
    15: [523, 22, 5,  87, 1,  88]
  };

  const ALIGN_CENTERS = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
    11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62],
    14: [6, 26, 46, 66], 15: [6, 26, 48, 70]
  };

  const MAX_VERSION = 15;
  const EC_LEVEL_BITS = 0b01; // level L

  /* ---- BCH check bits for format / version information ----------------- */

  function bitLength(n) {
    let len = 0;
    while (n !== 0) { len++; n >>>= 1; }
    return len;
  }

  function bchRemainder(data, generator, genBits) {
    let d = data;
    while (bitLength(d) >= genBits) d ^= generator << (bitLength(d) - genBits);
    return d;
  }

  function formatInfo(mask) {
    const data = (EC_LEVEL_BITS << 3) | mask;
    const bits = (data << 10) | bchRemainder(data << 10, 0x537, 11);
    return bits ^ 0x5412;
  }

  function versionInfo(version) {
    return (version << 12) | bchRemainder(version << 12, 0x1f25, 13);
  }

  /* ---- Bit buffer ------------------------------------------------------ */

  function BitBuffer() { this.bits = []; }
  BitBuffer.prototype.put = function (value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  };

  /* ---- Data encoding --------------------------------------------------- */

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    const out = [];
    const encoded = unescape(encodeURIComponent(str));
    for (let i = 0; i < encoded.length; i++) out.push(encoded.charCodeAt(i));
    return new Uint8Array(out);
  }

  function chooseVersion(byteLength) {
    for (let v = 1; v <= MAX_VERSION; v++) {
      const countBits = v < 10 ? 8 : 16;
      const needed = 4 + countBits + byteLength * 8;
      if (needed <= VERSIONS[v][0] * 8) return v;
    }
    throw new Error('Text too long for QR version ' + MAX_VERSION + ' (' + byteLength + ' bytes)');
  }

  function buildCodewords(bytes, version) {
    const [dataCodewords] = VERSIONS[version];
    const capacityBits = dataCodewords * 8;
    const buf = new BitBuffer();

    buf.put(0b0100, 4);                                  // byte mode
    buf.put(bytes.length, version < 10 ? 8 : 16);        // character count
    for (let i = 0; i < bytes.length; i++) buf.put(bytes[i], 8);

    // Terminator, then pad to a byte boundary.
    buf.put(0, Math.min(4, capacityBits - buf.bits.length));
    while (buf.bits.length % 8 !== 0) buf.bits.push(0);

    const data = new Uint8Array(dataCodewords);
    for (let i = 0; i < buf.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | buf.bits[i + j];
      data[i / 8] = byte;
    }
    // Alternating pad codewords fill any remaining space.
    for (let i = buf.bits.length / 8, alt = 0; i < dataCodewords; i++, alt++) {
      data[i] = alt % 2 === 0 ? 0xec : 0x11;
    }
    return data;
  }

  // Split into RS blocks, then interleave data and EC codewords.
  function interleave(data, version) {
    const [, ecPerBlock, blocksG1, dcG1, blocksG2, dcG2] = VERSIONS[version];
    const dataBlocks = [];
    const ecBlocks = [];

    let offset = 0;
    for (let b = 0; b < blocksG1 + blocksG2; b++) {
      const len = b < blocksG1 ? dcG1 : dcG2;
      const block = data.slice(offset, offset + len);
      offset += len;
      dataBlocks.push(block);
      ecBlocks.push(ecCodewords(block, ecPerBlock));
    }

    const out = [];
    const maxData = Math.max(dcG1, dcG2);
    for (let i = 0; i < maxData; i++) {
      for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (const block of ecBlocks) out.push(block[i]);
    }
    return out;
  }

  /* ---- Matrix construction --------------------------------------------- */

  function newGrid(size, value) {
    const grid = [];
    for (let r = 0; r < size; r++) grid.push(new Uint8Array(size).fill(value));
    return grid;
  }

  function placeFunctionPatterns(modules, reserved, version) {
    const size = modules.length;

    const setFn = (r, c, dark) => {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      modules[r][c] = dark ? 1 : 0;
      reserved[r][c] = 1;
    };

    // Finder patterns + separators at three corners.
    const finderAt = (top, left) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                         (c >= 0 && c <= 6 && (r === 0 || r === 6));
          const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          setFn(top + r, left + c, inRing || inCore);
        }
      }
    };
    finderAt(0, 0);
    finderAt(0, size - 7);
    finderAt(size - 7, 0);

    // Timing patterns.
    for (let i = 8; i < size - 8; i++) {
      const dark = i % 2 === 0;
      setFn(6, i, dark);
      setFn(i, 6, dark);
    }

    // Alignment patterns, skipping the finder corners.
    const centers = ALIGN_CENTERS[version];
    const last = centers[centers.length - 1];
    for (const cr of centers) {
      for (const cc of centers) {
        if ((cr === 6 && cc === 6) || (cr === 6 && cc === last) || (cr === last && cc === 6)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const ring = Math.max(Math.abs(dr), Math.abs(dc));
            setFn(cr + dr, cc + dc, ring !== 1);
          }
        }
      }
    }

    // Reserve the format-information areas and set the fixed dark module.
    for (let i = 0; i < 9; i++) {
      if (!reserved[8][i]) { modules[8][i] = 0; reserved[8][i] = 1; }
      if (!reserved[i][8]) { modules[i][8] = 0; reserved[i][8] = 1; }
    }
    for (let i = 0; i < 8; i++) {
      reserved[8][size - 1 - i] = 1;
      reserved[size - 1 - i][8] = 1;
    }
    setFn(size - 8, 8, true);

    // Reserve version information for version 7 and above.
    if (version >= 7) {
      for (let i = 0; i < 18; i++) {
        const a = Math.floor(i / 3);
        const b = i % 3;
        reserved[size - 11 + b][a] = 1;
        reserved[a][size - 11 + b] = 1;
      }
    }
  }

  function placeData(modules, reserved, codewords) {
    const size = modules.length;
    const bits = [];
    for (const cw of codewords) {
      for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
    }

    let index = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing pattern column
      for (let step = 0; step < size; step++) {
        const row = upward ? size - 1 - step : step;
        for (const col of [right, right - 1]) {
          if (reserved[row][col]) continue;
          modules[row][col] = index < bits.length ? bits[index] : 0;
          index++;
        }
      }
      upward = !upward;
    }
  }

  function maskBit(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return false;
    }
  }

  function applyMask(modules, reserved, mask) {
    const size = modules.length;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && maskBit(mask, r, c)) modules[r][c] ^= 1;
      }
    }
  }

  function placeFormatInfo(modules, mask, version) {
    const size = modules.length;
    const bits = formatInfo(mask);
    // Format information is placed most-significant bit first: bit(0) is the
    // MSB of the 15-bit field. (Version information below is the opposite —
    // it really is placed least-significant bit first.)
    const bit = i => (bits >>> (14 - i)) & 1;

    // Copy 1: around the top-left finder.
    for (let i = 0; i <= 5; i++) modules[8][i] = bit(i);
    modules[8][7] = bit(6);
    modules[8][8] = bit(7);
    modules[7][8] = bit(8);
    for (let i = 9; i <= 14; i++) modules[14 - i][8] = bit(i);

    // Copy 2: bits 0-6 run up the bottom-left, bits 7-14 run along the
    // top-right. The module at (size-8, 8) between them is always dark.
    for (let i = 0; i <= 6; i++) modules[size - 1 - i][8] = bit(i);
    for (let i = 7; i <= 14; i++) modules[8][size - 15 + i] = bit(i);
    modules[size - 8][8] = 1;

    if (version >= 7) {
      const vbits = versionInfo(version);
      for (let i = 0; i < 18; i++) {
        const b = (vbits >>> i) & 1;
        const a = Math.floor(i / 3);
        const o = i % 3;
        modules[size - 11 + o][a] = b;
        modules[a][size - 11 + o] = b;
      }
    }
  }

  /* ---- Mask penalty scoring (ISO/IEC 18004 section 8.8.2) -------------- */

  function penalty(modules) {
    const size = modules.length;
    let score = 0;

    // Rule 1: runs of five or more same-coloured modules in a line.
    const scoreLine = get => {
      let run = 1;
      for (let i = 1; i < size; i++) {
        if (get(i) === get(i - 1)) {
          run++;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    };
    for (let r = 0; r < size; r++) scoreLine(i => modules[r][i]);
    for (let c = 0; c < size; c++) scoreLine(i => modules[i][c]);

    // Rule 2: 2x2 blocks of the same colour.
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = modules[r][c];
        if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
      }
    }

    // Rule 3: 1:1:3:1:1 finder-like patterns with a four-module light margin.
    const FINDER = [1, 0, 1, 1, 1, 0, 1];
    const matchesAt = (get, start, pattern) => {
      for (let i = 0; i < pattern.length; i++) {
        const pos = start + i;
        const value = pos < 0 || pos >= size ? 0 : get(pos);
        if (value !== pattern[i]) return false;
      }
      return true;
    };
    const scoreFinderLike = get => {
      for (let i = 0; i <= size - 7; i++) {
        if (!matchesAt(get, i, FINDER)) continue;
        const before = matchesAt(get, i - 4, [0, 0, 0, 0]);
        const after = matchesAt(get, i + 7, [0, 0, 0, 0]);
        if (before || after) score += 40;
      }
    };
    for (let r = 0; r < size; r++) scoreFinderLike(i => modules[r][i]);
    for (let c = 0; c < size; c++) scoreFinderLike(i => modules[i][c]);

    // Rule 4: deviation from a 50% dark ratio.
    let dark = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) dark += modules[r][c];
    }
    const percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;

    return score;
  }

  /* ---- Public API ------------------------------------------------------- */

  function encode(text) {
    const bytes = utf8Bytes(String(text));
    const version = chooseVersion(bytes.length);
    const size = 17 + version * 4;
    const codewords = interleave(buildCodewords(bytes, version), version);

    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const modules = newGrid(size, 0);
      const reserved = newGrid(size, 0);
      placeFunctionPatterns(modules, reserved, version);
      placeData(modules, reserved, codewords);
      applyMask(modules, reserved, mask);
      placeFormatInfo(modules, mask, version);

      const score = penalty(modules);
      if (!best || score < best.score) best = { score, modules, mask };
    }

    return { size, version, mask: best.mask, modules: best.modules };
  }

  function toCanvas(canvas, text, options) {
    const opts = options || {};
    const quiet = opts.quiet == null ? 4 : opts.quiet;
    const dark = opts.dark || '#1b1b1b';
    const light = opts.light || '#ffffff';

    const qr = encode(text);
    const total = qr.size + quiet * 2;
    // Aim for the requested pixel size, but keep modules on whole pixels so
    // phone cameras get crisp edges.
    const targetPx = opts.sizePx || 360;
    const scale = Math.max(1, Math.floor(targetPx / total));
    const pixels = total * scale;
    const dpr = (global.devicePixelRatio || 1);

    canvas.width = pixels * dpr;
    canvas.height = pixels * dpr;
    canvas.style.width = pixels + 'px';
    canvas.style.height = pixels + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, pixels, pixels);
    ctx.fillStyle = dark;
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) {
          ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
        }
      }
    }
    return qr;
  }

  const QRCodeGen = { encode, toCanvas, MAX_VERSION };

  global.QRCodeGen = QRCodeGen;
  if (typeof module !== 'undefined' && module.exports) module.exports = QRCodeGen;
})(typeof globalThis !== 'undefined' ? globalThis : this);
