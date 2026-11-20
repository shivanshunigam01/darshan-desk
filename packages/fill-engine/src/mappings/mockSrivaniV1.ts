import type { FieldDefinition } from '../types.js';

/**
 * Verified selectors for the local mock booking site only (data-dd-field).
 * No live TTD selectors — production mappings require documented approval.
 */
export function getMockSrivaniV1Fields(pilgrimIndex: number): FieldDefinition[] {
  const p = `pilgrims[${pilgrimIndex}]`;
  return [
    {
      key: `p${pilgrimIndex}_fullName`,
      sourceProfileField: `${p}.fullName`,
      supportedFieldType: 'Text',
      selectorStrategy: { kind: 'data-attribute', value: `pilgrim-${pilgrimIndex}-fullName` },
      required: true,
      validationSchema: { minLength: 2, maxLength: 120 },
      displayLabel: `Pilgrim ${pilgrimIndex + 1} full name`,
    },
    {
      key: `p${pilgrimIndex}_age`,
      sourceProfileField: `${p}.age`,
      supportedFieldType: 'Number',
      selectorStrategy: { kind: 'data-attribute', value: `pilgrim-${pilgrimIndex}-age` },
      required: true,
      validationSchema: { min: 0, max: 120 },
      displayLabel: `Pilgrim ${pilgrimIndex + 1} age`,
    },
    {
      key: `p${pilgrimIndex}_dateOfBirth`,
      sourceProfileField: `${p}.dateOfBirth`,
      supportedFieldType: 'Date',
      selectorStrategy: { kind: 'data-attribute', value: `pilgrim-${pilgrimIndex}-dateOfBirth` },
      required: false,
      validationSchema: {},
      displayLabel: `Pilgrim ${pilgrimIndex + 1} date of birth`,
    },
    {
      key: `p${pilgrimIndex}_gender`,
      sourceProfileField: `${p}.gender`,
      supportedFieldType: 'Dropdown',
      selectorStrategy: { kind: 'data-attribute', value: `pilgrim-${pilgrimIndex}-gender` },
      required: true,
      validationSchema: { enumValues: ['M', 'F', 'O', 'T'] },
      displayLabel: `Pilgrim ${pilgrimIndex + 1} gender`,
    },
    {
      key: `p${pilgrimIndex}_idType`,
      sourceProfileField: `${p}.idType`,
      supportedFieldType: 'Dropdown',
      selectorStrategy: { kind: 'data-attribute', value: `pilgrim-${pilgrimIndex}-idType` },
      required: true,
      validationSchema: { minLength: 1 },
      displayLabel: `Pilgrim ${pilgrimIndex + 1} ID type`,
    },
    {
      key: `p${pilgrimIndex}_idNumber`,
      sourceProfileField: `${p}.idNumber`,
      supportedFieldType: 'Text',
      selectorStrategy: { kind: 'data-attribute', value: `pilgrim-${pilgrimIndex}-idNumber` },
      required: true,
      validationSchema: { minLength: 3 },
      displayLabel: `Pilgrim ${pilgrimIndex + 1} ID number`,
    },
    {
      key: `p${pilgrimIndex}_mobile`,
      sourceProfileField: `${p}.mobile`,
      supportedFieldType: 'Text',
      selectorStrategy: { kind: 'data-attribute', value: `pilgrim-${pilgrimIndex}-mobile` },
      required: true,
      validationSchema: { pattern: '^[0-9]{10}$' },
      displayLabel: `Pilgrim ${pilgrimIndex + 1} mobile`,
    },
    {
      key: `p${pilgrimIndex}_city`,
      sourceProfileField: `${p}.city`,
      supportedFieldType: 'Text',
      selectorStrategy: { kind: 'data-attribute', value: `pilgrim-${pilgrimIndex}-city` },
      required: true,
      validationSchema: { minLength: 2 },
      displayLabel: `Pilgrim ${pilgrimIndex + 1} city`,
    },
  ];
}

export const MOCK_SRIVANI_SHARED_FIELDS: FieldDefinition[] = [
  {
    key: 'donationAmount',
    sourceProfileField: 'permittedScalars.donationAmount',
    supportedFieldType: 'Number',
    selectorStrategy: { kind: 'data-attribute', value: 'donation-amount' },
    required: false,
    validationSchema: { min: 0 },
    displayLabel: 'Proposed donation amount',
  },
  {
    key: 'bookingCategory',
    sourceProfileField: 'permittedScalars.bookingCategory',
    supportedFieldType: 'Radio',
    selectorStrategy: { kind: 'data-attribute', value: 'booking-category' },
    required: false,
    validationSchema: { enumValues: ['CURRENT', 'ADVANCE'] },
    displayLabel: 'Booking category',
  },
  {
    key: 'preferredDate',
    sourceProfileField: 'permittedScalars.preferredDate',
    supportedFieldType: 'Date',
    selectorStrategy: { kind: 'data-attribute', value: 'preferred-date' },
    required: false,
    validationSchema: {},
    displayLabel: 'Preferred date',
  },
  {
    key: 'consentAck',
    sourceProfileField: '_skip',
    supportedFieldType: 'Checkbox',
    selectorStrategy: { kind: 'data-attribute', value: 'legal-consent' },
    required: false,
    validationSchema: {},
    displayLabel: 'Legal consent (never auto-filled)',
  },
];