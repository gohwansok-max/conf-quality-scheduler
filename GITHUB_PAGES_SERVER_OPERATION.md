# GitHub Pages 통합 운영 안내

## 운영 구조

`https://gohwansok-max.github.io/conf-quality-scheduler/`는 팀원이 접속하는 정적 화면입니다. 제품·성적서·보건증 데이터를 Supabase에 동기화하고, GitHub Actions가 매일 KST 09:00에 자가품질검사·성적서 미등록·보건증 만료 대상을 텔레그램으로 발송합니다.

| 역할 | 운영 위치 | 주요 기능 |
|---|---|---|
| 팀 화면 | GitHub Pages | 제품·보건증 등록, D-Day, PDF 사본, Excel·백업 |
| 공동 데이터 | Supabase | 팀원 간 제품·성적서·보건증 데이터 동기화 |
| 정기 알림 | GitHub Actions | 매일 09:00 KST 텔레그램 자동 알림 |
| 파일 저장 | Supabase Storage | 성적서·보건증 PDF·이미지 파일 보관 |

## GitHub Secrets 설정

저장소의 **Settings → Secrets and variables → Actions**에서 아래 값을 등록합니다. 값 자체는 코드·브라우저·채팅에 기록하지 않습니다.

| Secret | 용도 | 필수 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API 발송 | 예 |
| `TELEGRAM_CHAT_ID` | 단일 기본 수신 그룹 ID | 단일 그룹 사용 시 |
| `TELEGRAM_CHAT_IDS` | 여러 그룹 ID를 쉼표·공백으로 구분 | 다중 그룹 사용 시 |
| `SUPABASE_URL` | 공동 데이터베이스 주소 | 권장 |
| `SUPABASE_ANON_KEY` | Supabase 공개 클라이언트 키 | 권장 |

`TELEGRAM_CHAT_IDS`가 있으면 같은 일일 통합 알림을 모든 지정 그룹에 보냅니다. 아직 식품유형·부서별로 내용을 다르게 보내지는 않으므로, 내용 분리가 필요하면 그룹별 Actions workflow를 별도로 구성합니다.

## 보건증 PDF와 자동 알림

보건증 관리 탭에서 담당자·발급일·만료일·경고일·PDF 사본을 관리합니다. 만료 30일 이내 또는 기간 초과 담당자는 일일 Telegram 메시지의 **보건증 만료 주의** 구역에 포함됩니다. 재직 제외 또는 알림 중지 상태는 발송 대상에서 제외됩니다.

## Supabase 필수 설정 (파일 업로드·삭제가 안 될 때)

성적서·보건증 파일 업로드나 항목 삭제가 실패한다면 대부분 Supabase 쪽 RLS(Row Level Security) 정책 또는 Storage 버킷 설정 누락이 원인입니다. Supabase 대시보드의 **SQL Editor**에서 `supabase_rls_setup.sql`(프로젝트 루트)의 내용을 실행해 필요한 정책을 확인·적용하세요. 또한 **Storage → Buckets**에 `quality-files` 버킷이 존재하고 Public 읽기가 허용되어 있는지 확인합니다.

## 점검 절차

매월 보건증 PDF 갱신 후 보건증 관리 탭의 만료일을 확인합니다. GitHub Actions의 **Daily Telegram Quality Scheduler Alert**에서 `Run workflow`를 실행해 설정을 시험할 수 있습니다. 시험 전에는 실제 수신 그룹으로 메시지가 발송됨을 유의하십시오.
