/**
 * Что лежит внутри видеофайла и как его назвать браузеру. Кодек читается из самого файла — по
 * коду дорожки в контейнере, — а не угадывается по имени: так браузер выбирает первый источник,
 * который действительно умеет играть, а AV1 не отдаётся браузеру без его декодера.
 */
export type VideoCodec = 'av1' | 'h264' | 'hevc' | 'vp9' | 'vp8' | 'theora' | 'unknown';

const MP4_CODECS: ReadonlyArray<readonly [string, VideoCodec]> = [
  ['av01', 'av1'],
  ['avc1', 'h264'],
  ['avc3', 'h264'],
  ['hvc1', 'hevc'],
  ['hev1', 'hevc'],
  ['vp09', 'vp9'],
];
const WEBM_CODECS: ReadonlyArray<readonly [string, VideoCodec]> = [
  ['V_AV1', 'av1'],
  ['V_VP9', 'vp9'],
  ['V_VP8', 'vp8'],
];

export function detectVideoCodec(bytes: Buffer, baseType: string): VideoCodec {
  // Заголовки дорожек стоят в начале файла у подготовленного для веба ролика и в конце у
  // остальных: просматриваются оба края, а не весь файл.
  const window = 1 << 20;
  const head = bytes.subarray(0, window).toString('latin1');
  const tail =
    bytes.length > window ? bytes.subarray(bytes.length - window).toString('latin1') : '';
  const text = `${head}${tail}`;
  const table =
    baseType === 'video/webm' ? WEBM_CODECS : baseType === 'video/mp4' ? MP4_CODECS : [];
  for (const [marker, codec] of table) if (text.includes(marker)) return codec;
  if (baseType === 'video/ogg') return 'theora';
  return 'unknown';
}

/** MIME-тип с кодеком для `<source type>`; строки кодеков — общие профили, которые браузер проверяет. */
export function videoSourceType(baseType: string, codec: VideoCodec): string {
  const codecs: Partial<Record<VideoCodec, string>> = {
    av1: 'av01.0.05M.08',
    h264: 'avc1.640028',
    hevc: 'hvc1.1.6.L93.B0',
    vp9: 'vp9',
    vp8: 'vp8',
    theora: 'theora',
  };
  const value = codecs[codec];
  return value === undefined ? baseType : `${baseType}; codecs="${value}"`;
}

/** Чем кодек совместимее, тем меньше число: одному файлу достаётся самый совместимый источник. */
export function compatibilityRank(codec: VideoCodec): number {
  return { h264: 0, vp9: 1, vp8: 2, av1: 3, hevc: 4, theora: 5, unknown: 6 }[codec];
}

export interface VideoChapter {
  readonly start: number;
  readonly title: string;
}

/** Главы из WebVTT: начало каждой реплики и её первая строка текста. */
export function parseChapters(vtt: string): VideoChapter[] | undefined {
  const text = vtt.replace(/^﻿/u, '').replace(/\r\n?/gu, '\n');
  if (!text.startsWith('WEBVTT')) return undefined;
  const chapters: VideoChapter[] = [];
  for (const block of text.split(/\n{2,}/u)) {
    const lines = block.split('\n');
    const timing = lines.findIndex((line) => line.includes('-->'));
    if (timing < 0) continue;
    const start = parseTimestamp(lines[timing]?.split('-->')[0]?.trim() ?? '');
    const title = lines
      .slice(timing + 1)
      .join(' ')
      .trim();
    if (start === undefined || title === '') return undefined;
    chapters.push({ start, title });
  }
  return chapters.length > 0 ? chapters : undefined;
}

function parseTimestamp(value: string): number | undefined {
  const match = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/u.exec(value);
  if (match === null) return undefined;
  return (
    Number(match[1] ?? '0') * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}

export function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
