# 코엔에프 자가품질검사 스케줄러

자가품질검사 일정, 제품별 제조일, 검사성적서, 보건증 만료일과 텔레그램 알림을 통합 관리하는 웹 애플리케이션입니다.

## 주요 기능

- 식품유형·제품별 검사 마감일 자동 계산
- 기간 초과·만료 임박 텔레그램 자동 알림
- 검사성적서 업로드, 다운로드, 공유 및 백업
- 보건증 담당자, 만료일, PDF와 갱신 알림 관리
- 담당자별 텔레그램 수신 그룹과 발송 이력 관리

## 기술 구성

- React 19, TypeScript, Vite, Tailwind CSS
- Express, tRPC, Drizzle ORM
- MySQL
- Manus OAuth 및 Forge 파일 저장소
- Telegram Bot API

## 로컬 실행

```bash
corepack pnpm install
corepack pnpm dev
```

실행 전 `.env.example`을 참고해 환경 변수를 설정해야 합니다. 비밀키와 운영 환경 변수는 Git에 커밋하지 않습니다.

## 검사 및 빌드

```bash
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

## 배포

현재 운영 환경은 Manus WebDev를 사용합니다. 앱에는 Manus OAuth, MySQL, Forge 저장소와 텔레그램 환경 변수가 필요하므로 정적 호스팅인 GitHub Pages에는 배포할 수 없습니다.

GitHub 저장소는 소스 이력과 백업에 사용하고, 실제 사용자는 Manus에서 발급한 공개 웹사이트 주소로 접속합니다.

## 보안

- `.env` 파일과 API 키를 저장소에 올리지 않습니다.
- 주민등록번호 등 불필요한 민감정보를 보건증 메모에 저장하지 않습니다.
- 텔레그램 봇 토큰과 DB 접속 문자열은 배포 환경의 비밀 변수로 관리합니다.
