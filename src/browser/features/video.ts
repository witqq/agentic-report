/*! agentic-report script: video */
/**
 * Embedded video: playback while visible (`video-autoplay.ts`), the start and soft seam of a loop, the
 * play/pause and chapter controls, and **Expand**, which opens the clip in a dialog.
 */

import { packageStrings } from '../../localization.js';
import { type Cleanup, provideFeature } from '../features.js';
import { asUiButton } from '../ui.js';
import { installVideoAutoplay } from '../video-autoplay.js';

const root = document.documentElement;

// ——— Видео: начало петли, мягкий стык ———

/** Стык гасит последние полсекунды петли и проявляет первые. */
export const VIDEO_SEAM_SECONDS = 0.5;

function installVideoLoop(video: HTMLVideoElement): Cleanup {
  const start = Number(video.dataset.videoStart ?? '0') || 0;
  const fade = video.dataset.videoSeam === 'fade';
  const looping = video.loop;
  // Петлю ведёт этот модуль: встроенная вернула бы ролик к нулю, а не к началу петли.
  video.loop = false;
  const toStart = (): void => {
    if (start > 0 && start < (video.duration || Number.POSITIVE_INFINITY))
      video.currentTime = start;
  };
  const onMetadata = (): void => {
    if (video.currentTime < start) toStart();
  };
  const onEnded = (): void => {
    if (!looping) return;
    toStart();
    if (start <= 0) video.currentTime = 0;
    video.removeAttribute('data-video-seam-out');
    void video.play().catch(() => undefined);
  };
  const onTime = (): void => {
    if (!fade || !Number.isFinite(video.duration)) return;
    video.toggleAttribute(
      'data-video-seam-out',
      video.duration - video.currentTime <= VIDEO_SEAM_SECONDS,
    );
  };
  if (video.readyState >= 1) onMetadata();
  video.addEventListener('loadedmetadata', onMetadata);
  video.addEventListener('ended', onEnded);
  video.addEventListener('timeupdate', onTime);
  return () => {
    video.loop = looping;
    video.removeAttribute('data-video-seam-out');
    video.removeEventListener('loadedmetadata', onMetadata);
    video.removeEventListener('ended', onEnded);
    video.removeEventListener('timeupdate', onTime);
  };
}

/** Клип во весь экран: копия плеера в диалоге, с полными контролами и звуком, с той же секунды. */
function expandClip(button: HTMLButtonElement): void {
  const figure = button.closest('figure');
  const source = figure?.querySelector<HTMLVideoElement>('video');
  if (figure === null || figure === undefined || source === null || source === undefined) return;
  const strings = packageStrings(root.dataset.packageLocale);
  const dialog = document.createElement('dialog');
  dialog.className = 'video-expand-dialog';
  dialog.dataset.videoExpandDialog = '';
  dialog.setAttribute(
    'aria-label',
    figure.querySelector('figcaption')?.textContent?.trim() || strings.expandVideo,
  );
  const player = source.cloneNode(true) as HTMLVideoElement;
  for (const attribute of [
    'data-video-autoplay',
    'data-video-background',
    'data-video-start',
    'data-video-seam',
    'data-video-seam-out',
    'loop',
    'muted',
  ])
    player.removeAttribute(attribute);
  player.controls = true;
  player.muted = false;
  player.className = 'video-expand-player';
  const at = source.currentTime;
  player.addEventListener('loadedmetadata', () => {
    player.currentTime = at;
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'video-expand-close';
  close.textContent = strings.close;
  asUiButton(close, 'secondary', 'sm');
  dialog.append(close, player);
  document.body.append(dialog);
  source.pause();
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    player.pause();
    dialog.remove();
    button.focus();
  });
  dialog.showModal();
  void player.play().catch(() => undefined);
}

function toggle(button: HTMLButtonElement): void {
  const video = button.closest('figure')?.querySelector('video');
  if (video instanceof HTMLVideoElement) {
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }
}

function seek(button: HTMLButtonElement): void {
  const video = button.closest('figure')?.querySelector('video');
  if (video instanceof HTMLVideoElement) {
    video.currentTime = Number(button.dataset.videoSeek ?? '0');
    void video.play().catch(() => undefined);
  }
}

provideFeature('video', {
  autoplay: installVideoAutoplay,
  toggle,
  seek,
  loop: installVideoLoop,
  expand: expandClip,
});
