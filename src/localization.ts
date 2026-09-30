import type { ReviewBinding } from './review/contract.js';
import type { PageLocaleChoice } from './authoring/registry.js';
import { EN_STRINGS } from './localization/en.js';
import { resolvePackageLocale } from './localization/locale.js';
import { RU_STRINGS } from './localization/ru.js';

export type PackageLocale = PageLocaleChoice;

export interface PackageStrings {
  readonly formatNumber: (value: number) => string;
  readonly skipToContent: string;
  readonly hideContents: string;
  readonly showContents: string;
  readonly openContents: string;
  readonly closeContents: string;
  readonly contents: string;
  readonly current: string;
  readonly language: string;
  readonly languageName: (locale: PackageLocale) => string;
  readonly reportAttribution: string;
  readonly review: string;
  readonly scheme: string;
  readonly theme: string;
  readonly chooseTheme: string;
  readonly toggleScheme: string;
  readonly documentContents: string;
  readonly onThisPage: string;
  readonly close: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyUnavailable: string;
  readonly glossary: string;
  readonly viewFullDefinition: string;
  readonly download: (label: string) => string;
  readonly details: string;
  readonly tab: (number: number) => string;
  readonly contentSections: string;
  readonly dialog: string;
  readonly openDialog: string;
  readonly showDetails: string;
  readonly scrollableGallery: string;
  readonly compareBefore: string;
  readonly pauseVideo: string;
  readonly playVideo: string;
  readonly expandVideo: string;
  readonly videoChapters: string;
  readonly titleSlide: string;
  readonly slideCounter: (slide: number, total: number) => string;
  readonly previousSlide: string;
  readonly nextSlide: string;
  readonly slides: string;
  /** Колода слайдов в документе: роль слайда и полноэкранный просмотр. */
  readonly slide: string;
  readonly enterFullScreen: string;
  readonly exitFullScreen: string;
  /** Режим экранов, сцена со скрабом и кнопка паузы движения (раскладка и рантайм страницы). */
  readonly titleScreen: string;
  readonly screens: string;
  readonly screenLabel: (screen: number, total: number, title: string) => string;
  readonly sceneStep: (step: number, total: number) => string;
  readonly pauseMotion: string;
  readonly compareAfter: string;
  readonly comparePosition: (before: string, after: string) => string;
  readonly severity: Readonly<Record<'blocking' | 'major' | 'minor' | 'note', string>>;
  readonly findingsSummary: string;
  readonly cardStatus: Readonly<Record<'good' | 'watch' | 'risk', string>>;
  readonly diffSummary: (added: number, removed: number) => string;
  readonly filterItems: string;
  readonly filter: string;
  readonly toggleContent: string;
  readonly increment: string;
  readonly chart: string;
  readonly series: string;
  readonly value: string;
  readonly legend: string;
  readonly diagram: string;
  readonly node: (number: number) => string;
  readonly participant: (number: number) => string;
  readonly timeline: string;
  readonly event: string;
  readonly data: string;
  readonly messagesInOrder: string;
  readonly none: string;
  readonly to: string;
  readonly diagramText: {
    readonly flowLead: (nodes: number, layers: number) => string;
    readonly sequenceLead: (participants: number, messages: number) => string;
    readonly groups: string;
    readonly group: (label: string, members: readonly string[]) => string;
    readonly layers: string;
    readonly forward: string;
    readonly backward: string;
    readonly participants: string;
    /** Заголовок участников в последовательности, показанной списком шагов. */
    readonly participantsList: string;
    readonly insideItself: string;
    readonly transcript: string;
  };
  /** Просмотр схемы, графика или широкой таблицы во весь экран. */
  readonly figureViewer: {
    readonly open: string;
    readonly openLabel: (title: string) => string;
    readonly dialog: (title: string) => string;
    readonly table: string;
    readonly zoomIn: string;
    readonly zoomOut: string;
    readonly fit: string;
    readonly hint: string;
  };
  readonly diagramLayouts: {
    readonly switcher: string;
    readonly down: string;
    readonly right: string;
    readonly orthogonal: string;
  };
  readonly edgeKinds: {
    readonly call: string;
    readonly data: string;
    readonly event: string;
    readonly dependency: string;
  };
  readonly items: (count: number) => string;
  readonly reviewWorkspace: string;
  readonly reviewThisReport: string;
  readonly noThreads: string;
  readonly discussionSelected: string;
  readonly noteForSelection: string;
  readonly createNote: string;
  readonly viewThread: string;
  readonly currentNotes: string;
  readonly noMessages: string;
  readonly newMessage: string;
  readonly addMessage: string;
  readonly saveMessage: string;
  readonly cancelEdit: string;
  readonly resolveThread: string;
  readonly reopenThread: string;
  readonly previousThreads: string;
  readonly importReview: string;
  readonly exportReview: string;
  readonly exitReview: string;
  readonly openReview: string;
  readonly closeReview: string;
  readonly reviewUnavailable: string;
  readonly enterMessage: string;
  readonly agent: string;
  readonly you: string;
  readonly edit: string;
  readonly resolved: string;
  readonly unresolved: string;
  readonly prior: string;
  readonly historical: string;
  readonly threadsSummary: (total: number, open: number) => string;
  readonly reviewBinding: (binding: ReviewBinding) => string;
  readonly reviewTargetFallback: (kind: string) => string;
  readonly openDiscussion: (label: string) => string;
  readonly openNote: (label: string) => string;
  readonly resolveFor: (resolved: boolean, label: string) => string;
  readonly fileTooLarge: (bytes: number) => string;
  readonly differentRevision: string;
  readonly unsupportedReview: string;
  readonly importFailed: string;
  readonly multipleCurrentSegments: string;
  readonly unknownCurrentTarget: string;
  readonly invalidSelectionAnchor: string;
  readonly unanswered: string;
  readonly answered: string;
  readonly copyResponse: string;
  readonly downloadResponse: string;
  readonly importResponse: string;
  readonly responseCopied: string;
  readonly responseCopyUnavailable: string;
  readonly responseImportFailed: string;
  readonly responseDifferentForm: string;
  readonly responseUnsupported: string;
  readonly responseFileTooLarge: (bytes: number) => string;
  readonly responseInvalidValues: string;
  readonly responseReady: string;
  readonly unassigned: string;
  readonly itemComment: string;
  readonly openOriginal: string;
  readonly moveUp: string;
  readonly moveDown: string;
  readonly assignTo: (label: string) => string;
  /** Слой изменений с прошлой редакции (`--since`): полоса, список, пометки и призраки. */
  readonly edition: EditionStrings;
}

