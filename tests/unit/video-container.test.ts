import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseSourceType,
  readVideoStreams,
  sameSourceType,
  sourceTypeOf,
} from '../../src/render/video-container.js';

/**
 * The track list of a video file, read from its container: the `<source type>` a browser chooses by must
 * name the profile, level and audio codec the file really holds. The fixtures in
 * `tests/fixtures/video/codecs` are real encodings of one 16x16 frame (see `make.sh` there), so each
 * expected string is what ffprobe reports for that file, not what an encoder was asked for.
 *
 * The defect these tests catch: a fixed codec string per container family (`avc1.640028`, `vp9`) with
 * no audio codec, and every audio track taken for sound.
 */
const CODECS = path.resolve('tests/fixtures/video/codecs');

async function streams(file: string) {
  const baseType = file.endsWith('.webm') ? 'video/webm' : 'video/mp4';
  const bytes = await readFile(path.join(CODECS, file));
  const read = readVideoStreams(bytes, baseType);
  return { ...read, type: sourceTypeOf(baseType, read.codecs) };
}

describe('video container reader', () => {
  it.each([
    // avcC: profile 0x64 (High), constraints 0x00, level 0x0a (1.0); esds: MPEG-4 audio, AAC-LC.
    ['h264-aac.mp4', 'h264', 'video/mp4; codecs="avc1.64000a, mp4a.40.2"', true, true],
    // Main profile (0x4d, constraint 0x40), moov after mdat: the index is found at the end.
    ['h264-main-moov-last.mp4', 'h264', 'video/mp4; codecs="avc1.4d400a"', false, false],
    // av1C: profile 0, level index 0, Main tier, 8 bits.
    ['av1-aac.mp4', 'av1', 'video/mp4; codecs="av01.0.00M.08, mp4a.40.2"', true, true],
    ['h264-opus.mp4', 'h264', 'video/mp4; codecs="avc1.64000a, opus"', true, true],
    // hvcC: Main profile, compatibility flags 0x60000000 reversed, level 30, constraint byte 0x90.
    ['hevc.mp4', 'hevc', 'video/mp4; codecs="hvc1.1.6.L30.90"', false, false],
    // WebM: the CodecID of each track.
    ['vp9-opus.webm', 'vp9', 'video/webm; codecs="vp9, opus"', true, true],
    ['vp8-vorbis.webm', 'vp8', 'video/webm; codecs="vp8, vorbis"', true, true],
    // AV1 in WebM: the details come from CodecPrivate, here 10 bits.
    ['av1-10bit.webm', 'av1', 'video/webm; codecs="av01.0.00M.10"', false, false],
    // Digital silence: the audio codec is named, and the track does not count as sound.
    ['h264-silent-aac.mp4', 'h264', 'video/mp4; codecs="avc1.64000a, mp4a.40.2"', true, false],
    ['vp9-silent-opus.webm', 'vp9', 'video/webm; codecs="vp9, opus"', true, false],
  ])('reads %s', async (file, codec, type, audio, sound) => {
    expect(await streams(file)).toMatchObject({ codec, type, audio, sound, readable: true });
  });

  it('reads the Playwright recording, whose clusters have no size', async () => {
    const bytes = await readFile(path.resolve('tests/fixtures/video/playback.webm'));
    expect(readVideoStreams(bytes, 'video/webm')).toMatchObject({
      codec: 'vp8',
      codecs: ['vp8'],
      audio: false,
      readable: true,
    });
  });

  it('names only the container when the track list cannot be read', async () => {
    const whole = await readFile(path.join(CODECS, 'h264-main-moov-last.mp4'));
    // Cut before the moov box: a file copied half-way.
    const cut = whole.subarray(0, whole.indexOf('moov') - 4);
    expect(readVideoStreams(cut, 'video/mp4')).toEqual({
      codec: 'unknown',
      codecs: [],
      audio: false,
      sound: false,
      readable: false,
    });
    // Container markers alone (an ftyp brand, a CodecID string) are not a track list.
    expect(
      readVideoStreams(
        Buffer.from('000000186674797069736f6d0000020069736f6d61766331', 'hex'),
        'video/mp4',
      ),
    ).toMatchObject({ codec: 'unknown', readable: false });
    expect(sourceTypeOf('video/mp4', [])).toBe('video/mp4');
  });

  it('compares types by container and codec set, not by spelling', () => {
    expect(parseSourceType('video/mp4; codecs="avc1.640016, mp4a.40.2"')).toEqual({
      base: 'video/mp4',
      codecs: ['avc1.640016', 'mp4a.40.2'],
    });
    expect(
      sameSourceType(
        'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
        'video/mp4;codecs="mp4a.40.2,avc1.64001f"',
      ),
    ).toBe(true);
    expect(
      sameSourceType(
        'video/mp4; codecs="av01.0.08M.08, mp4a.40.2"',
        'video/mp4; codecs="av01.0.00M.08, mp4a.40.2"',
      ),
    ).toBe(false);
    expect(sameSourceType('video/webm; codecs="vp9"', 'video/webm; codecs="vp9, opus"')).toBe(
      false,
    );
  });
});
