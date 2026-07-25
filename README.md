# Work Hub

업무 일지 · 할 일 · 회의록 · 회의 준비자료를 한곳에서 관리하는 개인/팀용 워크스페이스.
프론트엔드는 GitHub Pages 정적 호스팅, 데이터는 Firebase(Auth + Firestore)에 저장한다.

## 기능

| 화면 | 하는 일 |
| --- | --- |
| 대시보드 | 오늘 할 일·기한 초과·다가오는 회의 요약, 최근 7일 일지를 **주간 보고 초안**으로 복사 |
| 업무 일지 | 날짜별 `한 일 / 다음 할 일 / 이슈` 기록, 마크다운 + 태그 + 검색 |
| 할 일 | 5단 칸반(대기·할 일·진행 중·검토·완료), 드래그로 상태 변경, 우선순위/마감일/프로젝트 |
| 회의록 | 안건·논의·결정 사항 기록, `- [ ] 항목` 을 **할 일로 자동 등록**, 준비자료로 복사 |
| 준비자료 | 마크다운 편집 + 실시간 미리보기, **의존성 없는 단일 HTML 파일로 내보내 공유** |
| 발표 세션 | 준비자료 하나에 **8자리 코드**를 발급. 팀원은 로그인 없이 그 자료만 열람 |
| 설정 | 멤버 목록, 전체 데이터 JSON 백업 |

## 접근 통제 구조

이 앱에는 서로 다른 두 개의 문이 있다.

```
[본인]     Google 로그인 → 허용된 이메일인가? → members/{uid} 생성 → 전체 기능
                              아니면 거부 ↓
[팀원]     세션 코드 입력 → 코드가 곧 문서 ID → 그 준비자료 하나만 열람
```

- 실제 통제는 전부 [firebase/firestore.rules](firebase/firestore.rules) 에서 이뤄진다.
  클라이언트 코드를 우회해도 규칙을 통과하지 못하면 데이터를 볼 수 없다.
- 허용 계정은 규칙의 `isAllowedIdentity()` 목록으로 관리한다. 여기에 없는 계정은
  로그인에 성공하더라도 일지·할 일·회의록·준비자료를 한 줄도 읽지 못한다.
- 발표 세션만이 유일한 비로그인 접근 경로다. 코드(8자리, 30^8 ≈ 6500억 가지)를
  정확히 알아야 문서 하나를 열 수 있고, 목록 조회는 멤버만 가능하므로 코드를 모르면
  어떤 세션이 존재하는지조차 알 수 없다.
- `.env` 의 Firebase 설정값은 비밀키가 아니라 공개 식별자다. 노출되어도 규칙이 막아준다.
- **규칙을 고쳤으면 반드시 배포해야 반영된다.** 아래 3-5 참고.

## 1. 로컬 실행

```bash
npm install
```

```bash
cp .env.example .env
```

`.env` 에 Firebase 웹 앱 설정값을 채운 뒤:

```bash
npm run dev
```

## 2. Firebase 준비

