export function seatColumnTemplate(cells) {
  const maxColumn = Math.max(1, ...cells.map((cell) => Number(cell.col_idx)));
  const seatColumns = new Set(
    cells
      .filter((cell) => cell.cell_kind === 'seat')
      .map((cell) => Number(cell.col_idx))
  );
  const aisleColumns = new Set(
    cells
      .filter((cell) => cell.cell_kind === 'aisle')
      .map((cell) => Number(cell.col_idx))
  );

  return Array.from({ length: maxColumn }, (_, index) =>
    aisleColumns.has(index + 1) && !seatColumns.has(index + 1)
      ? '16px'
      : 'minmax(42px, 1fr)'
  ).join(' ');
}
