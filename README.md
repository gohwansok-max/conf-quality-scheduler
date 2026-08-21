# 코엔에프 자가품질검사 스케줄러

자가품질검사 일정, 제품별 제조일, 검사성적서, 보건증 만료일과 텔레그램 알림을 통합 관리하는 웹 애플리케이션입니다.

**공개 앱**: 누구나 인증 없이 접속할 수 있습니다. 로그인이 필요하지 않습니다.

## 주요 기능

- 식품유형·제품별 검사 마감일 자동 계산
- 기간 초과·만료 임박 텔레그램 자동 알림 (선택적)
- 검사성적서 업로드, 다운로드, 공유 및 백업
- 보건증 담당자, 만료일, PDF와 갱신 알림 관리
- 담당자별 텔레그램 수신 그룹과 발송 이력 관리 (선택적)

## 기술 구성

- React 19, TypeScript, Vite, Tailwind CSS
- Express, tRPC, Drizzle ORM
- MySQL 또는 SQLite
- AWS S3 / 로컬 파일 저장소 (선택)
- Telegram Bot API (선택)

## 로컬 실행

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <repository-url>
cd koenf-quality-scheduler
corepack pnpm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음을 설정합니다:

```bash
# 애플리케이션
NODE_ENV=development
PORT=3000

# 필수: 데이터베이스
# MySQL 예시
DATABASE_URL=mysql://user:password@localhost:3306/koenf_quality

# SQLite 예시 (로컬 개발 권장)
# DATABASE_URL=file:./local.db

# 선택사항: Telegram 알림
TELEGRAM_BOT_TOKEN=

# 선택사항: 공개 URL
PUBLIC_APP_URL=http://localhost:3000
QUALITY_SCHEDULER_PUBLIC_URL=http://localhost:3000
```

### 3. 데이터베이스 마이그레이션

```bash
corepack pnpm db:push
```

### 4. 개발 서버 시작

```bash
corepack pnpm dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

### SQLite를 사용한 간단한 로컬 설정

SQLite를 사용하면 별도의 DB 설치 없이 로컬에서 즉시 테스트할 수 있습니다:

```bash
# .env 파일에 설정
DATABASE_URL=file:./local.db

# 마이그레이션 실행
corepack pnpm db:push

# 개발 서버 시작
corepack pnpm dev
```

## 검사 및 빌드

```bash
# TypeScript 타입 체크
corepack pnpm check

# 테스트 실행
corepack pnpm test

# 배포용 빌드
corepack pnpm build

# 배포된 앱 실행
corepack pnpm start
```

## 배포

이 앱은 인증이 필요 없으므로 다양한 환경에 배포할 수 있습니다:

- **Docker**: `corepack pnpm build` 후 `dist/` 폴더와 `node` 런타임 배포
- **Node.js 호스팅**: Vercel, Heroku, Railway 등
- **VPS**: 직접 호스팅

필수 환경변수: `DATABASE_URL` (MySQL 또는 SQLite)  
선택 환경변수: `TELEGRAM_BOT_TOKEN`

## 보안

- `.env` 파일과 API 키를 저장소에 올리지 않습니다.
- 주민등록번호 등 불필요한 민감정보를 보건증 메모에 저장하지 않습니다.
- 배포 환경의 민감한 환경변수는 호스팅 플랫폼의 비밀 변수로 관리합니다.
- 이 앱은 공개 앱이므로 민감한 데이터는 저장하지 않을 것을 권고합니다.
