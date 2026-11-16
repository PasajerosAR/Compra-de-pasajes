import assert from 'node:assert/strict';
import test from 'node:test';
import { findPlaceByInput } from './places.js';

const places = [
  { place_id: 'parana', place_name: 'Paraná', province: 'Entre Ríos' },
  { place_id: 'buenos-aires', place_name: 'Buenos Aires', province: 'Buenos Aires' },
  { place_id: 'san-juan-city', place_name: 'San Juan', province: 'San Juan' },
  { place_id: 'san-juan-town', place_name: 'San Juan', province: 'Mendoza' }
];

test('resolves a unique locality name without requiring a datalist selection', () => {
  assert.equal(findPlaceByInput('Parana', places)?.place_id, 'parana');
  assert.equal(findPlaceByInput(' buenos aires ', places)?.place_id, 'buenos-aires');
});

test('resolves a qualified label and leaves ambiguous or partial names unresolved', () => {
  assert.equal(findPlaceByInput('San Juan · Mendoza', places)?.place_id, 'san-juan-town');
  assert.equal(findPlaceByInput('San Juan', places), null);
  assert.equal(findPlaceByInput('Paran', places), null);
});
