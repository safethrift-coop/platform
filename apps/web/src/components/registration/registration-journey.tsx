"use client";
import { useEffect, useRef, useState, type BaseSyntheticEvent } from "react";
import {
  useFieldArray,
  useWatch,
  useForm,
  type FieldPath,
  type UseFormRegisterReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  accountSchema,
  applicationSchema,
  loginSchema,
  verificationSchema,
  emptyPersonal,
  DECLARATIONS,
  DEVELOPMENT_CONTENT_VERSION,
  type AccountValues,
  type ApplicationValues,
} from "@/lib/registration-schema";
import {
  RegistrationError,
  RegistrationSession,
  type ApplicationContext,
  type ApplicationReceipt,
} from "@/lib/registration-session";
import styles from "./registration.module.css";
const personalFields = [
  ["firstName", "First name", "text"],
  ["lastName", "Last name", "text"],
  ["dateOfBirth", "Date of birth", "date"],
  ["phoneNumber", "Phone number", "tel"],
  ["addressLine1", "Address line 1", "text"],
  ["addressLine2", "Address line 2 (optional)", "text"],
  ["city", "City", "text"],
  ["postcode", "Postcode", "text"],
] as const;
const steps = [
  "Personal Details",
  "Membership Type",
  "Household Members",
  "Additional Information",
  "Declaration",
  "Signature and Date",
  "Payment Method",
];
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be confirmed. Please try again.";
}
function fieldError(errors: unknown, name: string): string | undefined {
  let current = errors;
  for (const key of name.split(".")) {
    if (!current || typeof current !== "object") return;
    current = (current as Record<string, unknown>)[key];
  }
  return current &&
    typeof current === "object" &&
    "message" in current &&
    typeof current.message === "string"
    ? current.message
    : undefined;
}
function Field({
  name,
  label,
  registration,
  error,
  type = "text",
  maxLength,
}: {
  name: string;
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
  type?: string;
  maxLength?: number;
}) {
  const id = name.replaceAll(".", "-");
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        {...registration}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? id + "-error" : undefined}
        autoComplete={type === "password" ? "new-password" : "off"}
      />
      {error && (
        <p className={styles.fieldError} id={id + "-error"}>
          {error}
        </p>
      )}
    </div>
  );
}
function PrivacyNotice() {
  return (
    <aside className={styles.privacy} aria-label="Development privacy notice">
      <strong>Development privacy placeholder — not approved</strong>
      <p>
        Use synthetic test details only. Approved privacy information, terms and
        declaration wording are not configured. Public registration and real
        application submission remain closed. No payment is taken.
      </p>
    </aside>
  );
}
function AccountForm({
  session,
  onCreated,
  onLogin,
}: {
  session: RegistrationSession;
  onCreated: (email: string) => void;
  onLogin: () => void;
}) {
  const form = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: { ...emptyPersonal, email: "", password: "" },
  });
  const [error, setError] = useState("");
  const submit = form.handleSubmit(async (data) => {
    setError("");
    try {
      await session.publicRequest("/auth/register", data);
      form.reset();
      onCreated(data.email);
    } catch (error) {
      setError(errorMessage(error));
    }
  });
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Before the application</p>
      <h2>Create your test account</h2>
      <p>
        Account creation does not submit an application. Verify your email, then
        sign in to complete the seven steps.
      </p>
      <form onSubmit={submit} noValidate autoComplete="off">
        <div className={styles.grid}>
          {personalFields.map(([key, label, type]) => (
            <Field
              key={key}
              name={key}
              label={label}
              type={type}
              registration={form.register(key)}
              error={form.formState.errors[key]?.message}
            />
          ))}
          <Field
            name="email"
            label="Synthetic email (.invalid)"
            type="email"
            registration={form.register("email")}
            error={form.formState.errors.email?.message}
          />
          <Field
            name="password"
            label="Password"
            type="password"
            registration={form.register("password")}
            error={form.formState.errors.password?.message}
          />
        </div>
        <p className={styles.hint}>
          Use at least eight characters, with uppercase, lowercase, a number and
          a supported symbol such as @.
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" disabled={form.formState.isSubmitting}>
            Create account
          </button>
          <button type="button" className={styles.secondary} onClick={onLogin}>
            Already have an account? Sign in
          </button>
        </div>
      </form>
    </section>
  );
}
function VerificationForm({
  session,
  onVerified,
  onLogin,
}: {
  session: RegistrationSession;
  onVerified: () => void;
  onLogin: () => void;
}) {
  const form = useForm<{ token: string }>({
    resolver: zodResolver(verificationSchema),
    defaultValues: { token: "" },
  });
  const [error, setError] = useState("");
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Email verification</p>
      <h2>Verify your account email</h2>
      <p>
        Enter the code captured by the local test mailbox. Codes are submitted
        in the request body and are never placed in a link.
      </p>
      <form
        noValidate
        onSubmit={form.handleSubmit(async (data) => {
          setError("");
          try {
            await session.publicRequest("/auth/verify-email", data);
            form.reset();
            onVerified();
          } catch (error) {
            setError(errorMessage(error));
          }
        })}
      >
        <Field
          name="token"
          label="Verification code"
          registration={form.register("token")}
          error={form.formState.errors.token?.message}
        />
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button disabled={form.formState.isSubmitting}>Verify email</button>
          <button type="button" className={styles.secondary} onClick={onLogin}>
            Already verified? Sign in
          </button>
        </div>
      </form>
    </section>
  );
}
function LoginForm({
  session,
  email,
  onLoggedIn,
  onCreate,
  onVerify,
}: {
  session: RegistrationSession;
  email: string;
  onLoggedIn: (context: ApplicationContext) => void;
  onCreate: () => void;
  onVerify: () => void;
}) {
  const form = useForm<{ email: string; password: string }>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email, password: "" },
  });
  const [error, setError] = useState("");
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Verified accounts only</p>
      <h2>Sign in to continue</h2>
      <p>
        Signing in does not approve membership. Your application remains
        separate from your account.
      </p>
      <form
        noValidate
        onSubmit={form.handleSubmit(async (data) => {
          setError("");
          try {
            const context = await session.login(data.email, data.password);
            form.reset();
            onLoggedIn(context);
          } catch (error) {
            setError(errorMessage(error));
          }
        })}
      >
        <div className={styles.grid}>
          <Field
            name="email"
            label="Email"
            type="email"
            registration={form.register("email")}
            error={form.formState.errors.email?.message}
          />
          <Field
            name="password"
            label="Password"
            type="password"
            registration={form.register("password")}
            error={form.formState.errors.password?.message}
          />
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button disabled={form.formState.isSubmitting}>Sign in</button>
          <button type="button" className={styles.secondary} onClick={onCreate}>
            Create an account
          </button>
          <button type="button" className={styles.secondary} onClick={onVerify}>
            Enter verification code
          </button>
        </div>
      </form>
    </section>
  );
}
function ApplicationForm({
  context,
  session,
  fixtureSubmissions,
  onReceived,
  onExpired,
}: {
  context: ApplicationContext;
  session: RegistrationSession;
  fixtureSubmissions: boolean;
  onReceived: (receipt: ApplicationReceipt) => void;
  onExpired: () => void;
}) {
  const form = useForm<ApplicationValues>({
    resolver: zodResolver(applicationSchema),
    shouldUnregister: false,
    mode: "onChange",
    defaultValues: {
      personalDetails: context.personalDetails,
      membershipType: "individual",
      householdMembers: [],
      occupation: "",
      referralSource: "",
      whyJoining: "",
      declarations: [false, false, false, false],
      contentVersion: DEVELOPMENT_CONTENT_VERSION,
      signatureText: "",
      signedDate: new Date().toISOString().slice(0, 10),
    },
  });
  const household = useFieldArray({
    control: form.control,
    name: "householdMembers",
  });
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const key = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const tier = useWatch({ control: form.control, name: "membershipType" });
  const fields: FieldPath<ApplicationValues>[][] = [
    ["personalDetails"],
    ["membershipType"],
    ["householdMembers"],
    ["occupation", "referralSource", "whyJoining"],
    ["declarations", "contentVersion"],
    ["signatureText", "signedDate"],
    ["preferredPaymentMethod"],
  ];
  async function next() {
    setValidationMessage("");
    if (await form.trigger(fields[step], { shouldFocus: true }))
      setStep((value) => value + 1);
    else
      setValidationMessage("Check the highlighted fields before continuing.");
  }
  async function submit(event?: BaseSyntheticEvent) {
    await form.handleSubmit(
      async (data) => {
        if (!fixtureSubmissions) return;
        setError("");
        key.current ??= crypto.randomUUID();
        try {
          const receipt = await session.request<ApplicationReceipt>(
            "/membership/apply",
            {
              method: "POST",
              headers: { "Idempotency-Key": key.current },
              body: JSON.stringify(data),
            },
          );
          form.reset();
          key.current = null;
          onReceived(receipt);
        } catch (error) {
          setUncertain(true);
          if (error instanceof RegistrationError && error.status === 401) {
            form.reset();
            onExpired();
          } else setError(errorMessage(error));
        }
      },
      (errors) => {
        setValidationMessage(
          "Some application fields need attention. Return to the highlighted step.",
        );
        const first = fields.findIndex((names) =>
          names.some(
            (name) =>
              fieldError(errors, name) ||
              (errors as Record<string, unknown>)[name.split(".")[0]],
          ),
        );
        if (first >= 0) setStep(first);
      },
    )(event);
  }
  const input = (
    name: FieldPath<ApplicationValues>,
    label: string,
    type = "text",
    maxLength?: number,
  ) => (
    <Field
      key={name}
      name={name}
      label={label}
      type={type}
      maxLength={maxLength}
      registration={form.register(name)}
      error={fieldError(form.formState.errors, name)}
    />
  );
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Synthetic membership application</p>
      <ol className={styles.progress} aria-label="Application steps">
        {steps.map((name, index) => (
          <li key={name} aria-current={step === index ? "step" : undefined}>
            <span>{index + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <h2 ref={heading} tabIndex={-1}>
        Step {step + 1}: {steps[step]}
      </h2>
      <p className={styles.hint}>
        Progress is kept only in this page’s memory. Reloading or signing out
        clears unsent details.
      </p>
      {validationMessage && (
        <p role="alert" className={styles.error}>
          {validationMessage}
        </p>
      )}
      <form
        noValidate
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          if (step === 6) void submit(event);
          else void next();
        }}
      >
        <fieldset
          disabled={form.formState.isSubmitting || uncertain}
          className={styles.fields}
        >
          {step === 0 && (
            <>
              <p>
                Review the synthetic details for this application. This snapshot
                does not modify your account profile.
              </p>
              <div className={styles.grid}>
                {personalFields.map(([name, label, type]) =>
                  input(`personalDetails.${name}`, label, type),
                )}
              </div>
            </>
          )}
          {step === 1 && (
            <fieldset className={styles.choices}>
              <legend>Choose membership type</legend>
              {["individual", "family"].map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    value={value}
                    {...form.register("membershipType", {
                      onChange: (event) => {
                        household.replace(
                          event.target.value === "family"
                            ? [{ fullName: "", dateOfBirth: "" }]
                            : [],
                        );
                      },
                    })}
                  />
                  {value === "individual" ? "Individual" : "Family"}
                </label>
              ))}
              <p>
                No membership fee is assigned or collected in this development
                flow.
              </p>
            </fieldset>
          )}
          {step === 2 &&
            (tier === "individual" ? (
              <p>
                Household details are not needed for an individual application.
                Continue to Additional Information.
              </p>
            ) : (
              <>
                <p>
                  Use fictional household details only. The 20-entry limit is a
                  technical test bound, not an approved family eligibility
                  policy.
                </p>
                {household.fields.map((field, index) => (
                  <fieldset key={field.id} className={styles.household}>
                    <legend>Household member {index + 1}</legend>
                    <div className={styles.grid}>
                      {input(`householdMembers.${index}.fullName`, "Full name")}
                      {input(
                        `householdMembers.${index}.dateOfBirth`,
                        "Date of birth",
                        "date",
                      )}
                    </div>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => household.remove(index)}
                    >
                      Remove household member {index + 1}
                    </button>
                  </fieldset>
                ))}
                {fieldError(form.formState.errors, "householdMembers") && (
                  <p role="alert" className={styles.fieldError}>
                    {fieldError(form.formState.errors, "householdMembers")}
                  </p>
                )}
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={household.fields.length >= 20}
                  onClick={() =>
                    household.append({ fullName: "", dateOfBirth: "" })
                  }
                >
                  Add household member
                </button>
              </>
            ))}
          {step === 3 && (
            <div className={styles.grid}>
              {input("occupation", "Occupation (optional)", "text", 100)}
              {input(
                "referralSource",
                "How did you hear about Safethrift? (optional)",
                "text",
                200,
              )}
              {input(
                "whyJoining",
                "Why would you like to join? (optional)",
                "text",
                500,
              )}
            </div>
          )}
          {step === 4 && (
            <fieldset className={styles.choices}>
              <legend>Four development declaration placeholders</legend>
              <p>
                These labels are not approved legal declarations. Checked and
                unchecked responses are both permitted in fixture tests; no real
                consent requirement is inferred.
              </p>
              {DECLARATIONS.map((label, index) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    {...form.register(`declarations.${index}`)}
                  />
                  {label}
                </label>
              ))}
              <p className={styles.hint}>
                Content version: {DEVELOPMENT_CONTENT_VERSION}
              </p>
            </fieldset>
          )}
          {step === 5 && (
            <>
              <p>
                The typed name and selected date are development signature
                evidence only. The server records its own receipt/signing
                timestamp.
              </p>
              <div className={styles.grid}>
                {input(
                  "signatureText",
                  "Typed name (development signature)",
                  "text",
                  200,
                )}
                {input("signedDate", "Signature date", "date")}
              </div>
            </>
          )}
          {step === 6 && (
            <>
              <p>
                This records a preference only. Do not enter card numbers, bank
                details or mandate information. No payment, fee, mandate or
                financial obligation will be created.
              </p>
              <div className={styles.field}>
                <label htmlFor="preferredPaymentMethod">
                  Preferred payment method
                </label>
                <select
                  id="preferredPaymentMethod"
                  {...form.register("preferredPaymentMethod")}
                  defaultValue=""
                  aria-invalid={Boolean(
                    form.formState.errors.preferredPaymentMethod,
                  )}
                  aria-describedby={
                    form.formState.errors.preferredPaymentMethod
                      ? "payment-error"
                      : undefined
                  }
                >
                  <option value="" disabled>
                    Choose a preference
                  </option>
                  <option value="direct_debit">Direct Debit preference</option>
                  <option value="bank_transfer">
                    Bank transfer preference
                  </option>
                  <option value="card">Card preference</option>
                </select>
                {form.formState.errors.preferredPaymentMethod && (
                  <p id="payment-error" className={styles.fieldError}>
                    {form.formState.errors.preferredPaymentMethod.message}
                  </p>
                )}
              </div>
              <p className={styles.hint}>
                {fixtureSubmissions
                  ? "Only a local synthetic fixture can be submitted. Public application submission remains disabled."
                  : "Final submission is disabled until approved content and policies are configured."}
              </p>
            </>
          )}
        </fieldset>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {uncertain ? (
          <div className={styles.actions}>
            <button
              type="button"
              disabled={form.formState.isSubmitting}
              onClick={() => void submit()}
            >
              Retry unchanged submission
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() =>
                void session
                  .request<ApplicationContext>("/membership/application")
                  .then((result) => {
                    if (result.receipt) onReceived(result.receipt);
                    else
                      setError(
                        "No committed receipt was found. Retry the unchanged submission.",
                      );
                  })
                  .catch((error) => setError(errorMessage(error)))
              }
            >
              Check application receipt
            </button>
          </div>
        ) : (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              disabled={step === 0 || form.formState.isSubmitting}
              onClick={() => {
                setValidationMessage("");
                setStep((value) => value - 1);
              }}
            >
              Back
            </button>
            {step < 6 ? (
              <button type="button" onClick={() => void next()}>
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={!fixtureSubmissions || form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? "Submitting…"
                  : "Submit synthetic test application"}
              </button>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
export function RegistrationJourney({
  apiBase,
  fixtureSubmissions,
  initialStage,
}: {
  apiBase: string;
  fixtureSubmissions: boolean;
  initialStage: "create" | "verify" | "login";
}) {
  const [session] = useState(() => new RegistrationSession(apiBase));
  const [stage, setStage] = useState<
    "create" | "verify" | "login" | "application" | "received"
  >(initialStage);
  const [email, setEmail] = useState("");
  const [context, setContext] = useState<ApplicationContext | null>(null);
  const [receipt, setReceipt] = useState<ApplicationReceipt | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => () => session.clear(), [session]);
  const received = (value: ApplicationReceipt) => {
    setReceipt(value);
    setContext(null);
    setStage("received");
  };
  const switchStage = (value: "create" | "verify" | "login") => {
    setNotice("");
    session.clear();
    setContext(null);
    setReceipt(null);
    setStage(value);
  };
  return (
    <div className={`container ${styles.root}`}>
      <PrivacyNotice />
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      {stage === "create" && (
        <AccountForm
          session={session}
          onCreated={(value) => {
            setEmail(value);
            setNotice(
              "Account created. No membership application has been submitted.",
            );
            setStage("verify");
          }}
          onLogin={() => switchStage("login")}
        />
      )}
      {stage === "verify" && (
        <VerificationForm
          session={session}
          onVerified={() => {
            setNotice(
              "Email verified. Sign in to begin the membership application.",
            );
            setStage("login");
          }}
          onLogin={() => switchStage("login")}
        />
      )}
      {stage === "login" && (
        <LoginForm
          session={session}
          email={email}
          onCreate={() => switchStage("create")}
          onVerify={() => switchStage("verify")}
          onLoggedIn={(value) => {
            setNotice("");
            if (value.receipt) received(value.receipt);
            else {
              setContext(value);
              setStage("application");
            }
          }}
        />
      )}
      {stage === "application" &&
        context &&
        (context.state !== "not_submitted" ? (
          <section className={styles.panel}>
            <h2>Registration needs separate review</h2>
            <p>
              Your existing account or historical registration has not been
              converted into a new application.
            </p>
          </section>
        ) : (
          <ApplicationForm
            context={context}
            session={session}
            fixtureSubmissions={fixtureSubmissions}
            onReceived={received}
            onExpired={() => {
              setNotice(
                "Your session ended. Unsent details were cleared; sign in again.",
              );
              setContext(null);
              setStage("login");
            }}
          />
        ))}
      {stage === "received" && receipt && (
        <section className={styles.panel} role="status">
          <p className={styles.eyebrow}>
            Application received — development fixture
          </p>
          <h2>Await administrative review</h2>
          <p>
            Your synthetic application has been recorded. Account creation,
            payment preference and receipt do not approve membership.
          </p>
          <dl>
            <dt>Application reference</dt>
            <dd>{receipt.applicationId}</dd>
            <dt>Received at</dt>
            <dd>
              {new Date(receipt.submittedAt).toLocaleString("en-GB", {
                timeZone: "UTC",
              })}{" "}
              UTC
            </dd>
          </dl>
          <p>No payment was collected and no savings account was created.</p>
        </section>
      )}
      {(stage === "application" || stage === "received") && (
        <div className={styles.signout}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() =>
              void session
                .logout()
                .catch(() => undefined)
                .finally(() => {
                  setContext(null);
                  setReceipt(null);
                  setEmail("");
                  setStage("login");
                })
            }
          >
            Sign out and clear this page
          </button>
        </div>
      )}
    </div>
  );
}
