export class RegistrationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export type ApplicationReceipt = {
  applicationId: string;
  submissionId: string;
  submittedAt: string;
  developmentFixture: boolean;
  message: string;
};
export type ApplicationContext = {
  memberId: string;
  email: string;
  state:
    | "not_submitted"
    | "submitted"
    | "historical_review_required"
    | "ineligible";
  personalDetails: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    phoneNumber: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    postcode: string;
  };
  receipt: ApplicationReceipt | null;
  content: { version: string; approved: boolean; declarations: string[] };
};
// Memory only. The HttpOnly refresh cookie is managed by the existing Nest API.
// A page reload requires login again; no token or member locator is persisted.
export class RegistrationSession {
  private generation = 0;
  private accessToken = "";
  private memberId = "";
  private refreshing: Promise<void> | null = null;
  constructor(private readonly base: string) {}
  private async send<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(this.base + path, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    if (!response.ok) {
      const message =
        response.status === 401
          ? "Your session ended. Sign in again."
          : response.status === 409
            ? "An account or application already exists. Sign in or retrieve your application receipt."
            : response.status === 403
              ? "Registration is closed or this account is not eligible."
              : response.status === 429
                ? "Too many attempts. Please wait before trying again."
                : response.status >= 500
                  ? "The request could not be confirmed. Retry with the same details; no duplicate application will be created."
                  : "Check the entered information and try again.";
      throw new RegistrationError(message, response.status);
    }
    return response.json() as Promise<T>;
  }
  publicRequest<T>(
    path: "/auth/register" | "/auth/verify-email",
    body: unknown,
  ): Promise<T> {
    return this.send(path, { method: "POST", body: JSON.stringify(body) });
  }
  async login(email: string, password: string): Promise<ApplicationContext> {
    this.clear();
    const generation = this.generation;
    const data = await this.send<{ accessToken: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    this.assertCurrent(generation);
    this.accessToken = data.accessToken;
    try {
      const context = await this.request<ApplicationContext>(
        "/membership/application",
      );
      this.assertCurrent(generation);
      this.memberId = context.memberId;
      return context;
    } catch (error) {
      if (this.generation === generation) this.clear();
      throw error;
    }
  }
  private assertCurrent(generation: number): void {
    if (this.generation !== generation)
      throw new RegistrationError("Your session ended. Sign in again.", 401);
  }
  private refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const pending = this.send<{ accessToken: string }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ memberId: this.memberId }),
    })
      .then((data) => {
        this.assertCurrent(generation);
        this.accessToken = data.accessToken;
      })
      .catch((error) => {
        if (this.generation === generation) this.clear();
        throw error;
      })
      .finally(() => {
        if (this.refreshing === pending) this.refreshing = null;
      });
    this.refreshing = pending;
    return pending;
  }
  async request<T>(
    path: "/membership/application" | "/membership/apply" | "/auth/logout",
    init: RequestInit = {},
  ): Promise<T> {
    const generation = this.generation;
    const sentToken = this.accessToken;
    if (!sentToken)
      throw new RegistrationError(
        "Sign in before completing an application.",
        401,
      );
    try {
      const result = await this.send<T>(path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${sentToken}` },
      });
      this.assertCurrent(generation);
      return result;
    } catch (error) {
      this.assertCurrent(generation);
      if (
        !(error instanceof RegistrationError) ||
        error.status !== 401 ||
        !this.memberId
      )
        throw error;
      if (this.accessToken === sentToken) await this.refresh();
      this.assertCurrent(generation);
      const result = await this.send<T>(path, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${this.accessToken}`,
        },
      });
      this.assertCurrent(generation);
      return result;
    }
  }
  async logout(): Promise<void> {
    const token = this.accessToken;
    this.clear();
    if (token)
      await this.send("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
  }
  clear(): void {
    this.generation++;
    this.accessToken = "";
    this.memberId = "";
    this.refreshing = null;
  }
}
