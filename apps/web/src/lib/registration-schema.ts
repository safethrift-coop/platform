import { z } from "zod";
export const DEVELOPMENT_CONTENT_VERSION = "t40-development-placeholder-v1";
export const DECLARATIONS = [
  "Development declaration placeholder 1 — not approved",
  "Development declaration placeholder 2 — not approved",
  "Development declaration placeholder 3 — not approved",
  "Development declaration placeholder 4 — not approved",
] as const;
export function validDate(value: string, adult = false): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value > new Date().toISOString().slice(0, 10) ||
    value < "1900-01-01"
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
const text = (max: number) =>
  z.string().trim().min(1, "Enter a value").max(max);
export const personalSchema = z.object({
  firstName: text(100),
  lastName: text(100),
  dateOfBirth: z
    .string()
    .refine(
      (v) => validDate(v, true),
      "Enter a valid date of birth (18 or over)",
    ),
  phoneNumber: z
    .string()
    .trim()
    .min(12)
    .max(20)
    .regex(/^\+?[0-9\s\-()]+$/, "Enter a valid phone number"),
  addressLine1: text(200),
  addressLine2: z.string().trim().max(200),
  city: text(100),
  postcode: z
    .string()
    .trim()
    .max(12)
    .regex(
      /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i,
      "Enter a valid UK postcode",
    ),
});
export const accountSchema = personalSchema.extend({
  email: z
    .email()
    .max(255)
    .refine(
      (v) => /^[^\s@]+@[^\s@]+\.invalid$/i.test(v),
      "Use a synthetic .invalid email address",
    ),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&\-_#])[A-Za-z\d@$!%*?&\-_#]{8,}$/,
      "Use uppercase, lowercase, a number and a supported symbol",
    ),
});
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export const verificationSchema = z.object({
  token: z.uuidv4("Enter the verification code supplied by the local fixture"),
});
export const applicationSchema = z
  .object({
    personalDetails: personalSchema,
    membershipType: z.enum(["individual", "family"]),
    householdMembers: z
      .array(
        z.object({
          fullName: text(200),
          dateOfBirth: z
            .string()
            .refine(
              (v) => validDate(v),
              "Enter a valid date that is not in the future",
            ),
        }),
      )
      .max(20),
    occupation: z.string().trim().max(100),
    referralSource: z.string().trim().max(200),
    whyJoining: z.string().trim().max(500),
    declarations: z.array(z.boolean()).length(4),
    contentVersion: z.literal(DEVELOPMENT_CONTENT_VERSION),
    signatureText: text(200),
    signedDate: z
      .string()
      .refine(
        (v) => validDate(v),
        "Enter a valid date that is not in the future",
      ),
    preferredPaymentMethod: z.enum(["direct_debit", "bank_transfer", "card"], {
      error: "Choose a payment preference",
    }),
  })
  .superRefine((value, ctx) => {
    if (value.membershipType === "family" && !value.householdMembers.length)
      ctx.addIssue({
        code: "custom",
        path: ["householdMembers"],
        message: "Add at least one synthetic household member",
      });
    if (value.membershipType === "individual" && value.householdMembers.length)
      ctx.addIssue({
        code: "custom",
        path: ["householdMembers"],
        message: "Remove household details for an individual application",
      });
  });
export type AccountValues = z.infer<typeof accountSchema>;
export type ApplicationValues = z.infer<typeof applicationSchema>;
export const emptyPersonal = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  phoneNumber: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
};
