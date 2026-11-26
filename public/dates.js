// Spring accepts both region IDs and fixed offsets, including offsets with seconds.
export function siteDateFormatter(locale, options, zone) {
  const offset = /^(?:UTC|GMT|UT)?([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(zone || '');
  if (offset) {
    const seconds = Number(offset[2]) * 3600 + Number(offset[3]) * 60 + Number(offset[4] || 0);
    const shift = seconds * (offset[1] === '-' ? -1000 : 1000);
    const utc = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
    return {
      format: value => utc.format(Number(value) + shift),
      formatToParts: value => utc.formatToParts(Number(value) + shift)
    };
  }
  const timeZone = zone === 'Z' || zone === 'UT' ? 'UTC' : zone;
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch {
    // A browser can have an older time-zone database than the JVM.
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  }
}