1. [Firebase 콘솔](https://console.firebase.google.com/) 에서 프로젝트 생성
2. **빌드 > Authentication > 시작하기 > Google** 로그인 제공업체 사용 설정
3. **빌드 > Firestore Database > 데이터베이스 만들기** (프로덕션 모드, 리전은 `asia-northeast3`)
4. **프로젝트 설정 > 내 앱 > 웹앱 추가** 후 `firebaseConfig` 값을 `.env` 에 복사
5. `firebase/firestore.rules` 의 `isAllowedIdentity()` 를 본인 계정으로 수정하고 배포
   (`.firebaserc` 에 프로젝트가 고정되어 있어 `--project` 는 생략 가능):

```bash
npx firebase-tools deploy --only firestore:rules
```

6. **Authentication > Settings > 승인된 도메인** 에 `localhost` 와
   `<사용자명>.github.io` 를 추가한다. 이걸 빠뜨리면 배포본에서 로그인 팝업이
   `auth/unauthorized-domain` 으로 차단된다. CLI 로는 설정할 수 없고 콘솔에서만 가능하다.
7. 첫 로그인 후, 콘솔의 `members/{내 uid}` 문서에서 `role` 을 `owner` 로 바꾸면
   다른 멤버의 글도 삭제할 수 있다

## 3. GitHub Pages 배포

> **Source 를 `Deploy from a branch` 로 두면 새까만 화면이 뜬다.**
> 저장소 루트의 `index.html` 은 `/src/main.tsx` 를 가리키는 개발용 진입점이라
> 브라우저가 실행하지 못한다. 반드시 `GitHub Actions` 로 둘 것.

1. GitHub 에 리포지터리를 만들고 push
2. **Settings > Pages > Source** 를 `GitHub Actions` 로 변경
3. **Settings > Secrets and variables > Actions > Secrets** 에 아래 6개 등록
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. 같은 화면의 **Variables** 탭에 `VITE_BASE` 를 `/<리포지터리명>/` 으로 등록
   (커스텀 도메인이나 `<사용자명>.github.io` 리포지터리면 `/`)
5. `main` 에 push 하면 [.github/workflows/deploy.yml](.github/workflows/deploy.yml) 이 자동 배포

## 팀원에게 발표 자료 공유하기

### 방법 1 — 발표 세션 (권장)

준비자료 화면에서 **🔑 세션** 을 누르면 `ABCD-EFGH` 형태의 코드와 링크가 발급된다.

1. 유효 기간(1일/7일/30일/무기한)과 안내 문구를 정하고 **+ 새 코드 발급**
2. 링크를 그대로 보내거나, 발표 자리에서 코드만 불러줘도 된다
   (`0/O`, `1/I/L` 처럼 헷갈리는 글자는 코드에 쓰지 않는다)
3. 받은 사람은 로그인 없이 그 자료 하나만 본다. 인쇄·PDF 저장·내려받기도 가능하다

발급 후 관리:

- **갱신** — 원고를 고친 뒤 누르면 같은 코드로 최신 내용이 반영된다.
  누르기 전까지는 발행 시점의 사본이 그대로 보이므로, 발표 도중 원고를 만져도 안전하다
- **닫기 / 열기** — 링크를 살려둔 채 열람만 임시로 막는다
- **삭제** — 링크가 즉시 죽는다

### 방법 2 — 파일로 전달

- **HTML 내려받기** — 스타일이 포함된 파일 하나. 메신저로 보내면 브라우저로 바로 열림
- **새 탭 미리보기** — 그 자리에서 확인하고 `Ctrl+P` 로 PDF 저장
- **HTML 복사** — 사내 위키나 메일 본문에 붙여넣기

세션 뷰어와 내려받은 파일은 같은 생성기(`src/lib/exportHtml.ts`)를 쓰므로 화면이 완전히 같다.

## 구조

```
src/
  lib/         firebase 초기화, 인증, Firestore 헬퍼, 마크다운, HTML 생성, 세션 코드
  components/  Layout, Login, Modal, MarkdownField, SessionManager
  pages/       Dashboard, Journal, Tasks, Meetings, Preps, Settings, SessionView
firebase/      firestore 보안 규칙, 인덱스
.github/       Pages 배포 워크플로
```

`SessionView` 는 인증 게이트 바깥(`#/s`, `#/s/:code`)에 있는 유일한 화면이다.

## 다음에 붙이면 좋은 것

- 세션 열람 기록(누가 언제 열었는지) — 쓰기 권한을 열어야 해서 설계가 필요함
- 발표 모드(슬라이드 넘김, 발표자 노트)
- 회의록 템플릿 프리셋(1:1, 스프린트 리뷰, 킥오프)
- 일지 작성 알림(브라우저 알림 또는 Slack Webhook)
- 첨부파일(Firebase Storage) 업로드
