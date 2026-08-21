# 팀원용 빠른 시작 가이드 🚀

코엔에프 자가품질검사 스케줄러를 팀원과 함께 사용하기 위한 가이드입니다.

## 📋 준비 사항

- **Node.js 18+** 설치 ([nodejs.org](https://nodejs.org))
- **Git** 설치 ([git-scm.com](https://git-scm.com))
- **MySQL** 또는 **SQLite** (아래 선택)

## 🚀 5분 안에 시작하기

### 1단계: 코드 다운로드

```bash
git clone https://github.com/gohwansok-max/koenf-quality-scheduler.git
cd koenf-quality-scheduler
```

### 2단계: 의존성 설치

```bash
corepack enable
corepack pnpm install
```

### 3단계: 데이터베이스 선택 및 설정

#### 옵션 A: SQLite (가장 간단함 - 추천) ⭐

1. `.env` 파일 생성:
```bash
cp .env.example .env
```

2. `.env` 수정:
```
DATABASE_URL=file:./local.db
PORT=3000
```

3. 데이터베이스 초기화:
```bash
corepack pnpm db:push
```

완료! SQLite는 별도 설치가 필요 없습니다.

#### 옵션 B: MySQL (팀원들과 공유하려면)

1. MySQL 서버 실행 (또는 클라우드 DB 사용)

2. `.env` 파일 생성 및 수정:
```
DATABASE_URL=mysql://user:password@localhost:3306/koenf_scheduler
PORT=3000
```

3. 데이터베이스 초기화:
```bash
corepack pnpm db:push
```

### 4단계: 개발 서버 시작

```bash
corepack pnpm dev
```

브라우저에서 `http://localhost:3000` 을 열면 됩니다! 🎉

## 🔔 텔레그램 알림 (선택사항)

Telegram Bot으로 검사 마감일 알림을 받으려면:

1. Telegram에서 `@BotFather`로 봇 생성
2. 받은 토큰을 `.env`에 추가:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

3. 앱 재시작
4. 앱에서 담당자를 추가하고 Telegram 채널을 연결하면 자동으로 알림이 전송됩니다.

## 📂 파일 저장소

### 옵션 A: 로컬 파일 저장소 (기본값)

검사성적서와 문서는 로컬 `uploads/` 폴더에 저장됩니다.

### 옵션 B: 클라우드 저장소

AWS S3, Google Cloud Storage 등으로 변경 가능합니다.
(개발자에게 문의하세요)

## 🛠️ 유용한 명령어

```bash
# 개발 서버 시작
corepack pnpm dev

# 타입 체크
corepack pnpm check

# 테스트 실행
corepack pnpm test

# 빌드
corepack pnpm build

# 프로덕션 시작
corepack pnpm start
```

## 🐛 문제 해결

### "포트 3000이 이미 사용 중입니다"
```bash
# 다른 포트 사용
PORT=3001 corepack pnpm dev
```

### "데이터베이스 연결 오류"
- `.env`의 `DATABASE_URL`이 올바른지 확인
- MySQL 서버가 실행 중인지 확인 (MySQL 선택시)

### "모듈을 찾을 수 없습니다"
```bash
# 의존성 재설치
rm -rf node_modules pnpm-lock.yaml
corepack pnpm install
```

## 🤝 팀원 협업

### 방법 1: 로컬에서 각자 실행 (가장 간단)

- 각 팀원이 자신의 컴퓨터에서 위 가이드대로 실행
- 데이터는 각자 로컬에 저장

### 방법 2: 팀 공유 서버 (권장)

여러 사람이 같은 데이터베이스에 접근하려면:

1. **공유 MySQL 서버** 또는 **클라우드 DB 구성**
   - AWS RDS, Google Cloud SQL, DigitalOcean Managed DB 등

2. **팀원들이 모두 같은 DATABASE_URL을 사용**

3. **한 팀원만 서버 실행** (또는 항상 실행 상태 유지)

## 📚 더 알아보기

- **상세 개발 가이드**: [SETUP_LOCAL.md](./SETUP_LOCAL.md)
- **기능 설명**: [README.md](./README.md)
- **변경사항**: [OAUTH_REMOVAL_SUMMARY.md](./OAUTH_REMOVAL_SUMMARY.md)

## 💬 질문/피드백

개발자에게 문의하거나 GitHub Issues에 등록해주세요.

---

**행운을 빕니다! 🚀**
