/**
 * Reads the track list of a video file: which codec each track carries and with which profile and level,
 * so that `<source type>` names exactly what the file holds. A browser answers `canPlayType` and picks the
 * first playable source by that string; a guessed level or a missing audio codec makes it answer about a
 * different file.
 *
 * Three containers are read, each by its own structure rather than by searching for markers:
 *
 * - ISO-BMFF (MP4, M4V): `moov/trak/mdia/minf/stbl/stsd` sample entries; video from `avcC`, `av1C`,
 *   `hvcC`, and `vpcC`, audio from the `mp4a` entry's `esds` descriptor or the entry type itself.
 * - Matroska (WebM): `Segment/Tracks/TrackEntry` with `CodecID`; AV1 details from its `CodecPrivate`,
 *   which holds the same configuration record as `av1C`.
 * - Ogg: the identification header of each logical stream on its first page.
 *
 * Whether an audio track carries sound is read from the size of its frames. Encoders write digital
 * silence as frames of a few bytes (AAC 4–6 and up to about 20 for the first frames, Opus 3), while
 * speech at the lowest usual bitrates takes more than {@link SILENT_FRAME_BYTES} per frame. A film from
 * agentic-screencast always has an audio track, and a film without voice has a silent one.
 *
 * Codec strings follow RFC 6381 and the codec registrations it points to: `avc1.PPCCLL` (ISO/IEC 14496-15),
 * `av01.P.LLT.DD` (AV1 codec ISO media file format binding), `hvc1.…` (ISO/IEC 14496-15 annex E),
 * `vp09.PP.LL.DD` (VP codec ISO media file format binding), and `mp4a.OO[.A]` (RFC 6381, section 3.3).
 */

/** The video family of a file; it ranks sources by compatibility. */
export type VideoCodec = 'av1' | 'h264' | 'hevc' | 'vp9' | 'vp8' | 'theora' | 'unknown';

/** What a file holds, as read from its container. */
export interface VideoStreams {
  /** Family of the first video track; `unknown` when none was read. */
  readonly codec: VideoCodec;
  /**
   * RFC 6381 codec strings, video tracks first, then audio tracks, in track order. Empty when the track
   * list could not be read or a track carries a codec that has no string here: then the type names only
   * the container and the browser decides by trying.
   */
  readonly codecs: readonly string[];
  /** The file has at least one audio track. */
  readonly audio: boolean;
  /**
   * An audio track carries sound: at least one of its frames is larger than digital silence is encoded.
   * An audio track whose frame sizes cannot be read counts as sound.
   */
  readonly sound: boolean;
  /** The container's track list was found and read. */
  readonly readable: boolean;
}

interface Track {
  readonly kind: 'video' | 'audio' | 'other';
  readonly family?: VideoCodec;
  /** The codec string, or undefined when this reader cannot name the codec. */
  readonly codec: string | undefined;
  /** The largest frame of the track in bytes, when the container lists frame sizes. */
  readonly largestFrame?: number;
}

/** A frame of at most this many bytes is silence (see the module comment). */
export const SILENT_FRAME_BYTES = 24;

const UNREADABLE: VideoStreams = {
  codec: 'unknown',
  codecs: [],
  audio: false,
  sound: false,
  readable: false,
};

export function readVideoStreams(bytes: Uint8Array, baseType: string): VideoStreams {
  let tracks: readonly Track[] | undefined;
  try {
    tracks =
      baseType === 'video/mp4'
        ? readIsoTracks(bytes)
        : baseType === 'video/webm'
          ? readMatroskaTracks(bytes)
          : baseType === 'video/ogg'
            ? readOggTracks(bytes)
            : undefined;
  } catch (error) {
    // A truncated or malformed container reads past its end; it is a file without a track list.
    if (error instanceof RangeError) tracks = undefined;
    else throw error;
  }
  if (tracks === undefined) return UNREADABLE;
  const video = tracks.filter((track) => track.kind === 'video');
  const audio = tracks.filter((track) => track.kind === 'audio');
  if (video.length === 0 && audio.length === 0) return UNREADABLE;
  const named = [...video, ...audio];
  const complete = named.every((track) => track.codec !== undefined);
  return {
    codec: video[0]?.family ?? 'unknown',
    codecs: complete ? [...new Set(named.map((track) => track.codec as string))] : [],
    audio: audio.length > 0,
    sound: audio.some(
      (track) => track.largestFrame === undefined || track.largestFrame > SILENT_FRAME_BYTES,
    ),
    readable: true,
  };
}

