// ANSI escape + control character stripping for user-supplied content.
// Per AC-NF-4: nothing flowing through the logger should be able to
// reposition the cursor, rewrite scrollback, or emit OSC sequences a
// tampered MCP config could weaponize.
//
// Hand-rolled per D-011 (no chalk / strip-ansi dependency); the regex
// covers CSI (`ESC [ ... letter`), OSC (`ESC ] ... BEL` or `ESC ] ... ST`),
// and the lone-byte sequences `ESC @` through `ESC _`.

// Cover the ECMA-48 escape forms a terminal would interpret:
//   - CSI:  ESC [ <param bytes 0x30-0x3F>* <intermediate bytes 0x20-0x2F>* <final 0x40-0x7E>
//   - OSC:  ESC ] <payload>(BEL | ESC \)   payload excludes BEL and ESC
//   - nF:   ESC <intermediates 0x20-0x2F>+ <final 0x30-0x7E>
//   - Fp/Fe/Fs:  ESC <single byte 0x30-0x7E>   (covers e.g. ESC 7 / ESC 8)
//
// Order matters: CSI / OSC / nF are tried before the single-byte fallback
// so a complete sequence consumes its full extent. A malformed OSC (no
// terminator) falls through to the single-byte fallback, which still
// strips the leading ESC ] and leaves the payload as inert text.
const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\x1b(?:\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[\x20-\x2F]+[\x30-\x7E]|[\x30-\x7E])/g;

// Allow ordinary tab, line feed, carriage return; strip everything else
// in C0 + DEL.
// eslint-disable-next-line no-control-regex
const CONTROL_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}

export function stripControlChars(input: string): string {
  return input.replace(CONTROL_PATTERN, '');
}

export function sanitize(input: string): string {
  return stripControlChars(stripAnsi(input));
}
