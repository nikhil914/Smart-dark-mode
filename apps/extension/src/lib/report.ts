/** Pre-filled issue link. Only the host, mode and extension version are included (F6). */
export function reportUrl(loc: { host: string }, mode: string, note = ''): string {
  const version = browser.runtime.getManifest().version;
  const body = [
    `Site: ${loc.host}`,
    `Mode: ${mode}`,
    `Extension version: ${version}`,
    ...(note ? [note] : []),
    '',
    'What looks wrong:',
    '',
  ].join('\n');
  const params = new URLSearchParams({ title: `Site problem: ${loc.host}`, body, labels: 'site' });
  return `https://github.com/nikhil914/smart-dark-mode/issues/new?${params.toString()}`;
}
