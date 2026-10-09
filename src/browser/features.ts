/**
 * Page features in the browser. A page's script carries the core runtime and only the feature modules
 * its content needs (`src/page-features.ts` decides which, at build time). A feature module puts its
 * implementation into a named slot when it is evaluated; the runtime calls the slot at the place where
 * the behaviour belongs — in activation order, in a delegated event branch, in the technique installer —
 * and skips a slot nobody filled, because its hosts are not on the page.
 */

import type { PackageStrings } from '../localization.js';
import type { ReviewArtifact } from '../review/contract.js';
import type { ResponseWorkspacesController } from './response-workspace.js';
import type { ReviewWorkspaceController } from './review-workspace.js';

export type Cleanup = () => void;

export interface Destroyable {
  readonly destroy: () => void;
}

/** What each slot holds. The runtime reads `strings` at call time: the page language may change. */
export interface FeatureSlots {
  /** Initialize package content in one actual DOM instance; its owner releases it on destruction. */
  readonly content: (scope: HTMLElement) => Cleanup;
  readonly diagramMotion: (scope: HTMLElement) => Cleanup;
  readonly composition: (page: HTMLElement, still: MediaQueryList) => Cleanup;
  readonly gallery: {
    readonly create: (page: HTMLElement, strings: () => PackageStrings) => Destroyable | undefined;
    readonly keydown: (event: KeyboardEvent, target: Element) => boolean;
  };
  readonly diagramFit: (page: HTMLElement) => Destroyable | undefined;
  readonly diagramForms: (page: HTMLElement) => Cleanup;
  readonly figureViewer: (page: HTMLElement, strings: PackageStrings) => Cleanup;
  readonly stepScene: (section: HTMLElement, live: 'wide' | 'narrow' | undefined) => Cleanup;
  readonly scrubScenes: (
    page: HTMLElement,
    still: MediaQueryList,
    strings: PackageStrings,
  ) => Cleanup | undefined;
  readonly count: (element: HTMLElement) => Cleanup;
  readonly slides: (
    page: HTMLElement,
    motion: MediaQueryList,
    strings: () => PackageStrings,
  ) => Destroyable | undefined;
  readonly decks: (
    page: HTMLElement,
    motion: MediaQueryList,
    strings: () => PackageStrings,
  ) => Destroyable | undefined;
  readonly screens: (
    page: HTMLElement,
    still: MediaQueryList,
    strings: PackageStrings,
  ) => Cleanup | undefined;
  readonly response: (page: HTMLElement) => ResponseWorkspacesController;
  readonly review: (
    page: HTMLElement,
    initial: ReviewArtifact | undefined,
  ) => ReviewWorkspaceController | undefined;
  readonly filter: (input: HTMLInputElement, strings: PackageStrings) => void;
  readonly copy: {
    readonly button: (kind: 'code' | 'prose', strings: PackageStrings) => HTMLButtonElement;
    readonly run: (button: HTMLButtonElement, strings: () => PackageStrings) => Promise<void>;
  };
  readonly code: (page: HTMLElement, strings: PackageStrings) => void;
  readonly copyable: (page: HTMLElement, strings: PackageStrings) => void;
  readonly video: {
    readonly autoplay: (
      scope: HTMLElement,
      still: MediaQueryList,
      strings: { readonly playVideo: string; readonly pauseVideo: string },
    ) => Cleanup;
    readonly toggle: (button: HTMLButtonElement) => void;
    readonly seek: (button: HTMLButtonElement) => void;
    readonly loop: (video: HTMLVideoElement) => Cleanup;
    readonly expand: (button: HTMLButtonElement) => void;
  };
  readonly tabs: {
    readonly select: (control: HTMLButtonElement, moveFocus: boolean) => void;
    readonly key: (event: KeyboardEvent, tab: HTMLButtonElement) => void;
    readonly orientation: (page: ParentNode) => void;
    readonly verticalKey: (event: KeyboardEvent) => void;
  };
  readonly modal: {
    readonly open: (button: HTMLButtonElement) => void;
    readonly close: (button: HTMLButtonElement) => void;
    readonly closed: (dialog: HTMLDialogElement) => void;
  };
  readonly popover: {
    readonly closeOutside: (target: Element) => void;
    readonly closeAll: () => void;
    readonly trigger: (trigger: HTMLElement) => void;
    readonly escape: (target: Element) => void;
    readonly pointerOver: (target: Element) => void;
    readonly pointerOut: (target: Element, related: EventTarget | null) => void;
    readonly focusIn: (target: Element) => void;
    readonly focusOut: (target: Element, related: EventTarget | null) => void;
  };
  readonly toggle: (control: HTMLButtonElement) => void;
  readonly demo: {
    readonly increment: (button: HTMLButtonElement) => void;
    readonly scene: (demo: HTMLElement) => Cleanup;
  };
  readonly compare: {
    readonly input: (range: HTMLInputElement) => void;
    readonly pointerDown: (event: PointerEvent) => void;
    readonly touchStart: (event: TouchEvent) => void;
  };
  readonly swap: (element: HTMLElement) => Cleanup;
  readonly typing: (element: HTMLElement) => Cleanup;
  readonly mark: (element: HTMLElement) => Cleanup;
  readonly spotlight: (element: HTMLElement) => Cleanup;
  readonly log: (pre: HTMLElement) => Cleanup;
  readonly stickyContents: (nav: HTMLElement) => Cleanup;
}

export type FeatureSlot = keyof FeatureSlots;

const provided: { -readonly [Slot in FeatureSlot]?: FeatureSlots[Slot] } = {};

/** Fills a slot. A slot has one provider; a module evaluated once fills it once. */
export function provideFeature<Slot extends FeatureSlot>(
  slot: Slot,
  implementation: FeatureSlots[Slot],
): void {
  provided[slot] = implementation;
}

/** The slot's implementation, or nothing when the page does not carry the feature. */
export function feature<Slot extends FeatureSlot>(slot: Slot): FeatureSlots[Slot] | undefined {
  return provided[slot];
}

/** Nested content instances belong to their own mount, including initially unmounted templates. */
export function contentElements<ElementType extends Element = HTMLElement>(
  scope: HTMLElement,
  selector: string,
): ElementType[] {
  return [...scope.querySelectorAll<ElementType>(selector)].filter((element) => {
    const owner = element.closest('[data-content-scope], [data-composition-content]');
    return owner === null || owner === scope;
  });
}
