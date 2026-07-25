# AGENTS.md

Work Hub 저장소에서 작업하는 AI 에이전트를 위한 규칙과 배경 지식.
사람이 읽어도 되지만, 이 문서의 1순위 독자는 에이전트다.

---

## 1. 반드시 지켜야 할 규칙

아래 항목은 다른 어떤 판단보다 우선한다. 편의를 위해서라도 어기지 않는다.

### 1.1 push

`main` 에 직접 push 해도 된다. 1인 개인 프로젝트라 리뷰 절차를 두지 않는다.

다만 `main` 에 push 하면 GitHub Actions 가 곧바로 배포한다. **push 는 곧 배포다.**

- push 전에 `npm run build` 가 통과하는지 확인한다. 타입 오류가 있으면 배포가 실패한다.
- 커밋하지 않은 변경을 남겨둔 채 push 해서 반쪽짜리 상태를 올리지 않는다.
- 아래 세 가지는 되돌리기 어려우므로 push 하지 않는다. 필요하면 먼저 물어본다.
  - `--force` / `--force-with-lease` 등 이력을 고쳐 쓰는 push
  - 이미 push 된 커밋을 갈아엎는 rebase 후의 push
  - 브랜치·태그 삭제 push

### 1.2 커밋 시점

초기 구성은 끝났다. 작업이 끝나면 아래 규칙에 따라 커밋한다.

기본 동작은 **커밋까지 하고 보고**다. push 는 작업이 실제로 마무리됐고 빌드가 통과했을 때만
이어서 한다 — 배포가 따라오기 때문이다. 확신이 서지 않으면 커밋만 하고 물어본다.

### 1.3 세션 시작 시 pull

작업을 시작하기 전에 원격에 받아올 것이 있으면 먼저 반영한다.

```bash
git fetch origin && git status -sb
```

`behind` 표시가 있으면 `git pull --ff-only` 로 당겨온다.
충돌이 나거나 fast-forward 가 불가능하면 임의로 merge/rebase 하지 말고 사용자에게 알린다.
원격에 브랜치가 아직 없으면(초기 상태) 아무것도 하지 않는다.

### 1.4 커밋 단위

**기능 단위로 커밋한다.** "오늘 한 일 전부" 를 한 커밋에 몰아넣지 않는다.
칸반 드래그 기능과 회의록 템플릿 추가는 서로 다른 커밋이다.
리팩터링과 기능 추가가 섞였다면 리팩터링을 먼저 별도 커밋으로 분리한다.

### 1.5 커밋 메시지

형식은 Conventional Commits 를 따르고, **설명 내용은 한국어로 쓴다.**
타입 접두사와 스코프는 영문 그대로 둔다.

```
<타입>(<스코프>): <한국어 요약>

<필요하면 한국어 본문 — 왜 이렇게 했는지>
```

| 타입 | 쓰는 경우 |
| --- | --- |
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서만 변경 (README, AGENTS.md 등) |
| `style` | 동작 변화 없는 서식·CSS 정리 |
| `refactor` | 동작 변화 없는 구조 개선 |
| `perf` | 성능 개선 |
| `test` | 테스트 추가·수정 |
| `chore` | 빌드 설정, 의존성, 워크플로 |
| `security` | 보안 규칙·권한 관련 변경 |

예시:

```
feat(tasks): 칸반 카드 드래그로 상태 변경 기능 추가
fix(auth): 로그인 팝업을 닫았을 때 오류 메시지가 남는 문제 수정
docs: Firebase 초기 설정 절차를 README에 정리
security(rules): 회의록 삭제 권한을 작성자와 owner로 제한
chore(deps): firebase를 11.3.1로 올림
```

요약줄은 50자 안팎, 마침표 없이, "~함/~추가" 대신 위 예시처럼 명사형이나 "~수정" 으로 끝낸다.

---

## 2. 이 프로젝트가 무엇인가

새 직장의 업무를 관리하려고 만든 개인/소규모 팀용 워크스페이스.

- 프론트엔드: **GitHub Pages** 정적 호스팅
- 백엔드: **Firebase** (Google 로그인 + Firestore)
- 핵심 제약: **아무나 접속하지 못해야 한다.** 허용된 조직 계정만 들어올 수 있다.

기능 개요와 설치 절차는 [README.md](README.md) 에 있다. 중복해서 적지 않으니 그쪽을 본다.

---

## 3. 기술 스택과 구조

Vite 6 + React 19 + TypeScript 5.7. 상태 관리 라이브러리는 쓰지 않고 React 내장 훅과
Firestore 실시간 구독만 쓴다. UI 라이브러리도 없고 CSS 변수 기반의 자체 스타일이다.

