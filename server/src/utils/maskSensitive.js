/** Mask identity numbers for logs and stored fill reports — never persist full id numbers from extension QA. */
export function maskIdNumber(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (s.length <= 4) return '****';
  const stars = '*'.repeat(Math.min(8, Math.max(4, s.length - 4)));
  return `${stars}${s.slice(-4)}`;
}

export function sanitizeExtensionFillReport(report) {
  if (!report || typeof report !== 'object') return report;
  const results = Array.isArray(report.results)
    ? report.results.map((r) => {
        const row = { ...r };
        if (row.key && String(row.key).includes('idNumber')) {
          if (row.expected != null) row.expected = maskIdNumber(row.expected);
          if (row.actual != null) row.actual = maskIdNumber(row.actual);
        }
        return row;
      })
    : report.results;
  return { ...report, results };
}