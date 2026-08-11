import { useEffect, useRef, useState } from "react";
import {
  linkPermissionAccount,
  searchAccountCandidates,
} from "./api.ts";
import type { AccountCandidate, DirectoryPerson } from "./types.ts";

const accountStatusLabel: Record<DirectoryPerson["account_status"], string> = {
  linked: "Đã nối tài khoản",
  unlinked: "Chưa nối tài khoản",
  inactive: "Tài khoản không hoạt động",
};

function candidateLabel(candidate: AccountCandidate): string {
  const department = candidate.department?.toUpperCase() || "chưa có bộ phận";
  return `${candidate.full_name} · ${candidate.email} · ${candidate.role} · ${department}`;
}

function candidateStatus(candidate: AccountCandidate): string {
  const status: string[] = [];
  if (!candidate.is_active) status.push("tài khoản không hoạt động");
  if (candidate.linked_person_id !== null) status.push("đã nối người khác");
  return status.join(" · ") || "đang hoạt động";
}

export function AccountCandidateOption({ candidate }: { candidate: AccountCandidate }) {
  return (
    <option value={candidate.user_id}
      disabled={!candidate.is_active || candidate.linked_person_id !== null}>
      {candidateLabel(candidate)} · {candidateStatus(candidate)}
    </option>
  );
}

export async function completeAccountLinkMutation({
  targetPersonId,
  mutate,
  getCurrentPersonId,
  onLinked,
}: {
  targetPersonId: string;
  mutate: () => Promise<unknown>;
  getCurrentPersonId: () => string | null;
  onLinked: (personId: string) => void;
}): Promise<{ showResult: boolean }> {
  await mutate();
  onLinked(targetPersonId);
  return { showResult: getCurrentPersonId() === targetPersonId };
}

export default function AccountLinkPanel({
  person,
  canManageAccounts,
  onLinked,
}: {
  person: DirectoryPerson | null;
  canManageAccounts: boolean;
  onLinked: (personId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<AccountCandidate[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const requestSequence = useRef(0);
  const currentPersonId = useRef<string | null>(person?.person_id ?? null);
  currentPersonId.current = person?.person_id ?? null;

  useEffect(() => {
    requestSequence.current += 1;
    setQuery("");
    setCandidates([]);
    setSelectedUserId("");
    setReason("");
    setLoading(false);
    setSaving(false);
    setMessage("");
  }, [person?.person_id]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    if (!person || person.user_id || query.trim().length < 2) {
      setCandidates([]);
      setSelectedUserId("");
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const nextCandidates = await searchAccountCandidates(query.trim());
        if (sequence === requestSequence.current) {
          setCandidates(nextCandidates);
          setSelectedUserId("");
          setMessage("");
        }
      } catch (error) {
        if (sequence === requestSequence.current) setMessage((error as Error).message);
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [person, query, refreshNonce]);

  if (!canManageAccounts || !person) return null;

  const link = async (userId: string | null) => {
    if (!reason.trim()) return;
    const targetPerson = person;
    setSaving(true);
    setMessage("");
    try {
      const completion = await completeAccountLinkMutation({
        targetPersonId: targetPerson.person_id,
        mutate: () => linkPermissionAccount(
          targetPerson.person_id, userId, reason.trim(), targetPerson.version,
        ),
        getCurrentPersonId: () => currentPersonId.current,
        onLinked,
      });
      if (completion.showResult) {
        setReason("");
        setQuery("");
        setCandidates([]);
        setSelectedUserId("");
        setMessage(userId ? "Đã nối tài khoản. Đang tải lại hồ sơ…" : "Đã gỡ nối tài khoản. Đang tải lại hồ sơ…");
      }
    } catch (error) {
      if (currentPersonId.current === targetPerson.person_id) setMessage((error as Error).message);
    } finally {
      if (currentPersonId.current === targetPerson.person_id) setSaving(false);
    }
  };

  return (
    <section className="ip-panel" aria-labelledby="ip-account-link-title">
      <h3 id="ip-account-link-title">Nối tài khoản</h3>
      <p className="ip-help">
        Trạng thái: <b>{accountStatusLabel[person.account_status]}</b>. Liên kết dùng mã hồ sơ cố định, không dùng tên hoặc email làm khóa.
      </p>
      <div className="ip-selected"><b>{person.full_name}</b><span>{person.person_id}</span></div>
      {person.user_id ? (
        <>
          <label>Lý do gỡ nối
            <input className="pq-o" aria-label="Lý do gỡ nối tài khoản" value={reason}
              onChange={(event) => setReason(event.target.value)} />
          </label>
          <button type="button" className="pq-nut" disabled={!reason.trim() || saving}
            onClick={() => link(null)}>
            {saving ? "Đang gỡ nối…" : "Gỡ nối tài khoản"}
          </button>
        </>
      ) : (
        <>
          <label>Tìm tài khoản để nối
            <input className="pq-o" aria-label="Tìm tài khoản để nối" value={query}
              onChange={(event) => setQuery(event.target.value)} placeholder="Tên hoặc email" />
          </label>
          <button type="button" className="pq-nut" disabled={loading || query.trim().length < 2}
            onClick={() => setRefreshNonce((value) => value + 1)}>
            {loading ? "Đang tìm…" : "Tải lại tài khoản"}
          </button>
          <label>Tài khoản sẽ nối
            <select className="pq-o" aria-label="Tài khoản sẽ nối" value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}>
              <option value="">{query.trim().length < 2 ? "Nhập ít nhất 2 ký tự để tìm" : "Chọn tài khoản"}</option>
              {candidates.map((candidate) => (
                <AccountCandidateOption key={candidate.user_id} candidate={candidate} />
              ))}
            </select>
          </label>
          <label>Lý do nối tài khoản
            <input className="pq-o" aria-label="Lý do nối tài khoản" value={reason}
              onChange={(event) => setReason(event.target.value)} />
          </label>
          <button type="button" className="pq-nut la-chinh"
            disabled={!selectedUserId || !reason.trim() || saving}
            onClick={() => link(selectedUserId)}>
            {saving ? "Đang nối…" : "Nối tài khoản"}
          </button>
        </>
      )}
      {message && <div className="ip-message" role="status">{message}</div>}
    </section>
  );
}