/** `video/mp4; codecs="avc1.640016, mp4a.40.2"`, or the bare container type without codec strings. */
export function sourceTypeOf(baseType: string, codecs: readonly string[]): string {
  return codecs.length === 0 ? baseType : `${baseType}; codecs="${codecs.join(', ')}"`;
}

/** Splits a `<source type>` value into its container and codec strings. */
export function parseSourceType(type: string): {
  readonly base: string;
  readonly codecs: readonly string[];
} {
  const [base = '', ...parameters] = type.split(';');
  const codecs = parameters
    .map((parameter) => /^\s*codecs\s*=\s*"?([^"]*)"?\s*$/iu.exec(parameter)?.[1])
    .find((value) => value !== undefined);
  return {
    base: base.trim().toLowerCase(),
    codecs:
      codecs === undefined
        ? []
        : codecs
            .split(',')
            .map((codec) => codec.trim())
            .filter(Boolean),
  };
}

/** Two types name the same container and the same codecs, in any order and letter case. */
export function sameSourceType(left: string, right: string): boolean {
  const a = parseSourceType(left);
  const b = parseSourceType(right);
  const key = (codecs: readonly string[]): string =>
    [...new Set(codecs.map((codec) => codec.toLowerCase()))].sort().join(',');
  return a.base === b.base && key(a.codecs) === key(b.codecs);
}

// ---------------------------------------------------------------------------------------------------
// ISO-BMFF

