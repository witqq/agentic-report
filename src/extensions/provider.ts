/**
 * Поставщик (`kind: provider`) — внешняя программа, которую сборка запускает на каждое использование
 * директивы: JSON на stdin `{ name, attributes, content, language, data, source: { file, line } }`,
 * Markdown на stdout. `data` — разобранные файлы данных страницы (поле `data` манифеста) по имени без
 * `.json`: так поставщик читает данные рядом со страницей, а компилятор не отдаёт ему ни путей, ни
 * файлов вне того, что страница объявила в пределах корня источника. Программа запускается без оболочки (argv из манифеста), в каталоге расширения, с минимальным
 * окружением (`src/config/environment.ts`), с пределом времени и объёма вывода. Её Markdown дальше идёт
 * тем же путём, что написанный автором: разбор, проверки, очистка, — поэтому поставщик может выдать ровно
 * то, что мог бы написать автор. Поставщик — локальный код, который автор сам выбрал, как любой скрипт
 * сборки; страница его кода не несёт.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { getProviderEnvironment } from '../config/environment.js';
import { AgenticReportError } from '../diagnostics.js';
import type { ProviderExtension } from './types.js';

/** Предел вывода поставщика: больше — отказ, а не обрезанная страница. */
export const MAX_PROVIDER_OUTPUT_BYTES = 1_048_576;
const STDERR_TAIL_BYTES = 2_048;

export interface ProviderInput {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly content: string;
  readonly language: string | undefined;
  /** Файлы данных страницы по имени без `.json`; пустой объект, если страница их не объявила. */
  readonly data: Readonly<Record<string, unknown>>;
  readonly source: { readonly file: string; readonly line: number };
}

/** Результаты поставщиков одной сборки по хешу входа: одинаковый вызов выполняется один раз. */
export type ProviderCache = Map<string, Promise<string>>;

export function createProviderCache(): ProviderCache {
  return new Map();
}

/**
 * Вывод поставщика для входа. Ключ кеша — расширение, его команда и вход без места в источнике (данные
 * страницы входят): одна и та же таблица, вставленная дважды или в двух языковых вариантах, считается
 * один раз.
 */
export function runProvider(
  extension: ProviderExtension,
  input: ProviderInput,
  cache: ProviderCache,
): Promise<string> {
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        extension.manifestPath,
        extension.command,
        input.name,
        input.attributes,
        input.content,
        input.language ?? null,
        input.data,
      ]),
    )
    .digest('hex');
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const run = execute(extension, input);
  cache.set(key, run);
  return run;
}

function execute(extension: ProviderExtension, input: ProviderInput): Promise<string> {
  const [program, ...args] = extension.command;
  const cwd = path.dirname(extension.manifestPath);
  return new Promise<string>((resolve, reject) => {
    const child = spawn(program, args, {
      cwd,
      env: getProviderEnvironment(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      // Своя группа процессов: при отказе убивается вся группа, включая внуков вроде `sh -c` или
      // `npm run`, иначе они держат stdout открытым и сборка ждёт их вечно.
      detached: process.platform !== 'win32',
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = Buffer.alloc(0);
    let settled = false;
    const killGroup = (): void => {
      try {
        if (process.platform !== 'win32' && child.pid !== undefined)
          process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        // Группа уже завершилась.
      }
    };
    // Отказ отвечает сразу, не дожидаясь 'close': закрытие ждёт всех держателей stdout, а внук
    // процесса может держать его сколько угодно.
    const fail = (error: AgenticReportError): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killGroup();
      child.stdout.destroy();
      child.stderr.destroy();
      child.stdin.destroy();
      reject(error);
    };
    const timer = setTimeout(() => {
      fail(
        providerError(
          extension,
          'EXTENSION_PROVIDER_TIMEOUT',
          `Provider ${extension.name} did not finish within ${extension.timeoutMs} ms.`,
          'Make the provider faster, cache its data, or raise timeoutMs in its manifest.',
          stderr,
        ),
      );
    }, extension.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_PROVIDER_OUTPUT_BYTES) {
        fail(
          providerError(
            extension,
            'EXTENSION_PROVIDER_OUTPUT_TOO_LARGE',
            `Provider ${extension.name} wrote more than ${MAX_PROVIDER_OUTPUT_BYTES} bytes of Markdown.`,
            'Summarize the data or split it across several directives; a page is not a data dump.',
            stderr,
          ),
        );
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > STDERR_TAIL_BYTES) stderr = stderr.subarray(-STDERR_TAIL_BYTES);
    });
    child.on('error', (error) => {
      fail(
        new AgenticReportError(
          {
            level: 'error',
            code: 'EXTENSION_PROVIDER_FAILED',
            message: `Provider ${extension.name} could not start: ${program}.`,
            remediation:
              'Check the command in the extension manifest; the program must be on PATH or given relative to the extension directory.',
            source: { file: extension.manifestPath },
            details: { extension: extension.name, reason: error.message },
          },
          { cause: error },
        ),
      );
    });
    // Поставщик, не читающий stdin, закрывает его раньше, чем вход записан: это не ошибка сборки.
    child.stdin.on('error', () => undefined);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(
          providerError(
            extension,
            'EXTENSION_PROVIDER_FAILED',
            `Provider ${extension.name} exited with ${code === null ? `signal ${signal ?? 'unknown'}` : `code ${code}`}.`,
            'Read the provider error output in details.stderr and fix the provider or its input.',
            stderr,
          ),
        );
        return;
      }
      try {
        resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stdout)));
      } catch {
        reject(
          providerError(
            extension,
            'EXTENSION_PROVIDER_OUTPUT_INVALID',
            `Provider ${extension.name} wrote output that is not UTF-8 text.`,
            'Write Markdown as UTF-8 to standard output.',
            stderr,
          ),
        );
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function providerError(
  extension: ProviderExtension,
  code: string,
  message: string,
  remediation: string,
  stderr: Buffer,
): AgenticReportError {
  const tail = stderr.toString('utf8').trim();
  return new AgenticReportError({
    level: 'error',
    code,
    message,
    remediation,
    source: { file: extension.manifestPath },
    details: { extension: extension.name, ...(tail === '' ? {} : { stderr: tail }) },
  });
}
