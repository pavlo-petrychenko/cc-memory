export class ReindexFormatter {
  // A non-empty constructor keeps bun's coverage report from counting an
  // unreachable synthetic default constructor against this class.

  line(
    id: string,
    added: number,
    updated: number,
    removed: number,
    total: number,
  ): string {
    return `${id}: +${added} ~${updated} -${removed} = ${total} notes`;
  }
}
