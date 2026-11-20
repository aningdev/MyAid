/**
 * A pairing link as QR modules. `uqr` is pure JS and returns a matrix; the
 * page paints it. The border is the quiet zone a camera needs.
 */
import { encode } from "uqr";

/** Black modules, including a four-module quiet zone. */
export function qrModules(text: string): boolean[][] {
  return encode(text, { ecc: "M", border: 4 }).data;
}
