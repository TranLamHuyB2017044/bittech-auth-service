export function canonicalJsonStringify(val: any): string {
  if (val === null || val === undefined) {
    return 'null';
  }
  if (typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(item => canonicalJsonStringify(item)).join(',') + ']';
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val).sort();
    const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalJsonStringify(val[k])}`);
    return '{' + parts.join(',') + '}';
  }
  return '';
}
