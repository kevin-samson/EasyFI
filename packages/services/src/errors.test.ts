import { describe, expect, it } from 'vitest';
import { isServiceError, ServiceError } from './errors';

describe('isServiceError', () => {
  it('recognises errors by brand, not prototype', () => {
    const e = new ServiceError('not_found', 'x');
    expect(isServiceError(e)).toBe(true);
    // simulate a second copy of the module: same brand, different class
    const clone = Object.assign(new Error('x'), { [Symbol.for('easyfi.ServiceError')]: true });
    expect(isServiceError(clone)).toBe(true);
    expect(isServiceError(new Error('x'))).toBe(false);
    expect(isServiceError(null)).toBe(false);
  });
});
