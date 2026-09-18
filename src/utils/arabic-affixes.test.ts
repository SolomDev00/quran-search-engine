import { describe, it, expect } from 'vitest';
import { expandAffixVariants } from './arabic-affixes';

describe('expandAffixVariants', () => {
  it('includes the bare word', () => {
    expect(expandAffixVariants('مطر')).toContain('مطر');
  });

  it('covers the definite article and conjunction clitics', () => {
    const variants = expandAffixVariants('ريح');
    expect(variants).toContain('الريح');
    expect(variants).toContain('والريح');
    expect(variants).toContain('بالريح');
  });

  it('covers attached pronouns', () => {
    const variants = expandAffixVariants('رزق');
    expect(variants).toContain('رزقهم');
    expect(variants).toContain('ورزقنا');
  });

  it('covers the accusative tanween alif', () => {
    expect(expandAffixVariants('مطر')).toContain('مطرا');
  });

  it('opens a trailing ta marbuta so suffixed forms resolve', () => {
    const variants = expandAffixVariants('صلاة');
    expect(variants).toContain('الصلاة');
    expect(variants).toContain('صلاتهم');
    // The closed form never carries a pronoun.
    expect(variants).not.toContain('صلاةهم');
  });

  it('leaves words shorter than three letters unexpanded', () => {
    // Two-letter stems are function words once clitics are stripped; expanding them would
    // match far more noise than signal.
    expect(expandAffixVariants('ام')).toEqual(['ام']);
  });

  it('returns nothing for an empty word', () => {
    expect(expandAffixVariants('')).toEqual([]);
  });

  it('never produces duplicates', () => {
    const variants = expandAffixVariants('نور');
    expect(new Set(variants).size).toBe(variants.length);
  });
});
