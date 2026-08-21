# 로컬 개발 환경 설정 가이드

이 앱은 인증이 필요 없는 공개 앱이므로, 간단한 설정으로 로컬에서 바로 실행할 수 있습니다.

## 빠른 시작 (SQLite 기반)

### 1. 프로젝트 클론 및 의존성 설치

```bash
git clone <repository-url>
cd conf-quality-scheduler
corepack pnpm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성합니다:

```bash
# 필수
NODE_ENV=development
PORT=3000
DATABASE_URL=file:./local.db

# 선택 (Telegram 알림을 사용하려면 봇 토큰 추가)
# TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### 3. 데이터베이스 초기화

```bash
corepack pnpm db:push
```

이 명령은 SQLite 데이터베이스를 생성하고 필요한 테이블을 자동으로 생성합니다.

### 4. 개발 서버 시작

```bash
corepack pnpm dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

---

## MySQL 사용 (선택)

### 1. MySQL 데이터베이스 생성

```sql
CREATE DATABASE conf_quality CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'conf_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON conf_quality.* TO 'conf_user'@'localhost';
FLUSH PRIVILEGES;
```

### 2. 환경 변수 설정

`.env` 파일:

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=mysql://koenf_user:your_password@localhost:3306/koenf_quality
```

### 3. 마이그레이션 실행

```bash
corepack pnpm db:push
```

### 4. 개발 서버 시작

```bash
corepack pnpm dev
```

---

## 개발 명령어

```bash
# TypeScript 타입 체크
corepack pnpm check

# 테스트 실행
corepack pnpm test

# 배포용 빌드
corepack pnpm build

# 빌드된 앱 실행 (프로덕션 모드)
corepack pnpm start

# 코드 포매팅
corepack pnpm format
```

---

## Telegram 알림 설정 (선택)

Telegram 알림을 사용하려면:

1. Telegram에서 BotFather와 대화하여 봇 생성
2. 봇의 Token 복사
3. `.env` 파일에 추가:
   ```bash
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```

4. 앱을 재시작하면 텔레그램 알림이 활성화됩니다.

---

## 문제 해결

### 포트 3000이 이미 사용 중인 경우

```bash
PORT=3001 corepack pnpm dev
```

또는 시스템에서 포트 3000을 사용 중인 프로세스를 종료하세요.

### SQLite 데이터베이스 파일 삭제 및 재초기화

```bash
rm local.db
corepack pnpm db:push
```

### 데이터베이스 연결 오류

- MySQL을 사용하는 경우, 접속 정보가 올바른지 확인하세요
- SQLite를 사용하는 경우, `local.db` 파일이 쓰기 가능한 디렉토리에 있는지 확인하세요

---

## 배포

### Docker로 배포

```bash
# 빌드
corepack pnpm build

# Dockerfile 작성 예시
# FROM node:20
# WORKDIR /app
# COPY dist .
# COPY node_modules .
# ENV NODE_ENV=production
# EXPOSE 3000
# CMD ["node", "dist/index.js"]
```

### Node.js 호스팅 (Vercel, Railway 등)

1. GitHub에 저장소 푸시
2. 호스팅 플랫폼에서 리포지토리 연결
3. 빌드 명령: `corepack pnpm build`
4. 시작 명령: `corepack pnpm start`
5. 환경 변수 설정:
   - `DATABASE_URL` (필수)
   - `TELEGRAM_BOT_TOKEN` (선택)

---

## 참고

- 이 앱은 공개 앱이므로 민감한 데이터를 저장하지 않는 것을 권고합니다
- 모든 사용자가 모든 데이터에 접근 가능합니다
- 정보는 공개된 저장소에서 안전하게 보관해야 합니다
