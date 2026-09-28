// The error-budget island: how much downtime an availability target allows in its window, how much of it
// is spent, and where the budget runs out at the current pace. Everything is computed here from the four
// inputs; the island has no network and no access to the page.
//
// The page talks to the island through window.agenticReportIsland (the package bridge): `init` brings the
// language and reduced motion (the theme tokens are already set as CSS custom properties on the root);
// `renderAt` brings the page clock. An ordinary reader sees the chart drawn complete. When the page is
// played by its clock — a recording or a check that seeks it — the chart is drawn in over the first second
// of page time: the drawing is a function of `t` alone, so two seeks to one moment give the same frame.

const STRINGS = {
  en: {
    target: 'Availability target',
    window: 'Window, days',
    elapsed: 'Days of the window gone',
    bad: 'Bad minutes so far',
    budget: 'Budget for the window',
    spent: 'Spent',
    burn: 'Burn rate',
    minutes: 'min',
    hours: 'h',
    day: 'day',
    pace: 'even pace',
    over: (over) => `The budget of this window is spent: ${over} over.`,
    lasts: (left) => `At this pace the window ends with ${left} of the budget left.`,
    runsOut: (day, window) => `At this pace the budget runs out on day ${day} of ${window}.`,
    chart: (spent, elapsed, window) =>
      `Budget remaining over a ${window}-day window: ${spent} spent after ${elapsed} days, against an even pace.`,
  },
  ru: {
    target: 'Цель доступности',
    window: 'Окно, дней',
    elapsed: 'Прошло дней окна',
    bad: 'Плохих минут на сейчас',
    budget: 'Бюджет на окно',
    spent: 'Израсходовано',
    burn: 'Скорость расхода',
    minutes: 'мин',
    hours: 'ч',
    day: 'день',
    pace: 'ровный темп',
    over: (over) => `Бюджет этого окна исчерпан: перерасход ${over}.`,
    lasts: (left) => `В таком темпе окно закончится, а от бюджета останется ${left}.`,
    runsOut: (day, window) => `В таком темпе бюджет закончится на ${day}-й день из ${window}.`,
    chart: (spent, elapsed, window) =>
      `Остаток бюджета за окно в ${window} дней: израсходовано ${spent} за ${elapsed} дней, рядом — ровный темп.`,
  },
};

const X0 = 28;
const X1 = 312;
const Y0 = 12;
const Y1 = 130;
const DRAW_SECONDS = 1;

const island = window.agenticReportIsland;
const root = document.documentElement;
const $ = (id) => document.getElementById(id);
let language = 'en';
let reducedMotion = false;

const strings = () => STRINGS[language] ?? STRINGS.en;
const number = (value, digits = 1) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
const percent = (fraction, digits = 1) =>
  new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: digits }).format(
    fraction,
  );

function duration(minutes) {
  const s = strings();
  if (minutes < 60) return `${number(minutes)} ${s.minutes}`;
  const whole = Math.round(minutes);
  const rest = whole % 60;
  return rest === 0
    ? `${number(Math.floor(whole / 60), 0)} ${s.hours}`
    : `${number(Math.floor(whole / 60), 0)} ${s.hours} ${rest} ${s.minutes}`;
}

function read() {
  const target = Number($('target').value);
  const window = Number($('window').value);
  const elapsedInput = $('elapsed');
  elapsedInput.max = String(window);
  const elapsed = Math.min(window, Math.max(0.1, Number(elapsedInput.value) || 0.1));
  const bad = Math.max(0, Number($('bad').value) || 0);
  return { target, window, elapsed, bad };
}

function compute({ target, window, elapsed, bad }) {
  const budget = window * 24 * 60 * (1 - target / 100);
  const spent = bad / budget;
  const burn = spent / (elapsed / window);
  // The day the budget reaches zero at the current pace; Infinity when nothing is spent.
  const runsOut = spent === 0 ? Number.POSITIVE_INFINITY : elapsed / spent;
  return { budget, spent, burn, runsOut };
}

const x = (day, window) => X0 + ((X1 - X0) * day) / window;
const y = (remaining) => Y0 + (Y1 - Y0) * (1 - Math.max(0, Math.min(1, remaining)));

function draw(progress) {
  // Each line is drawn along its own length: pathLength="1" makes the dash one unit long.
  const spentLine = $('spent-line');
  const projection = $('projection');
  spentLine.style.strokeDashoffset = String(1 - Math.min(1, progress * 2));
  projection.style.strokeDashoffset = String(1 - Math.max(0, Math.min(1, progress * 2 - 1)));
  $('today').style.opacity = String(progress >= 0.5 ? 1 : 0);
}

function render() {
  const s = strings();
  for (const element of document.querySelectorAll('[data-text]'))
    element.textContent = s[element.dataset.text];
  for (const option of $('target').options)
    option.textContent = percent(Number(option.value) / 100, 2);
  const input = read();
  const { budget, spent, burn, runsOut } = compute(input);
  $('budget').textContent = duration(budget);
  $('spent').textContent = percent(spent);
  $('spent-minutes').textContent = duration(input.bad);
  $('burn').textContent = `×${number(burn, 2)}`;
  const verdict = $('verdict');
  if (spent >= 1) {
    verdict.textContent = s.over(duration(input.bad - budget));
    verdict.dataset.state = 'over';
  } else if (runsOut >= input.window) {
    verdict.textContent = s.lasts(percent(1 - burn));
    verdict.dataset.state = 'ok';
  } else {
    verdict.textContent = s.runsOut(number(Math.ceil(runsOut), 0), input.window);
    verdict.dataset.state = 'short';
  }

  const remainingNow = 1 - spent;
  const todayX = x(input.elapsed, input.window);
  $('spent-line').setAttribute('points', `${X0},${Y0} ${todayX},${y(remainingNow)}`);
  const endDay = Math.min(input.window, runsOut);
  const endRemaining = 1 - spent * (endDay / input.elapsed);
  $('projection').setAttribute(
    'points',
    `${todayX},${y(remainingNow)} ${x(endDay, input.window)},${y(endRemaining)}`,
  );
  $('today').setAttribute('cx', String(todayX));
  $('today').setAttribute('cy', String(y(remainingNow)));
  $('end-tick').textContent = `${s.day} ${input.window}`;
  $('pace-label').textContent = s.pace;
  $('full-tick').textContent = percent(1);
  $('chart-label').textContent = s.chart(percent(spent), number(input.elapsed), input.window);
}

for (const id of ['target', 'window', 'elapsed', 'bad']) $(id).addEventListener('input', render);

island.on('init', (message) => {
  language = String(message.language ?? 'en').startsWith('ru') ? 'ru' : 'en';
  reducedMotion = message.reducedMotion === true;
  root.lang = language;
  render();
});

island.on('renderAt', (message) => {
  const t = Number(message.t);
  if (!Number.isFinite(t) || reducedMotion) return;
  draw(Math.max(0, Math.min(1, t / DRAW_SECONDS)));
});

render();
draw(1);
