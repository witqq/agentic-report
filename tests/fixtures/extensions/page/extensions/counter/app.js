const island = window.agenticReportIsland;
const output = document.getElementById('value');
let count = 0;
document.getElementById('add').addEventListener('click', () => {
  count += 1;
  output.textContent = String(count);
});
island.on('init', (message) => {
  document.body.dataset.init = JSON.stringify({
    scheme: message.scheme,
    language: message.language,
    accent: message.tokens['--color-accent'] ?? '',
  });
});
island.on('renderAt', (message) => {
  document.body.dataset.renderAt = String(message.t);
});
// The island has an opaque origin and no network: both probes must fail.
try {
  document.body.dataset.parent = parent.document.title === undefined ? 'unknown' : 'reachable';
} catch {
  document.body.dataset.parent = 'isolated';
}
fetch('https://example.com/').then(
  () => {
    document.body.dataset.network = 'open';
  },
  () => {
    document.body.dataset.network = 'blocked';
  },
);
