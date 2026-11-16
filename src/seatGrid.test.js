import assert from 'node:assert/strict';
import test from 'node:test';
import { seatColumnTemplate } from './seatGrid.js';

test('keeps a seat-sized track when an aisle shares that column in another row', () => {
  const template = seatColumnTemplate([
    { col_idx: 1, cell_kind: 'seat' },
    { col_idx: 2, cell_kind: 'seat' },
    { col_idx: 3, cell_kind: 'aisle' },
    { col_idx: 3, cell_kind: 'seat' },
    { col_idx: 4, cell_kind: 'seat' }
  ]);

  assert.equal(template, 'minmax(42px, 1fr) minmax(42px, 1fr) minmax(42px, 1fr) minmax(42px, 1fr)');
});

test('keeps an aisle-only column narrow', () => {
  assert.equal(
    seatColumnTemplate([
      { col_idx: 1, cell_kind: 'seat' },
      { col_idx: 2, cell_kind: 'aisle' },
      { col_idx: 3, cell_kind: 'seat' }
    ]),
    'minmax(42px, 1fr) 16px minmax(42px, 1fr)'
  );
});
