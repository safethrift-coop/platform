import { registerDecorator } from 'class-validator';
export function calendarDate(value: unknown, adult = false): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + 'T00:00:00.000Z');
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value > new Date().toISOString().slice(0, 10) ||
    value < '1900-01-01'
  )
    return false;
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  if (
    now.getUTCMonth() < date.getUTCMonth() ||
    (now.getUTCMonth() === date.getUTCMonth() &&
      now.getUTCDate() < date.getUTCDate())
  )
    age--;
  return !adult || (age >= 18 && age <= 120);
}
export function IsCalendarDate(adult = false): PropertyDecorator {
  return (target, property) =>
    registerDecorator({
      name: 'calendarDate',
      target: target.constructor,
      propertyName: String(property),
      validator: {
        validate: (value) => calendarDate(value, adult),
        defaultMessage: () =>
          adult
            ? 'Enter a valid date of birth (18 or over)'
            : 'Enter a valid date that is not in the future',
      },
    });
}
