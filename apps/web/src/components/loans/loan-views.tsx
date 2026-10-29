"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { gbp, riskLabel } from "@/lib/dashboard-display";
import type {
  Eligibility,
  LoanApplication,
  Loan,
  Installment,
  Repayment,
  Review,
  LoanPage,
} from "@/lib/loan-contract";
import styles from "@/components/dashboard/dashboard.module.css";
import loanStyles from "./loans.module.css";
const notice =
  "Recorded amounts and processing status do not establish disbursement or collected money. Historical provenance is unknown; settlement is unverified.";
const date = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC" });
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Loan information unavailable.";
function useRead<T>(path: string) {
  const { session } = useDashboard();
  const [state, setState] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  const generation = useRef(0);
  const load = useCallback(() => {
    const revision = ++generation.current;
    setState((previous) => ({ ...previous, loading: true, error: undefined }));
    void session
      .request<T>(path)
      .then((data) => {
        if (revision === generation.current) setState({ data, loading: false });
      })
      .catch((e) => {
        if (revision === generation.current)
          setState((previous) => ({
            ...previous,
            error: message(e),
            loading: false,
          }));
      });
  }, [path, session]);
  useEffect(() => {
    let active = true;
    const counter = generation;
    queueMicrotask(() => {
      if (active) load();
    });
    return () => {
      active = false;
      counter.current++;
    };
  }, [load]);
  return { ...state, load };
}
function ReadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: string;
  retry: () => void;
}) {
  return (
    <>
      {loading && <p role="status">Loading loan information…</p>}
      {error && (
        <div role="alert" className={styles.error}>
          <p>{error} Previously loaded information may be out of date.</p>
          <button onClick={retry} disabled={loading}>
            Retry loan information
          </button>
        </div>
      )}
    </>
  );
}
function Paged<T extends { id: string }>({
  path,
  title,
  children,
}: {
  path: string;
  title: string;
  children: (items: T[]) => ReactNode;
}) {
  const { session } = useDashboard();
  const { data, loading, error, load } = useRead<LoanPage<T>>(path);
  const [continued, setContinued] = useState<LoanPage<T> | null>(null);
  const [pageError, setPageError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const revision = useRef(0);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const counter = revision;
    counter.current++;
    return () => {
      counter.current++;
    };
  }, [path, data]);
  const current = continued ?? data;
  async function more() {
    if (!current?.nextCursor || inFlight.current || loading) return;
    const version = revision.current;
    inFlight.current = true;
    setBusy(true);
    setPageError("");
    try {
      const next = await session.request<LoanPage<T>>(
        path +
          (path.includes("?") ? "&" : "?") +
          "cursor=" +
          encodeURIComponent(current.nextCursor),
      );
      if (revision.current !== version) return;
      setContinued({
        ...next,
        items: [
          ...new Map(
            [...current.items, ...next.items].map((row) => [row.id, row]),
          ).values(),
        ],
      });
      region.current?.focus();
    } catch (e) {
      if (revision.current === version) setPageError(message(e));
    } finally {
      inFlight.current = false;
      if (revision.current === version) setBusy(false);
    }
  }
  return (
    <section className={styles.panel} aria-label={title}>
      <h2>{title}</h2>
      <ReadState
        loading={loading}
        error={error}
        retry={() => {
          setContinued(null);
          setPageError("");
          load();
        }}
      />
      <div
        role="region"
        ref={region}
        tabIndex={-1}
        aria-label={title + " loaded records"}
      >
        {current &&
          (current.items.length ? (
            children(current.items)
          ) : (
            <p>No recorded entries.</p>
          ))}
      </div>
      <p role="status">
        {current
          ? `${current.items.length} records loaded.${!current.hasMore ? " End of records." : ""}`
          : ""}
        {busy && " Loading more…"}
      </p>
      {pageError && (
        <p role="alert">{pageError} Loaded records are retained.</p>
      )}
      {current?.hasMore && (
        <button onClick={more} disabled={busy || loading}>
          {pageError ? "Retry Load More" : "Load More"}
        </button>
      )}
    </section>
  );
}
function ApplicationRows({ items }: { items: LoanApplication[] }) {
  return (
    <ul className={styles.activity}>
      {items.map((row) => (
        <li key={row.id}>
          <Link
            href={`/dashboard/loans/applications/${encodeURIComponent(row.id)}`}
          >
            Application from {date(row.applicationDate)}
          </Link>
          <p>
            {gbp(row.requestedAmount)} · {row.requestedTermMonths} months ·
            Recorded status: {row.applicationStatus}
          </p>
        </li>
      ))}
    </ul>
  );
}
export function LoanHome() {
  const read = useRead<Eligibility>("/loans/eligibility");
  return (
    <>
      <section className={styles.panel}>
        <h2>Loans and applications</h2>
        <p className={styles.notice}>{notice}</p>
        <Link href="/dashboard/loans/apply">Loan application</Link>
        <ReadState
          loading={read.loading}
          error={read.error}
          retry={read.load}
        />
        {read.data?.reviewer && (
          <p>
            <Link href="/dashboard/loan-review">
              Loan application review queue
            </Link>
          </p>
        )}
      </section>
      <Paged<LoanApplication>
        path="/loans/applications"
        title="My loan applications"
      >
        {(items) => <ApplicationRows items={items} />}
      </Paged>
      <Paged<Loan> path="/loans/mine" title="My recorded loans">
        {(items) => (
          <ul className={styles.activity}>
            {items.map((row) => (
              <li key={row.id}>
                <Link href={`/dashboard/loans/${encodeURIComponent(row.id)}`}>
                  Loan from {date(row.approvalDate)}
                </Link>
                <p>
                  Principal: {gbp(row.principalAmount)} · Recorded status:{" "}
                  {row.loanStatus}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Paged>
    </>
  );
}
export function LoanApply() {
  const read = useRead<Eligibility>("/loans/eligibility");
  return (
    <section className={styles.panel}>
      <h2>Loan application</h2>
      <ReadState loading={read.loading} error={read.error} retry={read.load} />
      {read.data && (
        <>
          <dl>
            <dt>Savings Points</dt>
            <dd>{read.data.savingsPointsTotal.toLocaleString("en-GB")}</dd>
            <dt>Current risk band</dt>
            <dd>{riskLabel(read.data.currentRiskBand)}</dd>
            <dt>Membership</dt>
            <dd>{read.data.membershipStatus}</dd>
          </dl>
          <p>
            Points are not cash. These stored facts do not establish loan
            eligibility.
          </p>
          <p>{read.data.applicationCapability.message}</p>
        </>
      )}
      <p id="loan-cap-notice">
        The points multiple and maximum borrowing policy have not been approved.
        The amount cap is unavailable. No application will be submitted.
      </p>
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset
          disabled
          className={styles.form}
          aria-describedby="loan-cap-notice"
        >
          <legend>Application details — unavailable</legend>
          <label htmlFor="loan-slider">Requested amount slider (GBP)</label>
          <input
            id="loan-slider"
            type="range"
            min="0"
            max="0"
            value="0"
            readOnly
            aria-valuetext="Cap unavailable"
          />
          <label htmlFor="loan-amount">
            Requested amount (GBP, exact decimal)
          </label>
          <input
            id="loan-amount"
            inputMode="decimal"
            placeholder="Cap unavailable"
          />
          <label htmlFor="loan-purpose">Purpose</label>
          <textarea id="loan-purpose" maxLength={500} rows={4} />
          <button disabled>Submit loan application</button>
        </fieldset>
      </form>
    </section>
  );
}
export function LoanStatus({ applicationId }: { applicationId: string }) {
  const read = useRead<LoanApplication>(
    `/loans/applications/${encodeURIComponent(applicationId)}`,
  );
  return (
    <section className={styles.panel}>
      <h2>Application status</h2>
      <ReadState loading={read.loading} error={read.error} retry={read.load} />
      {read.data && (
        <>
          <p>Recorded status: {read.data.applicationStatus}</p>
          <dl>
            <dt>Requested amount</dt>
            <dd>{gbp(read.data.requestedAmount)}</dd>
            <dt>Term</dt>
            <dd>{read.data.requestedTermMonths} months</dd>
            <dt>Purpose</dt>
            <dd className={loanStyles.wrap}>{read.data.loanPurpose}</dd>
            <dt>Application-time points</dt>
            <dd>{read.data.savingsPointsAtApplication ?? "Unavailable"}</dd>
            <dt>Application-time risk band</dt>
            <dd>
              {read.data.riskBandAtApplication
                ? riskLabel(read.data.riskBandAtApplication)
                : "Unavailable"}
            </dd>
          </dl>
          {read.data.loanId && (
            <Link
              href={`/dashboard/loans/${encodeURIComponent(read.data.loanId)}`}
            >
              View recorded loan
            </Link>
          )}
          <p>{notice}</p>
        </>
      )}
    </section>
  );
}
export function LoanDetail({ loanId }: { loanId: string }) {
  const base = `/loans/${encodeURIComponent(loanId)}`;
  const read = useRead<Loan>(base);
  return (
    <>
      <section className={styles.panel}>
        <h2>Loan detail</h2>
        <ReadState
          loading={read.loading}
          error={read.error}
          retry={read.load}
        />
        {read.data && (
          <>
            <h3>Recorded principal</h3>
            <p className={styles.value}>{gbp(read.data.principalAmount)}</p>
            <p>
              Recorded status: {read.data.loanStatus} · {read.data.termMonths}{" "}
              months
            </p>
            <p className={styles.notice}>{notice}</p>
          </>
        )}
      </section>
      {read.data && (
        <>
          <Paged<Installment>
            path={base + "/schedule"}
            title="Repayment schedule"
          >
            {(items) => (
              <div
                className={loanStyles.table}
                tabIndex={0}
                role="region"
                aria-label="Scrollable repayment schedule"
              >
                <table>
                  <caption>
                    Recorded installment amounts — settlement unverified
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Installment",
                        "Due date",
                        "Principal",
                        "Interest",
                        "Total due",
                        "Recorded paid",
                        "Status",
                      ].map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">{row.installmentNumber}</th>
                        <td>{date(row.dueDate)}</td>
                        <td>{gbp(row.principalDue)}</td>
                        <td>{gbp(row.interestDue)}</td>
                        <td>{gbp(row.totalDue)}</td>
                        <td>{gbp(row.totalPaid)}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Paged>
          <section className={styles.panel}>
            <h2>Repayment form</h2>
            <p id="repayment-disabled">
              {read.data.repaymentCapability?.message} No money will be
              collected. Repayment execution, including simulation, is disabled.
            </p>
            <form onSubmit={(event) => event.preventDefault()}>
              <fieldset
                disabled
                className={styles.form}
                aria-describedby="repayment-disabled"
              >
                <legend>Repayment details — unavailable</legend>
                <label htmlFor="repayment-amount">
                  Amount (GBP, exact decimal)
                </label>
                <input id="repayment-amount" inputMode="decimal" />
                <button disabled>Submit repayment</button>
              </fieldset>
            </form>
          </section>
          <Paged<Repayment>
            path={base + "/repayments"}
            title="Repayment history"
          >
            {(items) => (
              <ul className={styles.activity}>
                {items.map((row) => (
                  <li key={row.id}>
                    <strong>{gbp(row.amountPaid)}</strong>
                    <p>
                      {date(row.paymentDate)} · Recorded processing status:{" "}
                      {row.paymentStatus}
                    </p>
                    <p>
                      Historical repayment — unknown provenance; settlement
                      unverified.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Paged>
        </>
      )}
    </>
  );
}
export function LoanReview() {
  return (
    <>
      <section className={styles.panel}>
        <h2>Loan application review queue</h2>
        <p>
          Read-only review for authorized Staff and Admin. Approval and
          disbursement are disabled.
        </p>
      </section>
      <Paged<Review>
        path="/loans/admin/queue"
        title="Applications awaiting review"
      >
        {(items) => (
          <ul className={styles.activity}>
            {items.map((row) => (
              <li key={row.id}>
                <h3>Application from {date(row.applicationDate)}</h3>
                <p>
                  {gbp(row.requestedAmount)} · {row.requestedTermMonths} months
                  · {row.applicationStatus}
                </p>
                <p className={loanStyles.wrap}>Purpose: {row.loanPurpose}</p>
                <dl>
                  <dt>Application-time points</dt>
                  <dd>{row.savingsPointsAtApplication ?? "Unavailable"}</dd>
                  <dt>Application-time risk band</dt>
                  <dd>
                    {row.riskBandAtApplication
                      ? riskLabel(row.riskBandAtApplication)
                      : "Unavailable"}
                  </dd>
                  <dt>Application-time score</dt>
                  <dd>{row.behaviouralScoreAtApplication ?? "Unavailable"}</dd>
                  <dt>Application-time repayment probability</dt>
                  <dd>{row.predictedRepaymentProbability ?? "Unavailable"}</dd>
                </dl>
                <p>{row.snapshotContext}</p>
              </li>
            ))}
          </ul>
        )}
      </Paged>
    </>
  );
}
