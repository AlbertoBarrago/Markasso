import { describe, expect, it } from 'vitest';
import { randomAnimalName } from '../src/io/animal_names';

describe('randomAnimalName', () => {
  it('returns a two-word "Adjective Animal" name', () => {
    const name = randomAnimalName();
    const parts = name.split(' ');
    expect(parts).toHaveLength(2);
    expect(parts[0]?.[0]).toMatch(/[A-Z]/);
    expect(parts[1]?.[0]).toMatch(/[A-Z]/);
  });

  it('fits within the 24-char peer name limit', () => {
    for (let i = 0; i < 200; i++) {
      expect(randomAnimalName().length).toBeLessThanOrEqual(24);
    }
  });
});
