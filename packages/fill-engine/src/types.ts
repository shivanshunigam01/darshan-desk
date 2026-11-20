export type SupportedFieldType = 'Text' | 'Number' | 'Date' | 'Dropdown' | 'Radio' | 'Checkbox';

export interface SelectorStrategy {
  /** Only verified selectors — mock dev site uses data-dd-field */
  kind: 'data-attribute' | 'id' | 'name';
  value: string;
}

export interface FieldValidationSchema {
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  enumValues?: string[];
}

export interface FieldDefinition {
  key: string;
  sourceProfileField: string;
  supportedFieldType: SupportedFieldType;
  selectorStrategy: SelectorStrategy;
  required: boolean;
  validationSchema: FieldValidationSchema;
  displayLabel: string;
}

export interface PilgrimProfile {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  idType: string;
  idNumber: string;
  mobile: string;
  city: string;
  dateOfBirth?: string;
}

export interface FillProfileData {
  preparationId: string;
  mappingProfileId: string;
  contentRevision?: number;
  updatedAt?: string;
  validationStatus?: string;
  agencyId?: string;
  ttdAccountReferenceId?: string;
  selectedPilgrimIds?: string[];
  rowMappings?: Array<{ pilgrimId: string; rowIndex: number }>;
  pilgrims: PilgrimProfile[];
  permittedScalars: {
    donationAmount?: number;
    bookingCategory?: string;
    preferredDate?: string;
  };
}

export type FieldResultStatus =
  | 'filled'
  | 'verified'
  | 'missing_element'
  | 'missing_value'
  | 'validation_failed'
  | 'needs_confirmation'
  | 'skipped_duplicate'
  | 'skipped_declined'
  | 'dropdown_unknown_option'
  | 'captcha_required';

export interface FieldFillResult {
  key: string;
  displayLabel: string;
  status: FieldResultStatus;
  expected?: string;
  actual?: string;
  message?: string;
}

export interface FillPlanItem {
  definition: FieldDefinition;
  value: string;
  pilgrimIndex?: number;
  pilgrimId?: string;
}

export interface FillExecutionReport {
  preparationId: string;
  mappingProfileId: string;
  pageUrl: string;
  startedAtUtc: string;
  completedAtUtc: string;
  results: FieldFillResult[];
  success: boolean;
}