export interface EditionTotalsLabel {
  readonly changed: number;
  readonly added: number;
  readonly removed: number;
  readonly moved: number;
  /** Разделы, в которых что-то изменилось. */
  readonly sections: number;
}

export interface EditionStrings {
  readonly region: string;
  readonly summary: (edition: number, totals: EditionTotalsLabel) => string;
  readonly unchanged: (edition: number) => string;
  readonly localeAdded: (edition: number) => string;
  readonly show: string;
  readonly previous: string;
  readonly next: string;
  readonly list: string;
  readonly button: string;
  readonly panelTitle: string;
  readonly beforeSections: string;
  readonly empty: string;
  readonly added: string;
  readonly changed: string;
  readonly rewritten: string;
  readonly removed: string;
  readonly moved: string;
  readonly renamed: string;
  readonly movedFrom: (section: string) => string;
  readonly movedTo: (section: string) => string;
  readonly movedHere: string;
  readonly sectionAdded: string;
  readonly sectionRemoved: (title: string) => string;
  readonly sectionRenamed: (previous: string) => string;
  readonly sectionMoved: string;
  readonly contentsMark: string;
  readonly containsChanges: string;
  readonly previousText: string;
  readonly removedBlock: (kind: string, excerpt: string) => string;
  readonly kind: (kind: string) => string;
  readonly node: (label: string) => string;
  readonly edge: (from: string, to: string) => string;
  readonly removedParts: (parts: readonly string[]) => string;
  readonly point: (series: string, label: string) => string;
  readonly pointChanged: (point: string, previous: string, value: string) => string;
  readonly pointsChanged: (parts: readonly string[]) => string;
  readonly pointsAdded: (parts: readonly string[]) => string;
  readonly pointsRemoved: (parts: readonly string[]) => string;
  readonly image: (alt: string) => string;
}

export { resolvePackageLocale, supportedPackageLocale } from './localization/locale.js';

export function packageStrings(language: string | undefined): PackageStrings {
  return resolvePackageLocale(language) === 'ru' ? RU_STRINGS : EN_STRINGS;
}
