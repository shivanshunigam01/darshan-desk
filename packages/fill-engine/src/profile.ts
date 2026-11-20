import { getMockSrivaniV1Fields, MOCK_SRIVANI_SHARED_FIELDS } from './mappings/mockSrivaniV1.js';
import type { FieldDefinition, FillPlanItem, FillProfileData, PilgrimProfile } from './types.js';

export function resolveMappingProfile(profileId: string, pilgrimCount: number): FieldDefinition[] {
  if (profileId === 'live-srivani-current-v1') {
    return [];
  }
  if (profileId !== 'mock-srivani-v1') {
    throw new Error(`Unknown mapping profile: ${profileId}`);
  }
  const pilgrimFields: FieldDefinition[] = [];
  for (let i = 0; i < pilgrimCount; i++) {
    pilgrimFields.push(...getMockSrivaniV1Fields(i));
  }
  return [...pilgrimFields, ...MOCK_SRIVANI_SHARED_FIELDS];
}

export function orderPilgrimsBySelection(data: FillProfileData, selectedPilgrimIds: string[]): PilgrimProfile[] {
  const byId = new Map(data.pilgrims.map((p) => [p.id, p]));
  return selectedPilgrimIds.map((id) => byId.get(id)).filter(Boolean) as PilgrimProfile[];
}

export function buildFillPlan(
  data: FillProfileData,
  selectedPilgrimIds: string[],
  options?: { includeScalars?: boolean; rowIndexByPilgrimId?: Map<string, number> }
): FillPlanItem[] {
  if (data.mappingProfileId === 'live-srivani-current-v1') return [];
  resolveMappingProfile(data.mappingProfileId, selectedPilgrimIds.length);
  const pilgrims = orderPilgrimsBySelection(data, selectedPilgrimIds);
  const plan: FillPlanItem[] = [];
  const rowMap = options?.rowIndexByPilgrimId;

  for (let logical = 0; logical < pilgrims.length; logical++) {
    const pilgrim = pilgrims[logical];
    const rowIndex = rowMap?.get(pilgrim.id) ?? data.rowMappings?.find((r) => r.pilgrimId === pilgrim.id)?.rowIndex ?? logical;
    const pilgrimDefs = getMockSrivaniV1Fields(rowIndex).map((def) => ({
      ...def,
      key: def.key.replace(/^p\d+_/, `p${logical}_`),
    }));
    for (const def of pilgrimDefs) {
      const fieldDef = {
        ...def,
        selectorStrategy: { ...def.selectorStrategy },
      };
      const value = readPath(
        { pilgrims: [pilgrim], permittedScalars: data.permittedScalars },
        def.sourceProfileField.replace(`pilgrims[${rowIndex}]`, 'pilgrims[0]').replace(/pilgrims\[\d+\]/, 'pilgrims[0]')
      );
      if (value !== undefined && value !== null && String(value).length > 0) {
        plan.push({ definition: fieldDef, value: String(value), pilgrimIndex: rowIndex, pilgrimId: pilgrim.id });
      }
    }
  }

  if (options?.includeScalars !== false) {
    for (const def of MOCK_SRIVANI_SHARED_FIELDS) {
      if (def.sourceProfileField === '_skip') continue;
      const value = readPath({ permittedScalars: data.permittedScalars }, def.sourceProfileField);
      if (value !== undefined && value !== null && String(value).length > 0) {
        plan.push({ definition: def, value: String(value) });
      }
    }
  }

  return plan;
}

function readPath(root: Record<string, unknown>, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function validateValue(value: string, schema: FieldDefinition['validationSchema']): string | null {
  if (schema.pattern) {
    const re = new RegExp(schema.pattern);
    if (!re.test(value)) return `Value does not match pattern ${schema.pattern}`;
  }
  if (schema.minLength != null && value.length < schema.minLength) return `Minimum length ${schema.minLength}`;
  if (schema.maxLength != null && value.length > schema.maxLength) return `Maximum length ${schema.maxLength}`;
  if (schema.enumValues && !schema.enumValues.includes(value)) return `Must be one of: ${schema.enumValues.join(', ')}`;
  const asNum = Number(value);
  if (schema.min != null && Number.isFinite(asNum) && asNum < schema.min) return `Minimum ${schema.min}`;
  if (schema.max != null && Number.isFinite(asNum) && asNum > schema.max) return `Maximum ${schema.max}`;
  return null;
}

export function normalizePilgrims(rows: Array<Record<string, unknown>>): PilgrimProfile[] {
  return rows.map((p) => {
    const age = Number(p.age);
    let dateOfBirth = p.dateOfBirth ? String(p.dateOfBirth) : undefined;
    if (!dateOfBirth && Number.isFinite(age)) {
      const y = new Date().getFullYear() - age;
      dateOfBirth = `${y}-01-01`;
    }
    return {
      id: String(p.id ?? p._id),
      fullName: String(p.fullName),
      age,
      gender: String(p.gender),
      idType: String(p.idType),
      idNumber: String(p.idNumber),
      mobile: String(p.mobile),
      city: String(p.city),
      dateOfBirth,
    };
  });
}

export function auditPreparedPayload(data: FillProfileData) {
  const errors: string[] = [];
  if (!data.pilgrims?.length) errors.push('No pilgrims in preparation payload');
  for (const p of data.pilgrims || []) {
    if (!p.fullName || p.fullName.length < 2) errors.push(`Pilgrim ${p.id}: name incomplete`);
    if (!p.mobile || !/^[0-9]{10}$/.test(p.mobile)) errors.push(`Pilgrim ${p.id}: mobile invalid`);
    if (!p.idType || !p.idNumber) errors.push(`Pilgrim ${p.id}: ID fields missing`);
    if (!p.gender) errors.push(`Pilgrim ${p.id}: gender missing`);
  }
  if (data.permittedScalars.donationAmount != null && data.permittedScalars.donationAmount < 10000) {
    errors.push('Donation below observed SRIVANI minimum (₹10,000)');
  }
  return { ok: errors.length === 0, errors };
}

export function verifyFillResults(plan: FillPlanItem[], results: import('./types.js').FieldFillResult[]) {
  const byKey = new Map(results.map((r) => [r.key, r]));
  const fieldErrors: Array<{ key: string; label: string; message: string }> = [];
  for (const item of plan) {
    const r = byKey.get(item.definition.key);
    if (!r || r.status === 'skipped_declined' || r.status === 'skipped_duplicate') continue;
    if (!['verified', 'needs_confirmation'].includes(r.status)) {
      fieldErrors.push({
        key: item.definition.key,
        label: item.definition.displayLabel,
        message: r.message || r.status,
      });
    }
  }
  return { ok: fieldErrors.length === 0, fieldErrors };
}