```
src/
  lib/
    firebase.ts     Firebase 초기화. 설정이 비면 firebaseConfigured=false
    auth.tsx        AuthProvider / useAuth. 로그인 상태와 members 문서 조회
    db.ts           useCollection 훅 + createDoc/updateDocById/deleteDocById
    types.ts        Journal / Task / Meeting / Prep / Member 타입과 라벨 상수
    markdown.ts     marked + DOMPurify, 날짜·태그 유틸
    exportHtml.ts   준비자료를 단일 HTML 문서로 만드는 생성기
    session.ts      세션 코드 생성·정규화·조회. 4.1 장을 읽고 손댈 것
  components/       Layout(사이드바) / Login / Modal / MarkdownField / SessionManager
  pages/            Dashboard / Journal / Tasks / Meetings / Preps / Settings
                    SessionView — 인증 게이트 바깥에 있는 유일한 화면
firebase/
  firestore.rules   접근 통제의 실체. 아래 4장 참고
.github/workflows/  main push 시 Pages 자동 배포
```

라우팅은 `HashRouter` 다. GitHub Pages 에 SPA 404 폴백이 없어서 의도적으로 고른 것이니
`BrowserRouter` 로 바꾸지 않는다. 세션 링크(`#/s/CODE`)를 팀원에게 그대로 보내야 하므로
해시 형태가 바뀌면 이미 배포된 링크가 전부 깨진다.

`App.tsx` 는 공개 라우트(`/s`, `/s/:code`)를 인증 게이트인 `PrivateApp` **바깥에** 둔다.
이 순서를 바꾸면 팀원이 로그인 화면에 갇힌다.

`vite.config.ts` 의 `base` 는 `/work-hub/` 이고 CI 에서 `VITE_BASE` 로 덮어쓴다.
커스텀 도메인을 붙이기 전까지 이 값을 `/` 로 바꾸면 배포본이 깨진다.

---

## 4. 보안: 가장 중요한 부분

**접근 통제는 오직 [firebase/firestore.rules](firebase/firestore.rules) 에서만 이뤄진다.**

```
Google 로그인 → 규칙이 허용 도메인 확인 → members/{uid} 생성 → 데이터 접근 허용
                              아니면 거부 → "접근 권한이 없습니다"
```

에이전트가 지켜야 할 것:

- 권한 관련 변경을 제안할 때는 **규칙 파일을 먼저 읽는다.** 클라이언트 쪽 조건문만
  추가하는 해결책은 제안하지 않는다. 브라우저 코드는 우회 가능하다.
- 규칙 맨 아래의 `match /{document=**} { allow read, write: if false; }` 는 지운다는 선택지가
  없다. 새 컬렉션을 추가하면 그 위에 명시적 `match` 블록을 쓴다.
- `.env` 의 `VITE_FIREBASE_*` 값은 비밀키가 아니라 공개 식별자다. 노출을 걱정해 난독화하거나
  런타임에 숨기려 들지 않는다. 대신 규칙을 조인다.
- 실제 비밀값(서비스 계정 키, Admin SDK 자격증명)은 이 저장소에 절대 두지 않는다.
- `.env` 는 `.gitignore` 에 있다. 커밋 스테이징 전에 `git status` 로 확인한다.
- 규칙을 고쳤으면 배포해야 반영된다. 사용자에게 아래 명령을 안내한다.

```bash
npx firebase-tools deploy --only firestore:rules --project <프로젝트-id>
```

사용자 입력은 전부 마크다운으로 렌더링된다. **`renderMarkdown()` 을 거치지 않은 문자열을
`dangerouslySetInnerHTML` 에 넣지 않는다.** 그 함수 안에서 DOMPurify sanitize 가 일어난다.
`exportHtml.ts` 의 제목·부제 같은 평문 필드는 `esc()` 로 이스케이프한다.

### 4.1 발표 세션 — 유일한 공개 경로

`sessions` 컬렉션은 이 앱에서 비로그인 접근을 허용하는 단 하나의 지점이다.
설계가 미묘하니 손대기 전에 아래를 이해하고 시작한다.

- **문서 ID 가 곧 세션 코드이자 유일한 인증 수단이다.** 그래서 `allow get` 은 열려 있어도
  `allow list` 는 멤버 전용이다. 이 비대칭이 무너지면 누구나 전체 세션을 훑을 수 있게 된다.
  `sessions` 에 `list`/`where` 질의를 추가하려 할 때는 반드시 멤버 전용 경로인지 확인한다.
- 코드 글자 집합(`ALPHABET`)에서 `0/O`, `1/I/L`, `U` 를 뺀 건 발표 자리에서 코드를
  불러줘야 하기 때문이다. 길이를 8자 미만으로 줄이지 않는다 — 무작위 대입 여지가 커진다.
- **비로그인 방문자에게 실패는 전부 `permission-denied` 로 온다.** 코드가 틀렸든 없든
  닫혔든 만료됐든 마찬가지다. `fetchSession()` 이 이를 `not-found` 로 뭉뚱그리는 건
  버그가 아니라 의도다. 사용자 친절을 이유로 "존재하지만 만료됨" 같이 구분해서 알려주면
  세션 존재 여부가 새어 나간다.
- 세션은 발행 시점의 **스냅샷**을 들고 있다. 원고를 고쳐도 발표본은 바뀌지 않고,
  `갱신` 을 눌러야 반영된다. 발표 도중 사고를 막으려는 설계이므로 실시간 참조로 바꾸지 않는다.
