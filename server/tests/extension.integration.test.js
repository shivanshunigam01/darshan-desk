import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { Agency, Operator, Pilgrim, TtdAccountReference } from '../src/models/index.js';
import { BookingPreparation } from '../src/models/BookingPreparation.js';
import { TTDPolicySnapshot } from '../src/models/TTDPolicySnapshot.js';
import { connectTestDatabase, disconnectTestDatabase } from './testDb.js';

let app;
let dbAvailable = true;

beforeAll(async () => {
  try {
    await connectTestDatabase();
    app = createApp();
  } catch {
    dbAvailable = false;
  }
}, 120000);

afterAll(async () => {
  if (dbAvailable) await disconnectTestDatabase();
});

describe('extension dashboard integration', () => {
  let token;
  let agencyId;
  let prepId;
  let pilgrimId;
  let pairingToken;
  let extensionInstanceId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    await mongoose.connection.dropDatabase();
    const agency = await Agency.create({ name: 'Ext Agency', code: `EXT-${Date.now()}` });
    agencyId = agency._id;
    const op = await Operator.create({
      agencyId,
      email: `ext-${Date.now()}@t.com`,
      passwordHash: await bcrypt.hash('pass', 10),
      displayName: 'Ext Operator',
    });
    token = (await request(app).post('/api/auth/login').send({ email: op.email, password: 'pass' })).body.token;

    await TTDPolicySnapshot.create({
      source: 'test',
      capturedAt: new Date(),
      minimumDonation: 10000,
      maximumDonation: 500000,
      maximumCurrentPilgrims: 4,
      maximumAdvancePilgrims: 9,
      releaseTime: '11:03:00',
      reportingTime: '04:00 PM',
      policyVersion: 'test-v1',
      isActive: true,
    });

    const account = await TtdAccountReference.create({
      agencyId,
      label: 'Ref',
      accountHint: '****1111',
      maskedIdentifier: '****1111',
      loginIdentifier: 'r@t.com',
      authorizationStatus: 'authorized',
      status: 'active',
      assignedOperatorIds: [op._id],
      ownerId: op._id,
    });

    const pilgrim = await Pilgrim.create({
      agencyId,
      fullName: 'Lakshmi Rao',
      age: 40,
      gender: 'F',
      idType: 'Aadhaar',
      idNumber: '123456789012',
      mobile: '9876543210',
      city: 'Tirupati',
    });
    pilgrimId = pilgrim._id.toString();

    const prep = await BookingPreparation.create({
      agencyId,
      operatorId: op._id,
      ttdAccountReferenceId: account._id,
      bookingCategory: 'CURRENT',
      donationAmount: 10000,
      pilgrimIds: [pilgrim._id],
      consentRecordedAt: new Date(),
    });
    prepId = prep._id.toString();

    await request(app)
      .post(`/api/preparations/${prepId}/consent`)
      .set('Authorization', `Bearer ${token}`)
      .send({ acknowledged: true });
    const validated = await request(app)
      .post(`/api/preparations/${prepId}/validate`)
      .set('Authorization', `Bearer ${token}`);
    expect(validated.body.preparation.validationStatus).toBe('passed');

    const pair = await request(app)
      .post(`/api/preparations/${prepId}/extension/pair`)
      .set('Authorization', `Bearer ${token}`);
    pairingToken = pair.body.pairingToken;
    extensionInstanceId = `inst-${Date.now()}`;
  });

  test('connect + fill-payload is SSOT for validated preparation', async () => {
    if (!dbAvailable) return;
    const connect = await request(app).post('/api/preparations/extension/connect').send({
      pairingToken,
      extensionInstanceId,
      extensionVersion: '1.0.0',
    });
    expect(connect.status).toBe(200);
    expect(connect.body.operatorName).toBe('Ext Operator');
    expect(connect.body.validationStatus).toBe('passed');

    const payload = await request(app)
      .get('/api/preparations/extension/fill-payload')
      .set({
        'x-pairing-token': pairingToken,
        'x-extension-instance-id': extensionInstanceId,
        'x-extension-access-token': connect.body.accessToken,
      });
    expect(payload.status).toBe(200);
    expect(payload.body.preparationId).toBe(prepId);
    expect(payload.body.pilgrims[0].fullName).toBe('Lakshmi Rao');
    expect(payload.body.rowMappings[0].pilgrimId).toBe(pilgrimId);

    const prep = await BookingPreparation.findById(prepId);
    expect(prep.extensionSnapshotRevision).toBe(payload.body.contentRevision);
  });

  test('pilgrim profile edit bumps revision for fresh payload', async () => {
    if (!dbAvailable) return;
    const connect = await request(app).post('/api/preparations/extension/connect').send({
      pairingToken,
      extensionInstanceId,
      extensionVersion: '1.0.0',
    });
    const accessToken = connect.body.accessToken;
    const before = await request(app)
      .get('/api/preparations/extension/fill-payload')
      .set({
        'x-pairing-token': pairingToken,
        'x-extension-instance-id': extensionInstanceId,
        'x-extension-access-token': accessToken,
      });
    const revBefore = before.body.contentRevision;

    await request(app)
      .patch(`/api/catalog/pilgrims/${pilgrimId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Lakshmi Rao Updated' });

    const after = await request(app)
      .get('/api/preparations/extension/fill-payload')
      .set({
        'x-pairing-token': pairingToken,
        'x-extension-instance-id': extensionInstanceId,
        'x-extension-access-token': accessToken,
      });
    expect(after.body.contentRevision).toBeGreaterThan(revBefore);
    expect(after.body.pilgrims[0].fullName).toBe('Lakshmi Rao Updated');
  });

  test('fill-report masks id numbers in stored timeline metadata', async () => {
    if (!dbAvailable) return;
    const connect = await request(app).post('/api/preparations/extension/connect').send({
      pairingToken,
      extensionInstanceId,
      extensionVersion: '1.0.0',
    });
    const report = {
      preparationId: prepId,
      results: [
        { key: 'p0_idNumber', status: 'verified', expected: '123456789012', actual: '123456789012' },
        { key: 'p0_fullName', status: 'verified', expected: 'Lakshmi Rao' },
      ],
      validation: { ok: true, fieldErrors: [] },
      success: true,
    };
    const res = await request(app)
      .post('/api/preparations/extension/fill-report')
      .set({
        'x-pairing-token': pairingToken,
        'x-extension-instance-id': extensionInstanceId,
        'x-extension-access-token': connect.body.accessToken,
      })
      .send(report);
    expect(res.status).toBe(200);
  });
});