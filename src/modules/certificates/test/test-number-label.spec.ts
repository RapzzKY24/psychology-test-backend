import { testNumberLabel } from '../utils/test-number-label';

describe('testNumberLabel', () => {
  it.each([
    ['CPMI', 'CPMI'],
    ['Pauli', 'PAULI'],
    ['Kraepelin', 'KRAEPELIN'],
    ['Tes Kraepelin', 'KRAEPELIN'],
    ['Enneagram', 'ENNEAGRAM'],
    ['DISC Form A', 'DISC-FORM-A'],
    ['PAPI Kostick', 'PAPI-KOSTICK'],
    ['Aptitude Test', 'APTITUDE-TEST'],
    ['Big Five Inventory', 'BIG-FIVE-INVENTORY'],
    ['WPT (Wonderlic Personnel Test)', 'WPT'],
    ['IST (Intelligenz Struktur Test)', 'IST'],
    ['AQ (Adversity Quotient)', 'AQ'],
    ['EPPS (Edwards Personal Preference Schedule)', 'EPPS'],
    ['MBTI (Myers-Briggs Type Indicator)', 'MBTI'],
    ['TIU 5 (Tes Intelegensi Umum)', 'TIU-5'],
    ['16 PF (Sixteen Personality Factors Questionnaire)', '16-PF'],
    ['Wartegg (WZT)', 'WZT'],
    ['Holland Test (RIASEC)', 'RIASEC'],
    ['MSAI — Managerial Skills and Abilities Inventory', 'MSAI'],
    ['CFIT Skala 2 Form A (Culture Fair Intelligence Test)', 'CFIT-SKALA-2-FORM-A'],
  ])('turns %s into %s', (name, label) => {
    expect(testNumberLabel(name)).toBe(label);
  });

  it('falls back to PSIKOTES when the name has nothing usable', () => {
    expect(testNumberLabel('   ')).toBe('PSIKOTES');
  });
});
