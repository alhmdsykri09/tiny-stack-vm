// Tiny stack VM for make.fun's ISA (generator/subject/ISA.md): a compact, faithful port of the reference rules.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// opcode -> [immediate bytes, pops, pushes]; every plain binary op (0x10-0x22, minus NEG, NOT and the gap at 0x1f) pops 2 and pushes 1
const T: Record<number, number[]> = {
  0: [0, 0, 0], 1: [1, 0, 1], 2: [4, 0, 1], 3: [0, 1, 0], 4: [0, 1, 2], 5: [0, 2, 2], 6: [0, 2, 3], 7: [0, 3, 3],
  23: [0, 1, 1], 27: [0, 1, 1], 48: [2, 0, 0], 49: [2, 1, 0], 50: [2, 1, 0], 51: [2, 0, 0], 52: [0, 0, 0],
  64: [0, 1, 1], 65: [0, 2, 0], 80: [0, 1, 0], 81: [0, 1, 0], 82: [0, 0, 1], 83: [0, 1, 0],
};
for (let o = 16; o <= 34; o++) if (o !== 23 && o !== 27 && o !== 31) T[o] = [0, 2, 1];

function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const n = p.length;
  const D = new Int32Array(256), C: number[] = [], M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, ol = 0, ip = 0, pc = 0, st = 0;
  const X = (c: number): [Uint8Array, number] => [out.slice(0, ol), c];
  for (;;) {
    if (st === 1e6) return X(10);
    if (pc < 0 || pc >= n) return X(9);
    const op = p[pc], t = T[op];
    if (!t) return X(5);
    if (pc + t[0] >= n) return X(9);
    st++;
    const nx = pc + 1 + t[0];
    if (sp < t[1]) return X(2);
    if (sp - t[1] + t[2] > 256) return X(3);
    pc = nx;
    if (op >= 16 && op <= 34 && t[1] === 2) {
      const b = D[sp - 1], a = D[sp - 2];
      let r = 0;
      switch (op) {
        case 16: r = a + b; break;
        case 17: r = a - b; break;
        case 18: r = Math.imul(a, b); break;
        case 19: if (!b) return X(4); r = b === -1 ? -a : Math.trunc(a / b); break;
        case 20: if (!b) return X(4); r = b === -1 ? 0 : a % b; break;
        case 21: if (!b) return X(4); r = Math.floor((a >>> 0) / (b >>> 0)); break;
        case 22: if (!b) return X(4); r = (a >>> 0) % (b >>> 0); break;
        case 24: r = a & b; break;
        case 25: r = a | b; break;
        case 26: r = a ^ b; break;
        case 28: r = a << (b & 31); break;
        case 29: r = a >> (b & 31); break;
        case 30: r = a >>> (b & 31); break;
        case 32: r = +(a === b); break;
        case 33: r = +(a < b); break;
        case 34: r = +(a >>> 0 < b >>> 0); break;
      }
      D[--sp - 1] = r | 0;
      continue;
    }
    switch (op) {
      case 0: return X(0);
      case 1: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const x = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = x; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 23: D[sp - 1] = -D[sp - 1] | 0; break;
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let go = true;
        if (op > 48) { const v = D[--sp]; go = op === 49 ? v === 0 : v !== 0; }
        if (go) pc = nx + rel;
        break;
      }
      case 51: if (C.length === 64) return X(7); C.push(nx); pc = p[nx - 2] | (p[nx - 1] << 8); break;
      case 52: if (!C.length) return X(8); pc = C.pop()!; break;
      case 64: { const a = D[sp - 1]; if (a < 0 || a > 255) return X(6); D[sp - 1] = M[a]; break; }
      case 65: { const a = D[sp - 1]; if (a < 0 || a > 255) return X(6); M[a] = D[sp - 2]; sp -= 2; break; }
      case 80: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return X(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 81: if (ol >= 65536) return X(11); out[ol++] = D[--sp] & 255; break;
      case 82: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83: return X(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const [o, c] = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), o);
  writeFileSync(join(O, id, 'exit.txt'), c + '\n');
}
