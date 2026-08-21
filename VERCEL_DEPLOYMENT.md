# Vercel 배포 가이드

Vercel에 5분 안에 배포하는 방법입니다. 팀원들이 웹사이트 주소로 접속할 수 있게 됩니다.

## 1단계: Vercel 계정 생성 (GitHub로 로그인)

1. https://vercel.com 방문
2. "Sign Up" 클릭
3. "Continue with GitHub" 선택
4. GitHub 계정으로 로그인

## 2단계: 저장소 연결 및 배포

1. Vercel 대시보드에서 "New Project" 클릭
2. GitHub 저장소 선택: `koenf-quality-scheduler`
3. "Import" 클릭

## 3단계: 환경변수 설정

배포 전에 **환경변수**를 설정해야 합니다:

### 필수 환경변수

1. **DATABASE_URL** (데이터베이스 선택)
   
   **옵션 A: PlanetScale (MySQL - 권장)**
   - https://planetscale.com 방문
   - GitHub로 가입
   - 새 데이터베이스 생성
   - 연결 문자열 복사
   - 예시: `mysql://user:password@aws.connect.psdb.cloud/koenf?sslaccept=strict`
   
   **옵션 B: Neon (PostgreSQL - 무료)**
   - https://neon.tech 방문
   - GitHub로 가입
   - 새 프로젝트 생성
   - 연결 문자열 복사
   - 예시: `postgresql://user:password@neon.tech/dbname`

2. **TELEGRAM_BOT_TOKEN** (선택사항 - 알림 기능)
   - 텔레그램 @BotFather로 봇 생성
   - 받은 토큰 입력

### 환경변수 추가 방법

Vercel 프로젝트 설정에서:
1. "Settings" → "Environment Variables"
2. 각 변수명과 값 입력
3. "Save"

## 4단계: 배포 실행

1. Vercel 프로젝트 페이지에서 "Deploy" 버튼 클릭
2. 3-5분 기다림
3. 배포 완료! 🎉

## 5단계: 팀원들에게 URL 공유

배포 완료 후 생성된 URL:
- Vercel이 자동으로 할당: `your-app.vercel.app`
- 또는 커스텀 도메인 설정 가능

## 🔄 자동 배포 (선택사항)

Git에 push하면 자동으로 배포됩니다:
```bash
git push origin main
```
→ Vercel이 자동으로 감지해서 배포

---

## ⚠️ 주의사항

- **DATABASE_URL 필수**: 없으면 배포 실패
- **비밀키 노출 금지**: `.env` 파일에서 절대 GitHub에 올리지 않기
- **데이터베이스 비용**: PlanetScale/Neon 무료 플랜 확인 후 사용

## 🆘 문제 해결

**배포 실패시:**
1. Vercel 대시보드에서 "Deployments" 확인
2. 빌드 로그 확인 (에러 메시지 보기)
3. 대부분 DATABASE_URL 설정 오류

---

완료되면 팀원들에게 이 URL을 공유하세요! 🚀
