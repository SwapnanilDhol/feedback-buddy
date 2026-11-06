import { describe, expect, it } from 'vitest';

import { maintenanceIntervalMs, shouldRunMaintenance } from '../src/maintenance';

describe('request-driven maintenance', () => {
  it('runs at most once per interval', () => {
    const now = 1_000_000;
    expect(shouldRunMaintenance(now, 0)).toBe(true);
    expect(shouldRunMaintenance(now, now - maintenanceIntervalMs + 1)).toBe(false);
    expect(shouldRunMaintenance(now, now - maintenanceIntervalMs)).toBe(true);
  });
});