- 세션 뷰어는 `buildPrepHtml()` 결과를 iframe `srcDoc` 으로 띄운다. 내려받은 HTML 파일과
  화면이 같아야 하므로 뷰어 전용 스타일을 따로 만들지 않는다. iframe 에 `allow-scripts` 를
  주지 않는다 — 스크립트가 돌지 않으니 `allow-same-origin` 이 안전한 것이다.

---

## 4.2 실제 운영 환경

이 프로젝트가 실제로 붙어 있는 곳. 값이 바뀌면 이 표부터 고친다.

| 항목 | 값 |
| --- | --- |
| 배포 주소 | https://nacha4.github.io/work-hub/ |
| GitHub 저장소 | `NaCha4/work-hub` (main 브랜치) |
| Pages 배포 방식 | **GitHub Actions** (`build_type: workflow`) |
| Firebase 프로젝트 | `work-hub-c0e3c` ([.firebaserc](.firebaserc) 에 고정) |
| 허용 계정 | `name@example.com`, `name@example.com` |

### Pages 배포 방식 주의

Pages Source 를 `Deploy from a branch` 로 두면 저장소 루트의 `index.html` 이 그대로
서빙된다. 그 파일은 `<script src="/src/main.tsx">` 를 가리키는 **개발용 진입점**이라
브라우저에서 실행되지 않고, 화면이 새까맣게 뜬다(스타일도 안 붙어 브라우저 기본
다크 배경만 보임). 실제로 한 번 겪은 문제다.

**Source 는 반드시 `GitHub Actions` 여야 한다.** 확인·복구 명령:

```bash
gh api repos/NaCha4/work-hub/pages --jq .build_type
```

```bash
gh api -X PUT repos/NaCha4/work-hub/pages -f build_type=workflow
```

### 사람만 할 수 있는 설정

아래 두 가지는 CLI 로 처리할 수 없다. 에이전트가 대신 해주겠다고 하지 말고 안내한다.

- **GitHub Secrets** (`VITE_FIREBASE_*` 6개) — 없으면 배포본이 "설정이 필요합니다" 화면이 된다
- **Firebase 승인된 도메인** — Authentication > Settings 에 `nacha4.github.io` 가 없으면
  배포본에서 Google 로그인 팝업이 `auth/unauthorized-domain` 으로 차단된다

### 규칙 배포

규칙 파일을 고쳤으면 배포해야 반영된다. `.firebaserc` 가 있으므로 `--project` 는 필요 없다.

```bash
npx firebase-tools deploy --only firestore:rules
```

## 5. 명령어

```bash
npm run dev
```

```bash
npm run build
```

`build` 는 `tsc --noEmit` 를 먼저 돌리므로 타입 오류가 있으면 빌드가 실패한다.
**변경 후에는 최소한 `npm run build` 가 통과하는지 확인하고 보고한다.**

테스트 러너는 아직 없다. 추가한다면 Vitest 를 쓰고 `chore(test):` 로 커밋한다.

로컬에서 화면까지 확인하려면 `.env` 에 실제 Firebase 값이 있어야 한다.
값이 비어 있으면 앱은 흰 화면 대신 "설정이 필요합니다" 안내를 띄운다 — 이건 정상 동작이다.

---

## 6. 코드 작성 규칙

- **UI 문구는 전부 한국어.** 코드 식별자·타입명·커밋 타입 접두사는 영문.
- 주석은 한국어로 쓰되, "왜" 를 설명할 때만 쓴다. 코드를 읽으면 아는 "무엇" 은 적지 않는다.
- 새 데이터 종류를 추가하면 `types.ts` 에 타입을 정의하고, `db.ts` 의 `CollectionName` 에
  이름을 넣고, 규칙에 `match` 블록을 추가한다. 세 곳을 함께 고쳐야 한다.
- 문서 생성 시각은 `Date.now()` 로 클라이언트에서 넣는다(`createDoc` 이 처리).
  `serverTimestamp()` 로 바꾸면 타입이 `number` 가 아니게 되어 정렬·표시가 깨진다.
- 날짜는 `YYYY-MM-DD` 문자열, 시각은 `HH:mm` 문자열로 저장한다. 문자열 비교로 정렬·비교한다.
- 사용자 데이터를 지우는 동작에는 항상 `confirm()` 을 건다.
- 의존성 추가는 신중하게. 지금 런타임 의존성은 react, react-dom, react-router-dom,
  firebase, marked, dompurify 여섯 개뿐이고 이 상태를 유지하고 싶다.

---

## 7. 하지 말 것 요약

- 이력을 고쳐 쓰는 push (`--force`, 이미 올라간 커밋의 rebase, 브랜치·태그 삭제)
- 빌드가 깨진 채로 push — `main` push 는 곧 배포다
- 여러 기능을 한 커밋에 몰아넣기
- 영어로 쓴 커밋 설명
- 클라이언트 코드만으로 접근을 막으려는 시도
- `dist/`, `node_modules/`, `.env` 커밋
- `HashRouter` → `BrowserRouter` 교체
- `sessions` 에 멤버 아닌 사람도 되는 목록 질의 추가
- 세션 실패 사유를 방문자에게 구분해서 알려주기 (4.1 참고)
