// Vyrobí děravou desku (chybí 2 trojúhelníky) pro test hlášení o neuzavřené síti.
import { readFile, writeFile } from "node:fs/promises";
const buf = await readFile("test-modely/deska-100x60x8.stl");
const n = buf.readUInt32LE(80);
const keep = n - 2;
const out = Buffer.alloc(84 + keep * 50);
buf.copy(out, 0, 0, 84 + keep * 50);
out.writeUInt32LE(keep, 80);
await writeFile("test-modely/deska-derava.stl", out);
console.log(`deska-derava.stl: ${keep} trojúhelníků (z ${n})`);
