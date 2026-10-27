export class DashboardError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export class DashboardSession {
  private generation = 0;
  constructor(
    private readonly base: string,
    private readonly onUnauthorized: () => void = () => {},
  ) {}
  private accessToken = "";
  private memberId = "";
  private refreshing: Promise<void> | null = null;
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
          : response.status === 403
            ? "This account or operation is not permitted."
            : response.status === 404
              ? "Account not found."
              : response.status === 409
                ? "This request conflicts with a recorded operation. Keep the original request key."
                : response.status === 429
                  ? "Too many attempts. Wait before retrying."
                  : response.status >= 500
                    ? "The result could not be confirmed. Retry the unchanged request."
                    : "Check the amount and details. The account or balance may not allow this operation.";
      throw new DashboardError(message, response.status);
    }
    return response.json() as Promise<T>;
  }
  async login(email: string, password: string): Promise<{ id: string }> {
    this.clear();
    const generation = this.generation;
    try {
      const data = await this.send<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      this.assertCurrent(generation);
      this.accessToken = data.accessToken;
      const member = await this.request<{ id: string }>("/members/me");
      this.assertCurrent(generation);
      if (typeof member.id !== "string" || !member.id)
        throw new DashboardError("Identity unavailable. Sign in again.", 401);
      this.memberId = member.id;
      return member;
    } catch (error) {
      if (generation === this.generation) this.clear();
      throw error;
    }
  }
  private assertCurrent(generation: number): void {
    if (this.generation !== generation)
      throw new DashboardError("Your session ended. Sign in again.", 401);
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
        if (this.generation === generation) {
          this.clear();
          this.onUnauthorized();
        }
        throw error;
      })
      .finally(() => {
        if (this.refreshing === pending) this.refreshing = null;
      });
    this.refreshing = pending;
    return pending;
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (
      !/^\/(?:members\/me|accounts(?:\/[^?#]*)?(?:\?[^#]*)?|auth\/logout)$/.test(
        path,
      )
    )
      throw new Error("Invalid dashboard API path");
    const generation = this.generation;
    const sentToken = this.accessToken;
    if (!sentToken)
      throw new DashboardError("Sign in to view your dashboard.", 401);
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
        !(error instanceof DashboardError) ||
        error.status !== 401 ||
        !this.memberId
      )
        throw error;
      if (this.accessToken === sentToken) await this.refresh();
      this.assertCurrent(generation);
      try {
        const result = await this.send<T>(path, {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${this.accessToken}`,
          },
        });
        this.assertCurrent(generation);
        return result;
      } catch (retryError) {
        this.assertCurrent(generation);
        if (retryError instanceof DashboardError && retryError.status === 401) {
          this.clear();
          this.onUnauthorized();
        }
        throw retryError;
      }
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
