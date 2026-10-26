import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ApplyMembershipDto } from '../dto/apply-membership.dto';
import { RegisterDto } from '../../dto/register.dto';
import { calendarDate } from './date.validation';
import {
  validateRegistrationEnvironment,
  DEVELOPMENT_CONTENT_VERSION,
} from './registration.config';
const personal = {
  firstName: 'Fixture',
  lastName: 'Only',
  dateOfBirth: '1990-01-01',
  phoneNumber: '+447911123456',
  addressLine1: 'Test street',
  addressLine2: '',
  city: 'Test city',
  postcode: 'SW1A 1AA',
};
const options = { whitelist: true, forbidNonWhitelisted: true };
describe('T40 contract and collection boundaries', () => {
  it('fails closed for production, nonlocal databases, live enablement and malformed flags', () => {
    expect(() => validateRegistrationEnvironment({})).not.toThrow();
    const config = {
      NODE_ENV: 'test',
      T40_FIXTURE_MODE: 'true',
      DATABASE_URL: 'postgresql://fixture@localhost/safethrift_t40_test',
    };
    expect(() => validateRegistrationEnvironment(config)).not.toThrow();
    for (const patch of [
      { NODE_ENV: 'production' },
      { NODE_ENV: 'development' },
      {
        DATABASE_URL: 'postgresql://fixture@remote.example/safethrift_t40_test',
      },
      { DATABASE_URL: 'postgresql://fixture@localhost/production' },
      { T40_APPLICATIONS_ENABLED: 'true' },
      { T40_FIXTURE_MODE: 'yes' },
    ])
      expect(() =>
        validateRegistrationEnvironment({ ...config, ...patch }),
      ).toThrow();
  });
  it('accepts only account identity at registration and rejects application or authority fields', () => {
    const account = {
      ...personal,
      email: 'fixture@example.invalid',
      password: 'Fixture@1234',
    };
    expect(
      validateSync(plainToInstance(RegisterDto, account), options),
    ).toHaveLength(0);
    for (const patch of [
      { membershipType: 'individual' },
      { declarations: [true, true, true, true] },
      { isAdmin: true },
      { role: 'admin' },
      { firstName: 42 },
      { firstName: '  ' },
    ])
      expect(
        validateSync(
          plainToInstance(RegisterDto, { ...account, ...patch }),
          options,
        ).length,
      ).toBeGreaterThan(0);
  });
  it('requires full personal details, four actual booleans, versioned content and a nonempty signature', () => {
    const dto = {
      personalDetails: personal,
      membershipType: 'individual',
      householdMembers: [],
      declarations: [false, true, false, true],
      contentVersion: DEVELOPMENT_CONTENT_VERSION,
      signatureText: 'Fixture Only',
      signedDate: '2026-01-01',
      preferredPaymentMethod: 'card',
    };
    expect(
      validateSync(plainToInstance(ApplyMembershipDto, dto), options),
    ).toHaveLength(0);
    for (const patch of [
      { personalDetails: undefined },
      { declarations: [true] },
      { declarations: ['true', true, true, true] },
      { contentVersion: 'approved-terms' },
      { signatureText: '  ' },
      { signedDate: '2026-02-31' },
      { cardNumber: '1234' },
      { membershipFeePaid: true },
    ])
      expect(
        validateSync(
          plainToInstance(ApplyMembershipDto, { ...dto, ...patch }),
          options,
        ).length,
      ).toBeGreaterThan(0);
  });
  it('validates real calendar dates, future dates, age boundaries and nested household fields', () => {
    expect(calendarDate('2024-02-29')).toBe(true);
    for (const value of [
      '2023-02-29',
      '2026-02-31',
      '2999-01-01',
      '2020-01-01T00:00:00Z',
    ])
      expect(calendarDate(value)).toBe(false);
    expect(calendarDate(new Date().toISOString().slice(0, 10), true)).toBe(
      false,
    );
    const dto = {
      personalDetails: personal,
      membershipType: 'family',
      householdMembers: [{ fullName: ' ', dateOfBirth: '2026-02-31' }],
      declarations: [false, false, false, false],
      contentVersion: DEVELOPMENT_CONTENT_VERSION,
      signatureText: 'Fixture',
      signedDate: '2026-01-01',
      preferredPaymentMethod: 'bank_transfer',
    };
    expect(
      validateSync(plainToInstance(ApplyMembershipDto, dto), options).some(
        (error) => error.property === 'householdMembers',
      ),
    ).toBe(true);
  });
});
