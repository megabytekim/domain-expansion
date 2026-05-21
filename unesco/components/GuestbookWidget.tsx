"use client";

import { useState, useEffect, useRef } from "react";

interface Entry {
  message: string;
  ts: number;
}

interface GuestbookWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_HYECHO_API || "http://localhost:9999";
const MAX_LEN = 280;

function formatTs(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

export default function GuestbookWidget({ open, onOpenChange }: GuestbookWidgetProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [postErrorMsg, setPostErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 첫 로드: GET
  const loadEntries = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`${API_BASE}/api/guestbook`);
      if (!res.ok) throw new Error(String(res.status));
      const data: Entry[] = await res.json();
      setEntries(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadEntries(); }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = async () => {
    const message = input.trim();
    if (!message || sending) return;
    if (message.length > MAX_LEN) {
      setPostErrorMsg("한 줄로, 280자 이내로 남겨주시게");
      return;
    }
    setSending(true);
    setPostErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/guestbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (res.status === 201) {
        const entry: Entry = await res.json();
        setEntries((prev) => [entry, ...prev]);
        setInput("");
      } else if (res.status === 429) {
        setPostErrorMsg("잠시 후 다시 와주시게");
      } else if (res.status === 400) {
        setPostErrorMsg("한 줄로, 280자 이내로 남겨주시게");
      } else {
        setPostErrorMsg("지금은 기록을 새길 수 없네…");
      }
    } catch {
      setPostErrorMsg("지금은 기록을 새길 수 없네…");
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      {/* 트리거 (닫힌 상태) */}
      {!open && (
        <>
          {/* 모바일: 혜초대사 책갈피 아래 */}
          <div
            className="md:hidden absolute z-10"
            style={{
              top: "298px",
              right: "12px",
              padding: "2px",
              borderRadius: "4px",
              background: "linear-gradient(180deg, rgba(20,19,28,0.95), rgba(20,19,28,0.7))",
              boxShadow: "0 6px 22px rgba(0,0,0,0.45)",
            }}
          >
            <button
              onClick={() => onOpenChange(true)}
              className="flex flex-col items-center justify-center gap-0.5"
              style={{
                width: "80px",
                height: "80px",
                background: "var(--paper-100)",
                borderRadius: "3px",
              }}
              aria-label="방명록 열기"
            >
              <span className="serif-kr" style={{ fontSize: "28px", lineHeight: 1, color: "var(--ink-deep)", fontWeight: 700 }}>言</span>
              <span className="text-[10px] mt-1 tracking-[0.25em]" style={{ color: "var(--ink-deep)" }}>방명록</span>
            </button>
          </div>

          {/* 데스크탑: 혜초대사 트리거 우측 */}
          <button
            onClick={() => onOpenChange(true)}
            className="hidden md:flex absolute bottom-5 z-10 items-center gap-3 px-6 py-3.5 transition-all hover:translate-x-1"
            style={{
              left: "268px",
              background: "var(--paper-100)",
              color: "var(--ink-deep)",
              borderRadius: "3px",
              boxShadow: "0 8px 28px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(20,19,28,0.08)",
              borderLeft: "4px solid var(--vermillion)",
            }}
            aria-label="방명록 열기"
          >
            <span className="serif-kr font-bold" style={{ fontSize: "26px", lineHeight: 1 }}>言</span>
            <span className="flex flex-col items-start leading-tight">
              <span className="display-italic text-[11px] tracking-[0.2em] uppercase" style={{ color: "var(--paper-700)" }}>Leave a Trace</span>
              <span className="serif-kr text-base font-semibold">방명록</span>
            </span>
          </button>
        </>
      )}

      {/* Panel (열린 상태) */}
      {open && (
        <>
          {/* 데스크탑: 우하단 */}
          <div
            className="hidden md:flex absolute bottom-3 right-3 z-20 flex-col rounded-md shadow-2xl scroll-edge paper-grain"
            style={{
              width: "380px",
              height: "min(540px, calc(100dvh - 80px))",
              background: "rgba(31,29,42,0.97)",
              backdropFilter: "blur(12px)",
              borderLeft: "3px solid var(--vermillion)",
            }}
          >
            <Panel {...{ entries, input, setInput, submit, sending, loading, loadError, postErrorMsg, handleKey, onClose: () => onOpenChange(false), inputRef, retry: loadEntries }} />
          </div>

          {/* 모바일: 하단 시트 */}
          <div
            className="md:hidden absolute z-30 flex flex-col shadow-2xl paper-grain"
            style={{
              left: 0,
              right: 0,
              bottom: 0,
              height: "55dvh",
              maxHeight: "calc(100dvh - 160px)",
              background: "rgba(31,29,42,0.97)",
              backdropFilter: "blur(12px)",
              borderTop: "3px solid var(--vermillion)",
              borderTopLeftRadius: "6px",
              borderTopRightRadius: "6px",
            }}
          >
            <Panel {...{ entries, input, setInput, submit, sending, loading, loadError, postErrorMsg, handleKey, onClose: () => onOpenChange(false), inputRef, retry: loadEntries }} />
          </div>
        </>
      )}
    </>
  );
}

interface PanelProps {
  entries: Entry[];
  input: string;
  setInput: (s: string) => void;
  submit: () => void;
  sending: boolean;
  loading: boolean;
  loadError: boolean;
  postErrorMsg: string | null;
  handleKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  retry: () => void;
}

function Panel({ entries, input, setInput, submit, sending, loading, loadError, postErrorMsg, handleKey, onClose, inputRef, retry }: PanelProps) {
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b shrink-0" style={{ borderColor: "var(--ink-border)" }}>
        <div className="flex items-center gap-3">
          <span className="serif-kr" style={{ fontSize: "24px", lineHeight: 1, color: "var(--vermillion)", fontWeight: 700 }}>言</span>
          <div className="leading-tight">
            <p className="serif-kr text-base font-semibold" style={{ color: "var(--paper-100)" }}>방명록</p>
            <p className="display-italic text-[11px] tracking-wider" style={{ color: "var(--paper-500)" }}>길벗들의 발자취</p>
          </div>
        </div>
        <button onClick={onClose} className="text-xl leading-none px-2" style={{ color: "var(--paper-500)" }} aria-label="닫기">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading && (
          <p className="display-italic text-center mt-6" style={{ color: "var(--paper-500)" }}>
            발자취를 읽어오는 중…
          </p>
        )}
        {!loading && loadError && (
          <div className="text-center mt-6">
            <p className="serif-kr" style={{ color: "var(--paper-100)" }}>발자취를 읽어올 수 없네…</p>
            <button onClick={retry} className="display-italic text-xs mt-3 underline" style={{ color: "var(--vermillion)" }}>다시 시도</button>
          </div>
        )}
        {!loading && !loadError && entries.length === 0 && (
          <p className="display-italic text-center mt-6 leading-relaxed" style={{ color: "var(--paper-500)" }}>
            아직 발자취가 없네.<br />첫 글을 남겨보게.
          </p>
        )}
        {!loading && !loadError && entries.map((e) => (
          <div
            key={e.ts}
            className="px-3 py-2 serif-kr leading-relaxed text-sm whitespace-pre-wrap"
            style={{
              background: "rgba(244,236,216,0.04)",
              color: "var(--paper-100)",
              borderLeft: "2px solid rgba(244,236,216,0.18)",
              borderRadius: "2px",
            }}
          >
            <p>{e.message}</p>
            <p className="display-italic text-[11px] mt-1.5 tracking-wider tabular-nums" style={{ color: "var(--vermillion)" }}>
              {formatTs(e.ts)}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t px-4 py-3 shrink-0" style={{ borderColor: "var(--ink-border)" }}>
        {postErrorMsg && (
          <p className="serif-kr text-xs mb-2" style={{ color: "var(--vermillion)" }}>{postErrorMsg}</p>
        )}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(244,236,216,0.05)", borderRadius: "2px", border: "1px solid rgba(244,236,216,0.1)" }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="한 줄 남기기…"
            disabled={sending}
            maxLength={MAX_LEN}
            className="flex-1 bg-transparent outline-none serif-kr disabled:opacity-50"
            style={{ fontSize: "16px", color: "var(--paper-100)" }}
          />
          <button
            onClick={submit}
            disabled={sending || !input.trim()}
            className="serif-kr text-sm tracking-wider disabled:opacity-30 px-2"
            style={{ color: "var(--vermillion)" }}
            aria-label="새김"
          >
            새김
          </button>
        </div>
      </div>
    </>
  );
}
