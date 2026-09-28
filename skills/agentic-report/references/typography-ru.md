# Russian typography

The compiler does not change the author's characters. Everything below is the author's job, done in the
Markdown source before the build. Apply it to Russian prose only, in the scope defined for prose in
[`prose.md`](prose.md): code, commands, identifiers, and data stay byte-identical.

## Quotes

- Outer quotes are «ёлочки», inner quotes „лапки“: «Он сказал „готово“ и ушёл».
- English "straight" or “curly” quotes do not appear in Russian text. A quoted English title keeps the
  Russian quotes around it: «Getting Started».
- A code identifier is inline code, not a quotation: `build`, not «build».

## Non-breaking space

Write the character U+00A0 (the `&nbsp;` entity is not available: the source is Markdown without raw HTML).

- After one- and two-letter prepositions, conjunctions, and particles: в, к, с, у, о, и, а, но, на, по, за,
  из, от, до, не, ни. «в&nbsp;отчёте», «и&nbsp;графики».
- Before a dash that follows a word: «Отчёт&nbsp;— это решение».
- Between a number and its unit or noun: «12&nbsp;МБ», «3&nbsp;шага», «5&nbsp;%» (with a thin or
  non-breaking space before the percent sign in Russian style).
- Inside initials and before a surname: «А.&nbsp;С.&nbsp;Пушкин».
- In abbreviations: «т.&nbsp;е.», «и&nbsp;т.&nbsp;д.».

Do not fill a paragraph with non-breaking spaces after every short word of a long run; the rule is about a
short word left alone at a line end.

## Dashes and hyphens

- The em dash `—` with spaces around it between words: «сборка — это проверка».
- The en dash `–` without spaces in ranges: «2024–2026», «10–15 минут».
- The hyphen `-` only inside words: «из-за», «какой-то».
- The minus sign `−` in numbers: «−3 °C».
- The dash as a universal connector is a prose tell; see the prose rules. The dash between a subject and a
  nominal predicate is required punctuation.

## Numbers

- Thousands are grouped by a thin or non-breaking space: «12 400», not «12,400» or «12400».
- The decimal separator is a comma: «3,5».
- Dates: «25 сентября 2026 г.» in prose, `2026-09-25` in data.
- A noun after a list of numbers agrees with every number, not with the last one. «нашёл 3, 6, 3, 1, 1
  проблему» is wrong: the noun took its form from the final «1». Put the noun before the list («находки по
  кругам: 3, 6, 3, 1, 1»), or give each number its own noun («3 находки, 6 находок…»). The same holds for
  «1 шаг», «2 шага», «5 шагов»: check the form against the number it stands beside.
- A date or a time that comes from the data is written from the data, with its time zone, never typed by
  hand next to it. A Moira landing prototype wrote «24 сентября» into its template beside a time taken from
  the run, and in a New York time zone another prototype showed «24.09 02:02» beside a typed «09:03–09:24»:
  a typed date or time disagrees with the data as soon as the data or the reader's zone changes. Write «по московскому времени» or
  «МСК» next to a recorded time, and say «на момент выгрузки 25 сентября, 01:17 МСК» for a snapshot.
- A number that comes from the data takes its noun through `:plural[{{n}}]{forms="шаг|шага|шагов"}` and a
  recorded time through `:time[…]{zone="Europe/Moscow"}` ([`compose.md`](compose.md#write-numbers-and-dates-in-the-page-language)):
  the build picks the form and writes the zone, and puts the no-break space between the number and the
  noun itself. Everywhere else the no-break spaces above stay your job: the compiler does not add them to
  your text.

## Letters

- Write «ё» where it is pronounced: «ещё», «всё», «её». Pages are read aloud by screen readers.
- Russian ellipsis is one character `…`.

## Headings and interface words

- No full stop at the end of a heading.
- Capital letter only at the start: «Как устроена сборка», not «Как Устроена Сборка».
- Buttons are verbs in the infinitive or imperative, consistently across the page: «Скачать», «Открыть».
