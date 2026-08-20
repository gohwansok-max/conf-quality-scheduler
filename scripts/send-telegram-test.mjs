const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.argv[2];

if (!token || !chatId) {
  throw new Error("봇 토큰과 그룹 채팅 ID가 필요합니다.");
}

const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: chatId,
    text: "[코엔에프 자가품질검사] 텔레그램 알림봇 연결 시험이 정상 완료되었습니다.",
  }),
  signal: AbortSignal.timeout(15000),
});
const payload = await response.json();

if (!response.ok || !payload.ok) {
  throw new Error("텔레그램 시험 알림 발송에 실패했습니다.");
}

console.log(JSON.stringify({ ok: true, messageId: payload.result?.message_id }));
