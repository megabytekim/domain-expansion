"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  role: "user" | "agent";
  text: string;
}

const API_BASE = process.env.NEXT_PUBLIC_HYECHO_API || "http://localhost:9999";
const STORAGE_KEY = "hyecho-master-ctx";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
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
          {/* 모바일: 트로피(인기순) 바로 아래, 같은 스타일 */}
          <div
            className="md:hidden absolute z-10"
            style={{
              top: "184px",
              right: "12px",
              padding: "3px",
              borderRadius: "16px",
              background: "conic-gradient(from 0deg, #6b46c1, #d97706, #f59e0b, #6b46c1)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.28)",
            }}
          >
            <button
              onClick={() => setOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl"
              style={{
                width: "80px",
                height: "80px",
                background: "rgba(255,255,255,0.97)",
                backdropFilter: "blur(8px)",
              }}
              aria-label="혜초대사 열기"
            >
              <span style={{ fontSize: "30px", lineHeight: 1 }}>🧘</span>
              <span className="text-sm font-semibold text-gray-700 mt-1">혜초대사</span>
            </button>
          </div>

          {/* 데스크탑: 좌하단 floating button */}
          <button
            onClick={() => setOpen(true)}
            className="hidden md:flex absolute bottom-4 left-4 z-10 items-center gap-3 px-6 py-3.5 rounded-full shadow-2xl backdrop-blur-sm transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, rgba(107,70,193,0.9), rgba(146,64,14,0.9))",
              color: "#fef3c7",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
            aria-label="혜초대사 열기"
          >
            <span style={{ fontSize: "28px", lineHeight: 1 }}>🧘</span>
            <span className="text-base font-medium">혜초대사에게 묻기</span>
          </button>
        </>
      )}

      {/* 채팅창 — 열린 상태 */}
      {open && (
        <>
          {/* 데스크탑: 좌하단 패널 */}
          <div
            className="hidden md:flex absolute bottom-3 left-3 z-20 flex-col rounded-xl shadow-2xl"
            style={{
              width: "360px",
              height: "min(520px, calc(100dvh - 80px))",
              background: "rgba(15,23,42,0.95)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <ChatPanel
              messages={messages}
              input={input}
              setInput={setInput}
              send={send}
              sending={sending}
              handleKey={handleKey}
              onClose={() => setOpen(false)}
              scrollRef={scrollRef}
              inputRef={inputRef}
            />
          </div>

          {/* 모바일: 하단 절반 정도의 바텀 패널 — 위쪽 지도/트로피/필터는 그대로 보이게 */}
          <div
            className="md:hidden absolute z-30 flex flex-col rounded-t-2xl shadow-2xl"
            style={{
              left: 0,
              right: 0,
              bottom: 0,
              height: "60dvh",
              maxHeight: "calc(100dvh - 120px)",
              background: "rgba(15,23,42,0.97)",
              backdropFilter: "blur(12px)",
              borderTop: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <ChatPanel
              messages={messages}
              input={input}
              setInput={setInput}
              send={send}
              sending={sending}
              handleKey={handleKey}
              onClose={() => setOpen(false)}
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "22px", lineHeight: 1 }}>🧘</span>
          <div>
            <p className="text-sm font-semibold text-amber-100 leading-tight">혜초대사</p>
            <p className="text-xs text-gray-500 leading-tight">길의 이야기를 들려주는 구도자</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xl leading-none px-2"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && (
          <div className="text-center text-xs text-gray-500 mt-6 leading-relaxed">
            <p className="text-amber-100/70">&ldquo;자네, 길을 물으러 왔는가.&rdquo;</p>
            <p className="mt-3">여행지·장소·길에 대해 무엇이든 물어보게.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className="px-3 py-2 rounded-2xl text-sm max-w-[85%] whitespace-pre-wrap leading-relaxed"
              style={
                m.role === "user"
                  ? { background: "rgba(59,130,246,0.22)", color: "#dbeafe" }
                  : { background: "rgba(255,255,255,0.06)", color: "#e2e8f0" }
              }
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl text-sm" style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}>
              <span className="opacity-70">바람을 듣는 중…</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 rounded-full px-3 py-2" style={{ background: "rgba(255,255,255,0.05)" }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="길에 대해 묻기…"
            disabled={sending}
            className="flex-1 bg-transparent outline-none text-gray-100 placeholder-gray-500 disabled:opacity-50"
            style={{ fontSize: "16px" }}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="text-sm text-amber-200 disabled:text-gray-600 px-2"
            aria-label="보내기"
          >
            보내기
          </button>
        </div>
      </div>
    </>
  );
}
