let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  const seats = request.attributes.plan === 'team' ? 10 : 100;
  process.stdout.write(
    `| Plan | Seats |\n| --- | --- |\n| ${request.attributes.plan} | ${seats} |\n\nBuilt for ${request.language}.\n`,
  );
});