interface Box {
  readonly type: string;
  /** First byte of the payload, after the size and type. */
  readonly start: number;
  readonly end: number;
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  if (at + length > bytes.length) throw new RangeError('box past the end');
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function* boxes(bytes: Uint8Array, start: number, end: number): Generator<Box> {
  const data = view(bytes);
  let at = start;
  while (at + 8 <= end) {
    let size = data.getUint32(at);
    const type = ascii(bytes, at + 4, 4);
    let header = 8;
    if (size === 1) {
      size = Number(data.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) size = end - at;
    if (size < header || at + size > end) return;
    yield { type, start: at + header, end: at + size };
    at += size;
  }
}

function child(bytes: Uint8Array, parent: Box, type: string, offset = 0): Box | undefined {
  for (const box of boxes(bytes, parent.start + offset, parent.end))
    if (box.type === type) return box;
  return undefined;
}

function path(bytes: Uint8Array, parent: Box, types: readonly string[]): Box | undefined {
  let current: Box | undefined = parent;
  for (const type of types) {
    if (current === undefined) return undefined;
    current = child(bytes, current, type);
  }
  return current;
}

const hex = (value: number): string => value.toString(16).padStart(2, '0');
const two = (value: number): string => String(value).padStart(2, '0');

/** Visual sample entry fields before its child boxes (ISO/IEC 14496-12, 12.1.3). */
const VISUAL_ENTRY_FIELDS = 78;

const ISO_VIDEO_FAMILY: Readonly<Record<string, VideoCodec>> = {
  avc1: 'h264',
  avc3: 'h264',
  av01: 'av1',
  hvc1: 'hevc',
  hev1: 'hevc',
  vp09: 'vp9',
  vp08: 'vp8',
};

const ISO_AUDIO_CODEC: Readonly<Record<string, string>> = {
  Opus: 'opus',
  fLaC: 'flac',
  'ac-3': 'ac-3',
  'ec-3': 'ec-3',
  '.mp3': 'mp3',
};

function readIsoTracks(bytes: Uint8Array): readonly Track[] | undefined {
  const file: Box = { type: 'file', start: 0, end: bytes.length };
  const moov = child(bytes, file, 'moov');
  if (moov === undefined) return undefined;
  const tracks: Track[] = [];
  for (const trak of boxes(bytes, moov.start, moov.end)) {
    if (trak.type !== 'trak') continue;
    const mdia = child(bytes, trak, 'mdia');
    const hdlr = mdia === undefined ? undefined : child(bytes, mdia, 'hdlr');
    const stsd = mdia === undefined ? undefined : path(bytes, mdia, ['minf', 'stbl', 'stsd']);
    if (hdlr === undefined || stsd === undefined) continue;
    // hdlr: version and flags, pre_defined, then handler_type.
    const handler = ascii(bytes, hdlr.start + 8, 4);
    // stsd: version and flags, entry_count, then the sample entries; the first one describes the track.
    const entry = boxes(bytes, stsd.start + 8, stsd.end).next().value;
    if (entry === undefined) continue;
    if (handler === 'vide') tracks.push(isoVideoTrack(bytes, entry));
    else if (handler === 'soun') {
      const stbl = path(bytes, mdia as Box, ['minf', 'stbl']) as Box;
      const largestFrame = isoLargestSample(bytes, stbl);
      tracks.push({
        ...isoAudioTrack(bytes, entry),
        ...(largestFrame === undefined ? {} : { largestFrame }),
      });
    }
  }
  return tracks;
}

function isoVideoTrack(bytes: Uint8Array, entry: Box): Track {
  const family = ISO_VIDEO_FAMILY[entry.type] ?? 'unknown';
  const config = (type: string): Box | undefined => child(bytes, entry, type, VISUAL_ENTRY_FIELDS);
  let codec: string | undefined;
  if (family === 'h264') {
    const avcC = config('avcC');
    // configurationVersion, AVCProfileIndication, profile_compatibility, AVCLevelIndication.
    if (avcC !== undefined) {
      const [profile = 0, constraints = 0, level = 0] = bytes.subarray(
        avcC.start + 1,
        avcC.start + 4,
      );
      codec = `${entry.type}.${hex(profile)}${hex(constraints)}${hex(level)}`;
    }
  } else if (family === 'av1') {
    const av1C = config('av1C');
    if (av1C !== undefined) codec = av1CodecString(bytes.subarray(av1C.start, av1C.end));
  } else if (family === 'hevc') {
    const hvcC = config('hvcC');
    if (hvcC !== undefined)
      codec = hevcCodecString(entry.type, bytes.subarray(hvcC.start, hvcC.end));
  } else if (family === 'vp9') {
    const vpcC = config('vpcC');
    // A full box: version and flags, then profile, level, and bit depth in the high four bits.
    if (vpcC !== undefined) {
      const [profile = 0, level = 0, depth = 0] = bytes.subarray(vpcC.start + 4, vpcC.start + 7);
      codec = `vp09.${two(profile)}.${two(level)}.${two(depth >> 4)}`;
    }
  } else if (family === 'vp8') codec = 'vp8';
  return { kind: 'video', family, codec };
}

/** The largest sample in `stsz`: one size for every sample, or a table of sizes. */
function isoLargestSample(bytes: Uint8Array, stbl: Box): number | undefined {
  const stsz = child(bytes, stbl, 'stsz');
  if (stsz === undefined) return undefined;
  const data = view(bytes);
  // Version and flags, sample_size, sample_count, then the table when sample_size is 0.
  const size = data.getUint32(stsz.start + 4);
  if (size !== 0) return size;
  const count = data.getUint32(stsz.start + 8);
  let largest = 0;
  for (let index = 0; index < count; index += 1)
    largest = Math.max(largest, data.getUint32(stsz.start + 12 + index * 4));
  return largest;
}

/** `av01.P.LLT.DD` from an AV1CodecConfigurationRecord. */
function av1CodecString(record: Uint8Array): string | undefined {
  const [marker = 0, first = 0, second = 0] = record;
  if ((marker & 0x80) === 0) return undefined;
  const profile = first >> 5;
  const level = first & 0x1f;
  const tier = second >> 7 === 1 ? 'H' : 'M';
  const highBitDepth = (second >> 6) & 1;
  const twelveBit = (second >> 5) & 1;
  const depth = highBitDepth === 0 ? 8 : profile === 2 && twelveBit === 1 ? 12 : 10;
  return `av01.${profile}.${two(level)}${tier}.${two(depth)}`;
}

/** `hvc1.<space><profile>.<compatibility>.<tier><level>[.<constraint bytes>]` from an hvcC record. */
function hevcCodecString(type: string, record: Uint8Array): string | undefined {
  if (record.length < 13) return undefined;
  const first = record[1] ?? 0;
  const space = ['', 'A', 'B', 'C'][first >> 6] ?? '';
  const tier = (first >> 5) & 1 ? 'H' : 'L';
  const profile = first & 0x1f;
  // The 32 compatibility flags, written in reverse bit order and without leading zeros.
  const flags = view(record).getUint32(2);
  let reversed = 0;
  for (let bit = 0; bit < 32; bit += 1) reversed = (reversed << 1) | ((flags >>> bit) & 1);
  const constraints = [...record.subarray(6, 12)];
  while (constraints.length > 0 && constraints.at(-1) === 0) constraints.pop();
  const level = record[12] ?? 0;
  return [
    `${type}.${space}${profile}`,
    (reversed >>> 0).toString(16).toUpperCase(),
    `${tier}${level}`,
    ...constraints.map((value) => value.toString(16).toUpperCase().padStart(2, '0')),
  ].join('.');
}

function isoAudioTrack(bytes: Uint8Array, entry: Box): Track {
  if (entry.type === 'mp4a') {
    // Audio sample entry: 8 bytes before the version, then 20 bytes of fields in version 0, 36 in
    // version 1 and 56 in version 2 (QuickTime sound description), then the child boxes.
    const version = view(bytes).getUint16(entry.start + 8);
    const fields = 28 + (version === 1 ? 16 : version === 2 ? 36 : 0);
    const esds = child(bytes, entry, 'esds', fields);
    return {
      kind: 'audio',
      codec:
        esds === undefined ? undefined : mp4aCodecString(bytes.subarray(esds.start + 4, esds.end)),
    };
  }
  return { kind: 'audio', codec: ISO_AUDIO_CODEC[entry.type] };
}

/** Reads one MPEG-4 descriptor: its tag, and the bounds of its body. */
function descriptor(
  bytes: Uint8Array,
  at: number,
): { readonly tag: number; readonly start: number; readonly end: number } {
  const tag = bytes[at];
  if (tag === undefined) throw new RangeError('descriptor past the end');
  let length = 0;
  let cursor = at + 1;
  for (let index = 0; index < 4; index += 1) {
    const byte = bytes[cursor];
    if (byte === undefined) throw new RangeError('descriptor past the end');
    cursor += 1;
    length = (length << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return { tag, start: cursor, end: Math.min(cursor + length, bytes.length) };
}

function descriptorChild(
  bytes: Uint8Array,
  start: number,
  end: number,
  tag: number,
): { readonly start: number; readonly end: number } | undefined {
  let at = start;
  while (at < end) {
    const found = descriptor(bytes, at);
    if (found.tag === tag) return found;
    at = found.end;
  }
  return undefined;
}

/** `mp4a.40.<audio object type>` for MPEG-4 audio, `mp4a.<object type>` for the others. */
function mp4aCodecString(esds: Uint8Array): string | undefined {
  const es = descriptor(esds, 0);
  if (es.tag !== 0x03) return undefined;
  // ES_ID, then flags: stream dependence adds 2 bytes, a URL its length and 1, OCR stream 2.
  const flags = esds[es.start + 2] ?? 0;
  let at = es.start + 3;
  if (flags & 0x80) at += 2;
  if (flags & 0x40) at += 1 + (esds[at] ?? 0);
  if (flags & 0x20) at += 2;
  const config = descriptorChild(esds, at, es.end, 0x04);
  if (config === undefined) return undefined;
  const objectType = esds[config.start] ?? 0;
  if (objectType !== 0x40) return `mp4a.${hex(objectType).toUpperCase()}`;
  // DecoderConfigDescriptor: 13 bytes of fields, then DecoderSpecificInfo with AudioSpecificConfig.
  const specific = descriptorChild(esds, config.start + 13, config.end, 0x05);
  if (specific === undefined) return 'mp4a.40';
  const [first = 0, second = 0] = esds.subarray(specific.start, specific.start + 2);
  const audioObjectType =
    first >> 3 === 31 ? 32 + (((first & 7) << 3) | (second >> 5)) : first >> 3;
  return `mp4a.40.${audioObjectType}`;
}

// ---------------------------------------------------------------------------------------------------
// Matroska and WebM

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_TYPE = 0x83;
const CODEC_ID = 0x86;
const CODEC_PRIVATE = 0x63a2;
const TRACK_NUMBER = 0xd7;
const CLUSTER = 0x1f43b675;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
const SIMPLE_BLOCK = 0xa3;

interface Element {
  readonly id: number;
  readonly start: number;
  /** End of the payload; the end of the parent for an element of unknown size. */
  readonly end: number;
  readonly unknownSize: boolean;
}

/** A variable-length integer: its value (with or without the length marker) and its width. */
function vint(
  bytes: Uint8Array,
  at: number,
  keepMarker: boolean,
): { value: number; width: number } {
  const first = bytes[at];
  if (first === undefined || first === 0) throw new RangeError('vint past the end');
  const width = Math.clz32(first) - 23;
  if (at + width > bytes.length) throw new RangeError('vint past the end');
  let value = keepMarker ? first : first & (0xff >> width);
  for (let index = 1; index < width; index += 1) value = value * 256 + (bytes[at + index] ?? 0);
  return { value, width };
}

function* elements(bytes: Uint8Array, start: number, end: number): Generator<Element> {
  let at = start;
  while (at < end) {
    const id = vint(bytes, at, true);
    const size = vint(bytes, at + id.width, false);
    const payload = at + id.width + size.width;
    const unknownSize = size.value === 2 ** (7 * size.width) - 1;
    const stop = unknownSize ? end : Math.min(payload + size.value, end);
    yield { id: id.value, start: payload, end: stop, unknownSize };
    if (unknownSize) return;
    at = stop;
  }
}

const MATROSKA_CODEC: Readonly<Record<string, readonly [Track['kind'], VideoCodec, string]>> = {
  V_VP8: ['video', 'vp8', 'vp8'],
  V_VP9: ['video', 'vp9', 'vp9'],
  A_OPUS: ['audio', 'unknown', 'opus'],
  A_VORBIS: ['audio', 'unknown', 'vorbis'],
  A_FLAC: ['audio', 'unknown', 'flac'],
};

function readMatroskaTracks(bytes: Uint8Array): readonly Track[] | undefined {
  const top = elements(bytes, 0, bytes.length);
  if (top.next().value?.id !== EBML) return undefined;
  for (const segment of top) {
    if (segment.id !== SEGMENT) continue;
    // Track headers come before the first cluster; the clusters after them hold the frames.
    for (const element of elements(bytes, segment.start, segment.end)) {
      if (element.id === TRACKS) {
        const tracks = matroskaTracks(bytes, element);
        const frames = matroskaLargestFrames(bytes, element.end, segment.end);
        return tracks.map(({ number, ...track }) => {
          const largestFrame = frames.get(number);
          return largestFrame === undefined ? track : { ...track, largestFrame };
        });
      }
      if (element.id === CLUSTER) return undefined;
    }
  }
  return undefined;
}

/**
 * The largest frame of each track number, from every `SimpleBlock` and `Block` in the clusters. A
 * cluster of unknown size (a live recording) runs to the end of the segment and meets the next cluster
 * as its child, so clusters are entered wherever they appear. A laced block counts its average frame.
 */
function matroskaLargestFrames(
  bytes: Uint8Array,
  start: number,
  end: number,
): ReadonlyMap<number, number> {
  const largest = new Map<number, number>();
  const visit = (from: number, to: number): void => {
    for (const element of elements(bytes, from, to)) {
      if (element.id === CLUSTER || element.id === BLOCK_GROUP) visit(element.start, element.end);
      else if (element.id === SIMPLE_BLOCK || element.id === BLOCK) {
        const track = vint(bytes, element.start, false);
        // Track number, a 16-bit timecode, flags; lacing adds a frame count.
        const flags = bytes[element.start + track.width + 2] ?? 0;
        const laced = (flags >> 1) & 3;
        const header = track.width + 3 + (laced === 0 ? 0 : 1);
        const frames = laced === 0 ? 1 : (bytes[element.start + track.width + 3] ?? 0) + 1;
        const frame = (element.end - element.start - header) / frames;
        largest.set(track.value, Math.max(largest.get(track.value) ?? 0, frame));
      }
    }
  };
  visit(start, end);
  return largest;
}

function matroskaTracks(
  bytes: Uint8Array,
  tracks: Element,
): readonly (Track & { readonly number: number })[] {
  const found: (Track & { readonly number: number })[] = [];
  for (const entry of elements(bytes, tracks.start, tracks.end)) {
    if (entry.id !== TRACK_ENTRY) continue;
    let type = 0;
    let number = 0;
    let codecId = '';
    let codecPrivate: Uint8Array | undefined;
    for (const field of elements(bytes, entry.start, entry.end)) {
      const payload = bytes.subarray(field.start, field.end);
      const unsigned = (): number => payload.reduce((value, byte) => value * 256 + byte, 0);
      if (field.id === TRACK_TYPE) type = unsigned();
      else if (field.id === TRACK_NUMBER) number = unsigned();
      else if (field.id === CODEC_ID)
        codecId = String.fromCharCode(...payload).replace(/\0+$/u, '');
      else if (field.id === CODEC_PRIVATE) codecPrivate = payload;
    }
    const kind = type === 1 ? 'video' : type === 2 ? 'audio' : 'other';
    const known = MATROSKA_CODEC[codecId];
    if (codecId === 'V_AV1') {
      found.push({
        number,
        kind,
        family: 'av1',
        codec: codecPrivate === undefined ? undefined : av1CodecString(codecPrivate),
      });
    } else if (codecId === 'A_AAC' && codecPrivate !== undefined) {
      const first = codecPrivate[0] ?? 0;
      found.push({ number, kind, codec: `mp4a.40.${first >> 3}` });
    } else {
      found.push({
        number,
        kind,
        ...(known === undefined ? {} : { family: known[1] }),
        codec: known?.[2],
      });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------
// Ogg

const OGG_STREAMS: ReadonlyArray<readonly [string, Track]> = [
  ['\u0080theora', { kind: 'video', family: 'theora', codec: 'theora' }],
  ['\u0001vorbis', { kind: 'audio', codec: 'vorbis' }],
  ['OpusHead', { kind: 'audio', codec: 'opus' }],
  ['\u007fFLAC', { kind: 'audio', codec: 'flac' }],
];

/** Each logical stream opens with a page flagged beginning-of-stream that holds its identification header. */
function readOggTracks(bytes: Uint8Array): readonly Track[] | undefined {
  if (ascii(bytes, 0, 4) !== 'OggS') return undefined;
  const tracks: Track[] = [];
  let at = 0;
  while (at + 27 <= bytes.length && ascii(bytes, at, 4) === 'OggS') {
    const beginning = ((bytes[at + 5] ?? 0) & 0x02) !== 0;
    const segments = bytes[at + 26] ?? 0;
    const lacing = bytes.subarray(at + 27, at + 27 + segments);
    const body = at + 27 + segments;
    const length = lacing.reduce((sum, value) => sum + value, 0);
    if (!beginning) break;
    const header = ascii(bytes, body, Math.min(8, length));
    const known = OGG_STREAMS.find(([magic]) => header.startsWith(magic));
    tracks.push(known?.[1] ?? { kind: 'other', codec: undefined });
    at = body + length;
  }
  return tracks;
}
