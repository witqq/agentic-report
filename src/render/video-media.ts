/**
 * Что лежит внутри видеофайла и как его назвать браузеру. Дорожки и их кодеки читает
 * `video-container.ts` из структуры контейнера — с профилем, уровнем и звуком, — а не угадывает по
 * имени: так браузер выбирает первый источник, который действительно умеет играть, а AV1 не отдаётся
 * браузеру без его декодера.
 */
import type { VideoCodec } from './video-container.js';

export {
  parseSourceType,
  readVideoStreams,
  sameSourceType,
  sourceTypeOf,
  type VideoCodec,
  type VideoStreams,
} from './video-container.js';

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
