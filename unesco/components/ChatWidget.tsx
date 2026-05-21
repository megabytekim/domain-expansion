"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  role: "user" | "agent";
  text: string;
}

const API_BASE = process.env.NEXT_PUBLIC_HYECHO_API || "http://localhost:9999";
const STORAGE_KEY = "hyecho-master-ctx";

interface ChatWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChatWidget({ open, onOpenChange }: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ctxId, setCtxId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = "ctx-" + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(STORAGE_KEY, id);
    }
    setCtxId(id);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, ctx_id: ctxId }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "agent", text: data.reply || "(답이 흩어졌네…)" }]);
    } catch {
      setMessages((m) => [...m, { role: "agent", text: "(길에 바람이 거세어 답을 전하지 못하겠네…)" }]);
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* 트리거 — 닫힌 상태 */}
      {!open && (
        <>
          {/* 모바일: 트로피(인기순) 바로 아래, 같은 두루마리 스타일 */}
          <div
            className="md:hidden absolute z-10"
            style={{
              top: "204px",
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
              aria-label="혜초대사 열기"
            >
              <span className="serif-kr" style={{ fontSize: "28px", lineHeight: 1, color: "var(--ink-deep)", fontWeight: 700 }}>師</span>
              <span className="text-[10px] mt-1 tracking-[0.25em]" style={{ color: "var(--ink-deep)" }}>혜초대사</span>
            </button>
          </div>

          {/* 데스크탑: 좌하단 — 두루마리 책갈피 형태 (좀 더 큼) */}
          <button
            onClick={() => onOpenChange(true)}
            className="hidden md:flex absolute bottom-5 left-5 z-10 items-center gap-4 px-8 py-5 transition-all hover:translate-x-1"
            style={{
              background: "var(--paper-100)",
              color: "var(--ink-deep)",
              borderRadius: "3px",
              boxShadow: "0 10px 32px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(20,19,28,0.08)",
              borderLeft: "5px solid var(--vermillion)",
            }}
            aria-label="혜초대사 열기"
          >
            <span className="serif-kr font-bold" style={{ fontSize: "34px", lineHeight: 1 }}>師</span>
            <span className="flex flex-col items-start leading-tight gap-0.5">
              <span className="display-italic text-xs tracking-[0.22em] uppercase" style={{ color: "var(--paper-700)" }}>Ask the Master</span>
              <span className="serif-kr text-lg font-semibold">혜초대사에게 묻기</span>
            </span>
          </button>
        </>
      )}

      {/* 채팅창 — 열린 상태 */}
      {open && (
        <>
          {/* 데스크탑: 좌하단 패널 */}
          <div
            className="hidden md:flex absolute bottom-3 left-3 z-20 flex-col rounded-md shadow-2xl scroll-edge paper-grain"
            style={{
              width: "380px",
              height: "min(540px, calc(100dvh - 80px))",
              background: "rgba(31,29,42,0.97)",
              backdropFilter: "blur(12px)",
              borderLeft: "3px solid var(--vermillion)",
            }}
          >
            <ChatPanel
              messages={messages}
              input={input}
              setInput={setInput}
              send={send}
              sending={sending}
              handleKey={handleKey}
              onClose={() => onOpenChange(false)}
              scrollRef={scrollRef}
              inputRef={inputRef}
            />
          </div>

          {/* 모바일: 하단 절반 정도의 바텀 패널 */}
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
            <ChatPanel
              messages={messages}
              input={input}
              setInput={setInput}
              send={send}
              sending={sending}
              handleKey={handleKey}
              onClose={() => onOpenChange(false)}
              scrollRef={scrollRef}
              inputRef={inputRef}
            />
          </div>
        </>
      )}
    </>
  );
}

interface ChatPanelProps {
  messages: Message[];
  input: string;
  setInput: (s: string) => void;
  send: () => void;
  sending: boolean;
  handleKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onClose: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function ChatPanel({ messages, input, setInput, send, sending, handleKey, onClose, scrollRef, inputRef }: ChatPanelProps) {
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b shrink-0" style={{ borderColor: "var(--ink-border)" }}>
        <div className="flex items-center gap-3">
          <span className="serif-kr" style={{ fontSize: "24px", lineHeight: 1, color: "var(--vermillion)", fontWeight: 700 }}>慧超</span>
          <div className="leading-tight">
            <p className="serif-kr text-base font-semibold" style={{ color: "var(--paper-100)" }}>혜초대사</p>
            <p className="display-italic text-[11px] tracking-wider" style={{ color: "var(--paper-500)" }}>길의 이야기를 들려주는 구도자</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-xl leading-none px-2 transition-colors"
          style={{ color: "var(--paper-500)" }}
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center mt-6 leading-relaxed">
            <p className="serif-kr text-base" style={{ color: "var(--paper-100)" }}>&ldquo;자네, 길을 물으러 왔는가.&rdquo;</p>
            <p className="display-italic text-[11px] mt-3 tracking-wider" style={{ color: "var(--paper-500)" }}>여행지 · 장소 · 길에 대해 무엇이든 물어보게.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className="px-3 py-2 text-sm max-w-[88%] whitespace-pre-wrap leading-relaxed serif-kr"
              style={
                m.role === "user"
                  ? {
                      background: "rgba(192,57,43,0.18)",
                      color: "var(--paper-100)",
                      borderLeft: "2px solid var(--vermillion)",
                      borderRadius: "2px",
                    }
                  : {
                      background: "rgba(244,236,216,0.04)",
                      color: "var(--paper-100)",
                      borderLeft: "2px solid rgba(244,236,216,0.18)",
                      borderRadius: "2px",
                    }
              }
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-3 py-2 text-sm display-italic" style={{ background: "rgba(244,236,216,0.04)", color: "var(--paper-500)", borderRadius: "2px" }}>
              바람을 듣는 중…
            </div>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-3 shrink-0" style={{ borderColor: "var(--ink-border)" }}>
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(244,236,216,0.05)", borderRadius: "2px", border: "1px solid rgba(244,236,216,0.1)" }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="길에 대해 묻기…"
            disabled={sending}
            className="flex-1 bg-transparent outline-none disabled:opacity-50 serif-kr"
            style={{ fontSize: "16px", color: "var(--paper-100)" }}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="serif-kr text-sm tracking-wider disabled:opacity-30 px-2"
            style={{ color: "var(--vermillion)" }}
            aria-label="보내기"
          >
            보내기
          </button>
        </div>
      </div>
    </>
  );
}
