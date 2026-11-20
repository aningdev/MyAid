/** Hex conversion for the copied Noise vectors; tests only. */
export function fromHex(text: string): Uint8Array {
  if (text.length % 2 !== 0) throw new Error(`odd hex length: ${text.length}`);
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`not hex: ${text.slice(i * 2, i * 2 + 2)}`);
    out[i] = byte;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}
