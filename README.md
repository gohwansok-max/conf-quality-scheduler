# 코엔에프 자가품질검사·보건증 스케줄러 (Static Web App)

> **운영 URL**: [https://gohwansok-max.github.io/conf-quality-scheduler/](https://gohwansok-max.github.io/conf-quality-scheduler/)

식자재/제조업체의 자가품질검사 일정과 보건증 만료를 관리하는 팀 공용 웹앱입니다. 별도 설치나 빌드 없이 **정적 HTML/CSS/JavaScript**만으로 동작하며, GitHub Pages에서 호스팅하고 Supabase를 공용 데이터베이스·파일 저장소로 사용합니다.

---

## 핵심 기능 3가지

1. **스케줄 관리 + 텔레그램 알람**: 제품별 검사주기로 다음 검사일(D-Day)을 자동 계산하고, GitHub Actions가 매일 09:00(KST) Supabase 데이터를 조회해 마감 임박/초과 항목을 텔레그램으로 발송합니다. 보건증은 만료 30일/7일/1일 전 알림 기준일을 설정 화면에서 조정할 수 있습니다.
2. **성적서·보건증 파일 보관**: PDF/이미지 파일을 Supabase Storage(`quality-files` 버킷)에 업로드해 보관하고, 팀원 누구나 열람·다운로드할 수 있습니다.
3. **기기 간 실시간 동기화**: Supabase Realtime 구독으로 한 기기에서 등록/수정/삭제하면 다른 PC·스마트폰·태블릿에도 즉시 반영됩니다(구독이 끊기면 자동 재연결 및 폴링 백업으로 전환).

---

## 기술 구성

- **프론트엔드**: 순수 HTML/CSS/JavaScript(SPA), 빌드 과정 없음
- **데이터베이스 & 파일 저장소**: Supabase (PostgreSQL + Storage + Realtime)
- **배포**: GitHub Pages (`.github/workflows/pages.yml`)
- **알림**: GitHub Actions 스케줄러(`.github/workflows/daily-telegram-alert.yml`) + Telegram Bot API

---

## 파일 구조

```
conf-quality-scheduler/
├── index.html                  # 단일 페이지 앱(SPA) 마크업
├── styles.css                  # UI 스타일
├── app.js                      # 전체 클라이언트 로직 (Supabase 연동, D-Day, 업로드/삭제 등)
├── runtime-config.js           # 런타임 설정
├── manifest.webmanifest / sw.js # PWA 매니페스트 및 서비스워커
├── supabase_rls_setup.sql      # Supabase RLS·Storage 정책 설정 스크립트
├── scripts/
│   ├── telegram_alert.cjs      # 일일 텔레그램 알림 발송 스크립트
│   └── send-telegram-test.mjs  # 텔레그램 발송 테스트 스크립트
├── .github/workflows/
│   ├── pages.yml                # GitHub Pages 배포
│   └── daily-telegram-alert.yml # 매일 09:00 KST 알림 발송
├── GITHUB_PAGES_SERVER_OPERATION.md # 운영 안내
└── QUICK_START_TEAM.md          # 팀원용 빠른 시작 안내
```

---

## GitHub Pages 배포 방법

1. GitHub 저장소의 **Settings → Pages**로 이동
2. **Build and deployment**에서 Source를 `GitHub Actions`로 설정(이미 `pages.yml`이 구성되어 있음)
3. `main` 브랜치에 푸시하면 자동 배포되어 `https://gohwansok-max.github.io/conf-quality-scheduler/`에 반영됩니다

## Supabase 설정

업로드/삭제가 실패한다면 Supabase RLS 정책 또는 Storage 버킷 설정이 원인일 수 있습니다. Supabase 대시보드 SQL Editor에서 `supabase_rls_setup.sql`을 실행하세요. 자세한 운영 안내는 [GITHUB_PAGES_SERVER_OPERATION.md](GITHUB_PAGES_SERVER_OPERATION.md)를 참고하세요.

---

## 저작권
© 2026 (주)코엔에프 (CONF). All Rights Reserved.
