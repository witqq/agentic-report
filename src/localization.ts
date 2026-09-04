import type { ReviewBinding } from './review/contract.js';

export type PackageLocale = 'en' | 'ru';

export interface PackageStrings {
  readonly formatNumber: (value: number) => string;
  readonly skipToContent: string;
  readonly hideContents: string;
  readonly showContents: string;
  readonly openContents: string;
  readonly closeContents: string;
  readonly contents: string;
  readonly current: string;
  readonly review: string;
  readonly theme: string;
  readonly toggleTheme: string;
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
  readonly groups: string;
  readonly nodes: string;
  readonly connections: string;
  readonly participants: string;
  readonly messagesInOrder: string;
  readonly none: string;
  readonly to: string;
  readonly items: (count: number) => string;
  readonly reviewWorkspace: string;
  readonly reviewThisReport: string;
  readonly noThreads: string;
  readonly discussionSelected: string;
  readonly noteForSelection: string;
  readonly createNote: string;
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
}

const en: PackageStrings = {
  formatNumber: (value) =>
    new Intl.NumberFormat('en', { maximumFractionDigits: 6, useGrouping: true }).format(value),
  skipToContent: 'Skip to content',
  hideContents: 'Hide contents',
  showContents: 'Show contents',
  openContents: 'Open contents',
  closeContents: 'Close contents',
  contents: 'Contents',
  current: 'Current / ',
  review: 'Review',
  theme: 'Theme',
  toggleTheme: 'Toggle color theme',
  documentContents: 'Document contents',
  onThisPage: 'On this page',
  close: 'Close',
  copy: 'Copy',
  copied: 'Copied',
  copyUnavailable: 'Copy unavailable',
  glossary: 'Glossary',
  viewFullDefinition: 'View full definition',
  download: (label) => `Download ${label}`,
  details: 'Details',
  tab: (number) => `Tab ${number}`,
  contentSections: 'Content sections',
  dialog: 'Dialog',
  openDialog: 'Open dialog',
  showDetails: 'Show details',
  filterItems: 'Filter items',
  filter: 'Filter',
  toggleContent: 'Toggle content',
  increment: 'Increment',
  items: (count) => `${count} ${count === 1 ? 'item' : 'items'}`,
  chart: 'Chart',
  series: 'Series',
  value: 'Value',
  legend: 'Legend',
  diagram: 'Diagram',
  node: (n) => `Node ${n}`,
  participant: (n) => `Participant ${n}`,
  timeline: 'Timeline',
  event: 'Event',
  data: 'Data',
  groups: 'Groups',
  nodes: 'Nodes',
  connections: 'Connections',
  participants: 'Participants',
  messagesInOrder: 'Messages in order',
  none: 'none',
  to: 'to',
  reviewWorkspace: 'Review workspace',
  reviewThisReport: 'Review this report',
  noThreads: 'No discussion threads yet',
  discussionSelected: 'Discussion for selected block',
  noteForSelection: 'Note for selected text',
  createNote: 'Create note',
  currentNotes: 'Notes in this report',
  noMessages: 'No messages yet.',
  newMessage: 'New message',
  addMessage: 'Add message',
  saveMessage: 'Save message',
  cancelEdit: 'Cancel edit',
  resolveThread: 'Resolve thread',
  reopenThread: 'Reopen thread',
  previousThreads: 'Threads from the previous revision',
  importReview: 'Import review',
  exportReview: 'Export review.json',
  exitReview: 'Exit review',
  openReview: 'Open review',
  closeReview: 'Close review',
  reviewUnavailable: 'Review unavailable',
  enterMessage: 'Enter a message for the selected block.',
  agent: 'Agent',
  you: 'You',
  edit: 'Edit',
  resolved: 'resolved',
  unresolved: 'unresolved',
  prior: 'Prior',
  historical: 'Historical',
  threadsSummary: (total, open) =>
    `${total} ${total === 1 ? 'thread' : 'threads'} · unresolved: ${open}`,
  reviewBinding: (binding) =>
    ({ exact: 'exact', changed: 'changed', missing: 'missing', ambiguous: 'ambiguous' })[binding],
  reviewTargetFallback: (kind) =>
    kind === 'markdown:thematic-break' ? 'Thematic break' : 'Report block',
  openDiscussion: (label) => `Open discussion for ${label}`,
  openNote: (label) => `Open note for “${label}”`,
  resolveFor: (resolved, label) => `${resolved ? 'Reopen' : 'Resolve'} thread for ${label}`,
  fileTooLarge: (bytes) => `Review files must be no larger than ${bytes} bytes.`,
  differentRevision: 'This review belongs to a different report revision.',
  unsupportedReview: 'Version 1 reviews are unsupported. Export a version-3 review.',
  importFailed: 'Review import failed.',
  multipleCurrentSegments: 'Imported review contains more than one current segment for a thread.',
  unknownCurrentTarget:
    'Imported review contains a current target that is not part of this report revision.',
  invalidSelectionAnchor:
    'Imported review contains a selected-text anchor that does not match this report revision.',
  unanswered: 'Not answered',
  copyResponse: 'Copy response',
  downloadResponse: 'Download response.json',
  importResponse: 'Import response',
  responseCopied: 'Response copied',
  responseCopyUnavailable: 'Clipboard unavailable; download the response file instead.',
  responseImportFailed: 'Response import failed. Existing answers were preserved.',
  responseDifferentForm: 'This response belongs to a different or outdated form.',
  responseUnsupported: 'This response file uses an unsupported contract version.',
  responseFileTooLarge: (bytes) => `Response files must be no larger than ${bytes} bytes.`,
  responseInvalidValues: 'Correct invalid response values before exporting.',
  responseReady: 'Response file imported.',
  unassigned: 'Unassigned',
  itemComment: 'Comment',
  openOriginal: 'Open original',
  moveUp: 'Move up',
  moveDown: 'Move down',
  assignTo: (label) => `Assign to ${label}`,
};

