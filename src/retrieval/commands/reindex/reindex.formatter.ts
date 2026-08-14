export function formatReindexLine(
  id: string,
  added: number,
  updated: number,
  removed: number,
  total: number,
): string {
  return `${id}: +${added} ~${updated} -${removed} = ${total} notes`;
}
