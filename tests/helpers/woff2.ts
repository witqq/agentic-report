import { brotliDecompressSync } from 'node:zlib';

/**
 * Оси вариативного шрифта WOFF2 из его таблицы `fvar`: тег, наименьшее и наибольшее значение. Разбор по
 * спецификации WOFF2 (https://www.w3.org/TR/WOFF2/): заголовок, каталог таблиц с тегами из словаря
 * известных, затем один поток Brotli, в котором таблицы лежат подряд. `fvar` не преобразуется, поэтому
 * его байты берутся из потока как есть. Шрифт без `fvar` (статический) даёт пустой список.
 */
export interface FontAxis {
  readonly tag: string;
  readonly min: number;
  readonly max: number;
}

// prettier-ignore
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep',
  'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE',
  'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt',
  'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar',
  'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
] as const;

export function woff2Axes(font: Buffer): readonly FontAxis[] {
  if (font.toString('latin1', 0, 4) !== 'wOF2') throw new Error('Not a WOFF2 file');
  const tableCount = font.readUInt16BE(12);
  const compressedLength = font.readUInt32BE(20);
  let offset = 48;
  const base128 = (): number => {
    let value = 0;
    for (let index = 0; index < 5; index += 1) {
      const byte = font[offset] ?? 0;
      offset += 1;
      value = value * 128 + (byte & 127);
      if ((byte & 128) === 0) return value;
    }
    throw new Error('Malformed UIntBase128');
  };
  const tables: { readonly tag: string; readonly length: number }[] = [];
  for (let index = 0; index < tableCount; index += 1) {
    const flags = font[offset] ?? 0;
    offset += 1;
    let tag: string;
    if ((flags & 63) === 63) {
      tag = font.toString('latin1', offset, offset + 4);
      offset += 4;
    } else {
      tag = KNOWN_TAGS[flags & 63] ?? '';
    }
    const originalLength = base128();
    const version = flags >> 6;
    // У glyf и loca версия 0 — преобразованная таблица, у остальных — наоборот: преобразована любая, кроме 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    tables.push({ tag, length: transformed ? base128() : originalLength });
  }
  const stream = brotliDecompressSync(font.subarray(offset, offset + compressedLength));
  let start = 0;
  for (const table of tables) {
    if (table.tag === 'fvar') {
      const fvar = stream.subarray(start, start + table.length);
      const axesOffset = fvar.readUInt16BE(4);
      const axisCount = fvar.readUInt16BE(8);
      const axisSize = fvar.readUInt16BE(10);
      return Array.from({ length: axisCount }, (_, axis) => {
        const at = axesOffset + axis * axisSize;
        return {
          tag: fvar.toString('latin1', at, at + 4),
          min: fvar.readInt32BE(at + 4) / 65536,
          max: fvar.readInt32BE(at + 12) / 65536,
        };
      });
    }
    start += table.length;
  }
  return [];
}
