// Fail fast on a file that is not a TrueType font (jsPDF would otherwise log errors page after page).
export function assertTrueType(buffer) {
  const tag = buffer.byteLength >= 4 ? new DataView(buffer).getUint32(0) : 0;
  if (tag !== 0x00010000 && tag !== 0x74727565) throw new Error('not a TrueType font');
}
