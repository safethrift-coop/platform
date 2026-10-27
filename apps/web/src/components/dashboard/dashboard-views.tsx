"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import type {
  Account,
  Activity,
  ActivityPage,
  Overview,
} from "@/lib/dashboard-contract";
import {
  accountLabel,
  gbp,
  provenanceLabel,
  riskLabel,
} from "@/lib/dashboard-display";
import { DashboardError } from "@/lib/dashboard-session";
import { useDashboard } from "./dashboard-provider";
import styles from "./dashboard.module.css";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Data unavailable. Try again.";
function ActivityList({ items }: { items: Activity[] }) {
  if (!items.length) return <p>No recorded transactions.</p>;
  return (
    <ul className={styles.activity}>
      {items.map((item) => (
        <li key={item.id} tabIndex={-1} data-transaction-id={item.id}>
          <div className={styles.row}>
            <strong>
              {item.source === "deposit" ? "Deposit" : "Withdrawal"}
            </strong>
            <strong>{gbp(item.amount)}</strong>
          </div>
          <p>
            <Link
              href={`/dashboard/accounts/${encodeURIComponent(item.accountId)}`}
            >
              {accountLabel(item.accountType)}
            </Link>{" "}
            ·{" "}
            {new Date(item.transactionDate).toLocaleString("en-GB", {
              timeZone: "UTC",
            })}{" "}
            UTC
          </p>
          <p>
            Recorded status: {item.status}. {provenanceLabel(item.provenance)}.
          </p>
        </li>
      ))}
    </ul>
  );
}
export function DashboardOverview() {
  const { session } = useDashboard();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const load = useCallback(
    () =>
      session
        .request<Overview>("/accounts/overview")
        .then((result) => {
          if (mounted.current) {
            setData(result);
            setError("");
          }
        })
        .catch((e) => {
          if (mounted.current) setError(message(e));
        })
        .finally(() => {
          if (mounted.current) setLoading(false);
        }),
    [session],
  );
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  return (
    <div aria-busy={loading}>
      {loading && <p role="status">Loading dashboard…</p>}
      {error && (
        <div role="alert" className={styles.error}>
          <p>
            {error} {data && "Previously loaded data may be out of date."}
          </p>
          <button
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            Retry dashboard
          </button>
        </div>
      )}
      {data && (
        <>
          {data.membershipStatus === "pending" && (
            <p className={styles.notice}>
              Membership is pending. Account access does not mean membership
              approval. Simulation writes require active membership.
            </p>
          )}
          <div className={styles.grid}>
            <section className={styles.panel}>
              <h2>Savings Points</h2>
              <p className={styles.value}>
                {data.savingsPointsTotal.toLocaleString("en-GB")}
              </p>
              <p>Points are not cash earnings.</p>
            </section>
            <section className={styles.panel}>
              <h2>Current risk band</h2>
              <p className={styles.value}>{riskLabel(data.riskBand)}</p>
              <p>Your current recorded risk band.</p>
            </section>
          </div>
          <section className={styles.panel}>
            <h2>Active savings accounts</h2>
            {!data.accounts.length ? (
              <p>No active savings accounts.</p>
            ) : (
              <ul className={styles.accounts}>
                {data.accounts.map((account) => (
                  <li key={account.id}>
                    <h3>
                      <Link
                        href={`/dashboard/accounts/${encodeURIComponent(account.id)}`}
                      >
                        {accountLabel(account.accountType)}
                      </Link>
                    </h3>
                    <p>{account.accountNumber}</p>
                    <strong className={styles.value}>
                      {gbp(account.currentBalance)}
                    </strong>
                    <p>{account.balanceNotice}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={styles.panel}>
            <h2>Recent transactions</h2>
            <ActivityList items={data.recentActivity.items} />
          </section>
        </>
      )}
    </div>
  );
}
function SimulationForm({
  operation,
  account,
  refreshed,
}: {
  operation: "deposit" | "withdrawal";
  account: Account;
  refreshed: () => Promise<void>;
}) {
  const { session, localSimulation, attempts } = useDashboard();
  const identity = `${account.id}:${operation}`;
  const [attempt, setAttempt] = useState(() => attempts.get(identity));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [validation, setValidation] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const enabled = localSimulation && account.capability[operation];
  const label = operation === "deposit" ? "Deposit" : "Withdrawal";
  useEffect(() => {
    if (validation) errorRef.current?.focus();
  }, [validation]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || inFlight.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const amount = String(fields.get("amount") ?? "");
    let current = attempt;
    const retryingUncertain = !!current;
    if (!current) {
      if (
        !/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(amount) ||
        Number(amount) <= 0 ||
        Number(amount) > 10000
      ) {
        setValidation(
          "Enter an amount greater than £0.00 and at most £10,000.00, with at most two decimal places.",
        );
        return;
      }
      const detail = String(fields.get("detail") ?? "");
      current = {
        key: crypto.randomUUID(),
        body: JSON.stringify({
          amount,
          [operation === "deposit" ? "note" : "reason"]: detail,
        }),
        uncertain: true,
      };
      attempts.set(identity, current);
      setAttempt(current);
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    setValidation("");
    try {
      await session.request(
        `/accounts/${encodeURIComponent(account.id)}/${operation === "deposit" ? "deposit" : "withdraw"}`,
        {
          method: "POST",
          body: current.body,
          headers: { "Idempotency-Key": current.key },
        },
      );
      attempts.delete(identity);
      setAttempt(undefined);
      form.reset();
      setSuccess(
        `Simulation recorded: ${gbp(JSON.parse(current.body).amount.split(".")[0] + "." + (JSON.parse(current.body).amount.split(".")[1] ?? "").padEnd(2, "0"))}. No external money moved.`,
      );
      await refreshed();
    } catch (e) {
      const uncertain =
        retryingUncertain ||
        !(e instanceof DashboardError) ||
        e.status >= 500 ||
        e.status === 409;
      if (!uncertain) {
        attempts.delete(identity);
        setAttempt(undefined);
      }
      setError(message(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel} aria-labelledby={`${operation}-heading`}>
      <h2 id={`${operation}-heading`}>{label} form</h2>
      <p>
        {enabled
          ? "Local simulation only. No external money moves."
          : !localSimulation
            ? "Simulation controls are disabled outside an explicitly enabled local development preview."
            : account.capability.message}
      </p>
      {!account.capability.withdrawal &&
        operation === "withdrawal" &&
        localSimulation && (
          <p>
            The existing account or GSA withdrawal safeguard does not permit
            this simulation.
          </p>
        )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {attempt && (
        <p className={styles.notice}>
          The result is not yet confirmed. Details are frozen. Retry unchanged
          using the original request key. Do not start a replacement operation
          or reload this page.
        </p>
      )}
      {success && <p role="status">{success}</p>}
      <form onSubmit={submit} aria-busy={busy} noValidate>
        <fieldset disabled={!enabled || busy} className={styles.form}>
          <legend>{label} simulation details</legend>
          {validation && (
            <p
              ref={errorRef}
              tabIndex={-1}
              id={`${operation}-error`}
              role="alert"
              className={styles.error}
            >
              {validation}
            </p>
          )}
          <label htmlFor={`${operation}-amount`}>Amount (GBP)</label>
          <input
            id={`${operation}-amount`}
            name="amount"
            inputMode="decimal"
            maxLength={8}
            readOnly={!!attempt}
            defaultValue={attempt ? JSON.parse(attempt.body).amount : ""}
            aria-invalid={!!validation}
            aria-describedby={validation ? `${operation}-error` : undefined}
          />
          <label htmlFor={`${operation}-detail`}>
            {operation === "deposit" ? "Note" : "Reason"} (optional)
          </label>
          <input
            id={`${operation}-detail`}
            name="detail"
            maxLength={operation === "deposit" ? 200 : 500}
            readOnly={!!attempt}
            defaultValue={
              attempt
                ? JSON.parse(attempt.body)[
                    operation === "deposit" ? "note" : "reason"
                  ]
                : ""
            }
          />
          <button disabled={!enabled || busy}>
            {busy
              ? "Confirming simulation…"
              : attempt
                ? `Retry unchanged ${operation} simulation`
                : `Simulate ${operation}`}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
export function DashboardAccount({ accountId }: { accountId: string }) {
  const { session } = useDashboard();
  const [account, setAccount] = useState<Account | null>(null);
  const [page, setPage] = useState<ActivityPage | null>(null);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const mounted = useRef(true);
  const paging = useRef(false);
  const revision = useRef(0);
  const historyRef = useRef<HTMLElement>(null);
  const focusNext = useRef<number | null>(null);
  useEffect(() => {
    if (focusNext.current !== null) {
      historyRef.current?.querySelectorAll("li")[focusNext.current]?.focus();
      focusNext.current = null;
    }
  }, [page]);
  const base = `/accounts/${encodeURIComponent(accountId)}`;
  const load = useCallback(() => {
    const version = ++revision.current;
    return Promise.all([
      session.request<Account>(base),
      session.request<ActivityPage>(base + "/transactions"),
    ])
      .then(([detail, history]) => {
        if (mounted.current && version === revision.current) {
          setAccount(detail);
          setPage(history);
          setError("");
          setPageError("");
        }
      })
      .catch((e) => {
        if (mounted.current && version === revision.current)
          setError(message(e));
      })
      .finally(() => {
        if (mounted.current && version === revision.current) setLoading(false);
      });
  }, [session, base]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  async function loadMore() {
    if (!page?.nextCursor || paging.current || loading) return;
    const version = revision.current;
    paging.current = true;
    setMore(true);
    setPageError("");
    try {
      const result = await session.request<ActivityPage>(
        base + "/transactions?cursor=" + encodeURIComponent(page.nextCursor),
      );
      if (mounted.current && version === revision.current) {
        focusNext.current = page.items.length;
        setPage((previous) =>
          previous
            ? {
                ...result,
                items: [
                  ...new Map(
                    [...previous.items, ...result.items].map((item) => [
                      item.id,
                      item,
                    ]),
                  ).values(),
                ],
              }
            : result,
        );
      }
    } catch (e) {
      if (mounted.current && version === revision.current)
        setPageError(message(e));
    } finally {
      paging.current = false;
      if (mounted.current) setMore(false);
    }
  }
  return (
    <div aria-busy={loading}>
      {loading && <p role="status">Loading account…</p>}
      {error && (
        <div role="alert" className={styles.error}>
          <p>
            {error}{" "}
            {account &&
              "Previously loaded data may be out of date; refresh before submitting."}
          </p>
          <button
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            Retry account
          </button>
        </div>
      )}
      {account && (
        <>
          <section className={styles.panel}>
            <h2>{accountLabel(account.accountType)}</h2>
            <p>
              {account.accountNumber} · {account.accountStatus}
            </p>
            <h3>Recorded balance</h3>
            <p className={styles.value}>{gbp(account.currentBalance)}</p>
            <p className={styles.notice}>{account.balanceNotice}</p>
          </section>
          <section ref={historyRef} className={styles.panel}>
            <h2>Transaction history</h2>
            {page && <ActivityList items={page.items} />}
            <div aria-live="polite">
              {more && <p>Loading more transactions…</p>}
              {!more && page && (
                <p>
                  {page.items.length} recorded transactions loaded.
                  {!page.hasMore && " End of history."}
                </p>
              )}
              {pageError && (
                <p className={styles.error}>
                  {pageError} Loaded transactions are retained.
                </p>
              )}
            </div>
            {page?.hasMore && (
              <button onClick={loadMore} disabled={more || loading}>
                {more
                  ? "Loading…"
                  : pageError
                    ? "Retry Load More"
                    : "Load More"}
              </button>
            )}
          </section>
          <div className={styles.grid}>
            <SimulationForm
              operation="deposit"
              account={{
                ...account,
                capability: {
                  ...account.capability,
                  deposit: account.capability.deposit && !error && !loading,
                },
              }}
              refreshed={async () => {
                setLoading(true);
                await load();
              }}
            />
            <SimulationForm
              operation="withdrawal"
              account={{
                ...account,
                capability: {
                  ...account.capability,
                  withdrawal:
                    account.capability.withdrawal && !error && !loading,
                },
              }}
              refreshed={async () => {
                setLoading(true);
                await load();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