const ru: PackageStrings = {
  formatNumber: (value) =>
    new Intl.NumberFormat('ru', { maximumFractionDigits: 6, useGrouping: true }).format(value),
  skipToContent: 'Перейти к содержимому',
  hideContents: 'Скрыть содержание',
  showContents: 'Показать содержание',
  openContents: 'Открыть содержание',
  closeContents: 'Закрыть содержание',
  contents: 'Содержание',
  current: 'Сейчас / ',
  review: 'Ревью',
  theme: 'Тема',
  toggleTheme: 'Переключить цветовую тему',
  documentContents: 'Содержание документа',
  onThisPage: 'На этой странице',
  close: 'Закрыть',
  copy: 'Копировать',
  copied: 'Скопировано',
  copyUnavailable: 'Копирование недоступно',
  glossary: 'Глоссарий',
  viewFullDefinition: 'Открыть полное определение',
  download: (label) => `Скачать ${label}`,
  details: 'Подробности',
  tab: (number) => `Вкладка ${number}`,
  contentSections: 'Разделы содержимого',
  dialog: 'Диалог',
  openDialog: 'Открыть диалог',
  showDetails: 'Показать подробности',
  filterItems: 'Фильтровать элементы',
  filter: 'Фильтр',
  toggleContent: 'Переключить содержимое',
  increment: 'Увеличить',
  chart: 'Диаграмма',
  series: 'Ряд',
  value: 'Значение',
  legend: 'Легенда',
  diagram: 'Схема',
  node: (n) => `Узел ${n}`,
  participant: (n) => `Участник ${n}`,
  timeline: 'Хронология',
  event: 'Событие',
  data: 'Данные',
  groups: 'Группы',
  nodes: 'Узлы',
  connections: 'Связи',
  participants: 'Участники',
  messagesInOrder: 'Сообщения по порядку',
  none: 'нет',
  to: 'к',
  items: (count) => `${count} ${russianCountForm(count, 'элемент', 'элемента', 'элементов')}`,
  reviewWorkspace: 'Пространство ревью',
  reviewThisReport: 'Ревью отчёта',
  noThreads: 'Обсуждений пока нет',
  discussionSelected: 'Обсуждение выбранного блока',
  noteForSelection: 'Заметка к выделенному тексту',
  createNote: 'Создать заметку',
  currentNotes: 'Заметки в этом отчёте',
  noMessages: 'Сообщений пока нет.',
  newMessage: 'Новое сообщение',
  addMessage: 'Добавить сообщение',
  saveMessage: 'Сохранить сообщение',
  cancelEdit: 'Отменить редактирование',
  resolveThread: 'Закрыть обсуждение',
  reopenThread: 'Возобновить обсуждение',
  previousThreads: 'Обсуждения предыдущей редакции',
  importReview: 'Импортировать ревью',
  exportReview: 'Экспортировать review.json',
  exitReview: 'Выйти из ревью',
  openReview: 'Открыть ревью',
  closeReview: 'Закрыть ревью',
  reviewUnavailable: 'Ревью недоступно',
  enterMessage: 'Введите сообщение для выбранного блока.',
  agent: 'Агент',
  you: 'Вы',
  edit: 'Изменить',
  resolved: 'закрыто',
  unresolved: 'открыто',
  prior: 'Предыдущее',
  historical: 'Историческое',
  threadsSummary: (total, open) =>
    `${total} ${russianCountForm(total, 'обсуждение', 'обсуждения', 'обсуждений')} · открыто: ${open}`,
  reviewBinding: (binding) =>
    ({ exact: 'точно', changed: 'изменено', missing: 'не найдено', ambiguous: 'неоднозначно' })[
      binding
    ],
  reviewTargetFallback: (kind) =>
    kind === 'markdown:thematic-break' ? 'Разделитель' : 'Блок отчёта',
  openDiscussion: (label) => `Открыть обсуждение: ${label}`,
  openNote: (label) => `Открыть заметку к «${label}»`,
  resolveFor: (resolved, label) => `${resolved ? 'Возобновить' : 'Закрыть'} обсуждение: ${label}`,
  fileTooLarge: (bytes) => `Размер файла ревью не должен превышать ${bytes} байт.`,
  differentRevision: 'Это ревью относится к другой редакции отчёта.',
  unsupportedReview: 'Ревью версии 1 не поддерживаются. Экспортируйте ревью версии 3.',
  importFailed: 'Не удалось импортировать ревью.',
  multipleCurrentSegments:
    'Импортированное ревью содержит несколько текущих сегментов одного обсуждения.',
  unknownCurrentTarget:
    'Импортированное ревью содержит текущую цель, которой нет в этой редакции отчёта.',
  invalidSelectionAnchor:
    'Импортированное ревью содержит привязку к выделенному тексту, которой нет в этой редакции отчёта.',
  unanswered: 'Нет ответа',
  copyResponse: 'Копировать ответ',
  downloadResponse: 'Скачать response.json',
  importResponse: 'Импортировать ответ',
  responseCopied: 'Ответ скопирован',
  responseCopyUnavailable: 'Буфер недоступен; скачайте файл ответа.',
  responseImportFailed: 'Не удалось импортировать ответ. Введённые ответы сохранены.',
  responseDifferentForm: 'Ответ относится к другой или устаревшей форме.',
  responseUnsupported: 'Версия файла ответа не поддерживается.',
  responseFileTooLarge: (bytes) => `Размер файла ответа не должен превышать ${bytes} байт.`,
  responseInvalidValues: 'Исправьте недопустимые значения ответа перед экспортом.',
  responseReady: 'Файл ответа импортирован.',
  unassigned: 'Не распределено',
  itemComment: 'Комментарий',
  openOriginal: 'Открыть оригинал',
  moveUp: 'Поднять',
  moveDown: 'Опустить',
  assignTo: (label) => `Переместить в «${label}»`,
};

export function resolvePackageLocale(language: string | undefined): PackageLocale {
  return language?.trim().toLowerCase().split(/[-_]/u, 1)[0] === 'ru' ? 'ru' : 'en';
}

export function packageStrings(language: string | undefined): PackageStrings {
  return resolvePackageLocale(language) === 'ru' ? ru : en;
}

function russianCountForm(count: number, singular: string, paucal: string, plural: string): string {
  if (count % 10 === 1 && count % 100 !== 11) return singular;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return paucal;
  return plural;
}
