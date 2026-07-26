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

**한 세션의 작업이 끝나면 push 까지 한다.** 매번 물어보지 않아도 된다.
다만 push 는 곧 배포이므로 `npm run build` 가 통과한 것을 확인한 뒤에만 올린다.
작업이 중간에 멈췄거나 결과에 확신이 서지 않으면 커밋만 하고 물어본다.
1.1 의 이력을 고쳐 쓰는 push 는 여전히 예외 없이 먼저 물어본다.

### 1.3 세션 시작 시 pull

작업을 시작하기 전에 원격에 받아올 것이 있으면 먼저 반영한다.

```bash
git fetch origin && git status -sb
```

`behind` 표시가 있으면 `git pull --ff-only` 로 당겨온다.
충돌이 나거나 fast-forward 가 불가능하면 임의로 merge/rebase 하지 말고 사용자에게 알린다.
원격에 브랜치가 아직 없으면(초기 상태) 아무것도 하지 않는다.

### 1.4 README 는 건드리지 않는다

**[README.md](README.md) 는 사용자가 명시적으로 지시할 때만 수정한다.**

"README 도 같이 갱신할까요" 라고 묻지도 말고, 다른 작업의 곁다리로 손대지도 않는다.
기능을 추가했든 구조를 바꿨든 마찬가지다. 문서를 남겨야 할 일이 생기면 이 문서
(AGENTS.md)나 코드 주석에 적는다.

이 저장소의 README 는 사용자가 직접 관리한다. 에이전트가 채워 넣을 자리가 아니다.

### 1.5 커밋 단위

**기능 단위로 커밋한다.** "오늘 한 일 전부" 를 한 커밋에 몰아넣지 않는다.
칸반 드래그 기능과 회의록 템플릿 추가는 서로 다른 커밋이다.
리팩터링과 기능 추가가 섞였다면 리팩터링을 먼저 별도 커밋으로 분리한다.

### 1.6 커밋 메시지

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

새 직장의 업무를 관리하려고 만든 **1인용** 워크스페이스.

- 프론트엔드: **GitHub Pages** 정적 호스팅
- 백엔드: **Firebase** (Google 로그인 + Firestore)
- 핵심 제약: **아무나 접속하지 못해야 한다.** 허용된 조직 계정만 들어올 수 있다.

기능 개요와 설치 절차는 [README.md](README.md) 에 있다. 중복해서 적지 않으니 그쪽을 본다.

### 2.1 설계 의도 — 읽고 시작할 것

**쓰는 사람은 도코 한 명이다.** 팀 협업 도구가 아니라 개인 업무 일지다.
데이터가 계정별로 나뉘어 있지 않은 것은 빠뜨린 게 아니라 그렇게 설계한 것이다.

- 일지·할 일·회의록·준비자료는 **전부 하나의 작업 공간**에 있다. 소유자별 분리가 없다.
  대시보드의 통계·할 일 목록·드래그 순서도 전부 그 하나를 본다.
- 그래서 **계정별 분리, 멀티테넌시, `where(authorUid == ...)` 필터를 제안하지 않는다.**
  "다른 사람이 보면 어떡하나" 는 이 앱의 문제가 아니다. 애초에 다른 사람이 들어오지 못한다.
- 대시보드 인사말은 계정 이름을 쓰지 않고 **`도코` 로 고정**돼 있다. Google 계정 표시 이름이
  바뀌어도 화면이 흔들리지 않게 한 것이니 `member.displayName` 으로 되돌리지 않는다.

**팀원과 나누는 경로는 발표 세션(`/s/CODE`) 하나뿐이다.** 회의나 발표 자리에서 준비자료를
HTML 로 보여주려고 만든 기능이고, 로그인 없이 열리는 유일한 화면이다. 즉 이 앱은
`타인 접속 차단`(4장)과 `팀원 공유`(4.1장)를 **서로 다른 두 경로**로 푼다. 하나로 합치려
들지 않는다 — 공유가 필요하면 세션 코드를 늘리는 방향이지, 로그인 문턱을 낮추는 방향이 아니다.

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
Google 로그인 → 규칙이 config/access 목록 대조 → members/{uid} 생성 → 데이터 접근 허용
                                 아니면 거부 → 세션 코드 입력 화면
```

**이 저장소는 공개다.** 계정 주소, 개인 정보, 실제 업무 내용을 파일에 적지 않는다.
허용 계정 목록을 규칙 파일이 아니라 Firestore 에 둔 것도 그래서다.
문서에 예시가 필요하면 `name@example.com` 같은 가짜 값을 쓴다.

에이전트가 지켜야 할 것:

- 권한 관련 변경을 제안할 때는 **규칙 파일을 먼저 읽는다.** 클라이언트 쪽 조건문만
  추가하는 해결책은 제안하지 않는다. 브라우저 코드는 우회 가능하다.
- 규칙 맨 아래의 `match /{document=**} { allow read, write: if false; }` 는 지운다는 선택지가
  없다. 새 컬렉션을 추가하면 그 위에 명시적 `match` 블록을 쓴다.
- `.env` 의 `VITE_FIREBASE_*` 값은 비밀키가 아니라 공개 식별자다. 노출을 걱정해 난독화하거나
  런타임에 숨기려 들지 않는다. 대신 규칙을 조인다.
- 실제 비밀값(서비스 계정 키, Admin SDK 자격증명)은 이 저장소에 절대 두지 않는다.
- `.env` 는 `.gitignore` 에 있다. 커밋 스테이징 전에 `git status` 로 확인한다.
- 규칙을 고쳤으면 배포해야 반영된다. `.firebaserc` 가 있어 `--project` 는 필요 없다.

```bash
npx firebase-tools deploy --only firestore:rules
```

- **허용 계정은 규칙 파일에 적지 않는다.** `config/access` 문서의 `emails` 배열에 있고,
  앱 설정 화면에서 관리한다. 규칙 안의 `get()` 은 클라이언트 읽기 권한을 우회하므로
  비멤버가 그 문서를 못 읽어도 검사는 동작한다. 문서가 없으면 아무도 가입하지 못한다.

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
  불러줘야 하기 때문이다. 같은 이유로 길이는 **4자**(`CODE_LEN`)다. 30^4 = 810,000 가지라
  무작위 대입 여지가 있다는 것을 알고 고른 값이니, 짧다는 이유로 되돌리지 않는다.
  대신 발표가 끝난 세션은 닫거나 짧은 유효기간을 준다.
- **코드 입력 화면은 어떤 반응도 하지 않는다.** 자릿수 안내, 잘못된 글자 안내, 실패 사유
  구분이 전부 없다. 열리지 않는 코드는 조용히 입력 화면으로 되돌아올 뿐이다.
  비로그인 방문자에게 실패는 어차피 전부 `permission-denied` 로 오고(코드가 틀렸든 없든
  닫혔든 만료됐든), `fetchSession()` 이 이를 `not-found` 로 뭉뚱그리는 것도 의도다.
  사용자 친절을 이유로 "존재하지만 만료됨" 같이 구분해서 알려주면 세션 존재 여부가 샌다.
- 입력창에 예시 코드를 `placeholder` 로 넣지 않는다. 코드 형태에 대한 힌트도 주지 않는다.
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
| 허용 계정 | Firestore `config/access` 문서에서 관리 (앱의 설정 화면) |

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

- **이모지를 쓰지 않는다.** 코드, 마크업, 화면 문구, 제목, alt 텍스트, 파비콘 어디에도.
  아이콘이 필요하면 [src/components/Icon.tsx](src/components/Icon.tsx) 에 인라인 SVG 를
  추가한다. Lucide·Feather·Heroicons 같은 아이콘 라이브러리도 들이지 않는다
  (의존성 규칙이자 `minimalist-ui` 스킬의 요구사항). `✓` 같은 기호도 쓰지 말고 글자로 쓴다.
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

### 6.1 설치된 스킬

`.claude/skills/` 에 20개가 있다. 세션 시작 시 자동으로 목록에 오른다.

| 출처 | 개수 | 성격 |
| --- | --- | --- |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | 4 | 과설계를 줄이는 코딩 모드 |
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | 1 | `minimalist-ui` |
| [obra/superpowers](https://github.com/obra/superpowers) | 6 | 개발 방법론(브레인스토밍, 계획, TDD, 디버깅, 검증) |
| [mattpocock/skills](https://github.com/mattpocock/skills) | 9 | 엔지니어링·생산성 워크플로 |

전부 MIT 라이선스다. 상시 로드되는 건 프론트매터(이름·설명)뿐으로 합계 1,300 토큰 안팎이고,
본문은 실제로 호출할 때만 읽힌다. 개수보다 **설명이 겹쳐 엉뚱한 걸 고르는 것**이 실질적 비용이다.

**처음에 37개를 넣었다가 17개를 뺐다.** 기준은 겹침과 이 저장소에서의 실효성이다.

- 다른 스킬을 부르기만 하는 한 줄 래퍼 — `grill-me`, `grill-with-docs`, `implement`, `ask-matt`
- 같은 일을 하는 짝에서 하나씩 — `tdd`(`test-driven-development` 와 중복),
  `diagnosing-bugs`(`systematic-debugging` 과 중복),
  `improve-codebase-architecture`(`codebase-design` 과 중복),
  `redesign-existing-projects`(`minimalist-ui` 와 중복)
- 이슈 트래커를 전제하는 워크플로 — `to-spec`, `to-tickets`, `triage`, `wayfinder`.
  이 저장소는 GitHub Issues 를 쓰지 않는다
- 이 저장소의 방침과 어긋나는 것 — `finishing-a-development-branch`(브랜치를 따지 않고
  `main` 에 직접 push 한다), `using-superpowers`(아래 참고)
- 기능이 없는 것 — `ponytail-gain`(벤치마크 홍보), `ponytail-help`(레퍼런스 카드), `teach`

되살리려면 원본 저장소에서 그 디렉터리만 다시 복사하면 된다. git 이력에도 남아 있다.

처음부터 넣지 않은 것 — 리뷰어와 주고받는 워크플로
(`requesting-code-review`, `receiving-code-review`), 멀티 에이전트
(`dispatching-parallel-agents`, `subagent-driven-development`), `using-git-worktrees`,
스킬 저작용(`writing-skills`, `writing-great-skills`).

**이 프로젝트에 맞게 조정한 것들** — 스킬이 서로, 또는 이 문서와 부딪히는 지점이다.

- `minimalist-ui` 는 랜딩 페이지를 전제로 쓰인 부분이 있다(히어로 섹션, `py-24` 급 여백,
  스크롤 진입 애니메이션, 앰비언트 그라디언트). 이 앱은 밀도 높은 업무 도구이므로
  그 항목들은 따르지 않는다. 색·타이포·테두리·간격 원칙만 가져온다.
- `test-driven-development` 는 모든 변경에 테스트를 먼저 쓰라고 한다. 이 저장소에는
  테스트 러너가 없다(5장). 러너를 들이기 전까지는 자동으로 따르지 않는다.
  쓰려면 Vitest 도입이 먼저다.
- `ponytail` 은 "테스트도 YAGNI" 쪽, `test-driven-development` 는 "항상 먼저" 쪽이다.
  정면으로 부딪힌다. 둘 다 켜지 말고, 작업 성격에 따라 하나만 고른다.
- `executing-plans` 는 본문을 **직접 고쳤다.** 원본이 요구하던 워크트리 격리,
  `finishing-a-development-branch` 호출, "main 에서 구현 시작 금지" 를 뺐다.
  전부 1.1 의 push 방침과 어긋나거나 설치하지 않은 스킬을 가리키는 항목이었다.
  원본 저장소에서 이 스킬을 다시 복사하면 그 셋이 되살아나니 그때 다시 뺀다.
- `using-superpowers` 는 어떤 응답보다 먼저 스킬을 호출하라고 강하게 요구했다.
  이 프로젝트 규모에 과해서 뺐다. 나머지 스킬은 필요할 때 개별로 부르면 그대로 동작한다.

**의도적으로 설치하지 않은 것**

- `taste-skill` 계열 — GSAP·Tailwind·Motion 전제. 순수 CSS 에 의존성 6개 유지와 충돌
- `git-guardrails-claude-code`(mattpocock) — `git push` 를 훅으로 차단한다. 1.1 의 push
  허용 정책을 정면으로 되돌린다
- mattpocock 의 `deprecated/`, `in-progress/`, `personal/`(옵시디언·글쓰기),
  `migrate-to-shoehorn`, `scaffold-exercises` — 이 프로젝트와 무관
- 각 스킬의 `agents/openai.yaml` — 다른 런타임용

일부 스킬에는 실행 스크립트가 딸려 있다(`brainstorming/scripts/`,
`systematic-debugging/find-polluter.sh`). 스킬이 시키더라도 실행 전에 내용을 읽는다.

**설치 방식** — 플러그인이 아니라 `.claude/skills/` 에 디렉터리째 복사했다. 그래서
저장소에 함께 커밋되고 git 으로 버전이 남지만, 자동 업데이트는 안 된다. 갱신하려면
원본 저장소에서 다시 복사한다. 참조 문서까지 같이 복사했고, 스킬들이 형제 파일을
상대경로로만 가리키므로(`](writing-good-tests.md)`) 이 방식에서 정상 동작한다.

**훅은 일부러 설치하지 않았다.** 세 저장소의 훅은 전부 `${CLAUDE_PLUGIN_ROOT}` 를
전제로 하는데 여기는 플러그인 설치가 아니라 경로가 맞지 않는다. 기능상으로도
superpowers 훅은 `using-superpowers` 전문을 매 세션에 강제 주입하고, ponytail 훅은
`UserPromptSubmit` 마다 node 프로세스를 띄운다. 스킬을 필요할 때만 부르는 지금 방식이
이 프로젝트에는 맞다. ponytail 을 항상 켜고 싶으면 훅 대신 CLAUDE.md 에 한 줄 적는다.

## 7. 하지 말 것 요약

- 이력을 고쳐 쓰는 push (`--force`, 이미 올라간 커밋의 rebase, 브랜치·태그 삭제)
- 빌드가 깨진 채로 push — `main` push 는 곧 배포다
- 여러 기능을 한 커밋에 몰아넣기
- 영어로 쓴 커밋 설명
- 클라이언트 코드만으로 접근을 막으려는 시도
- 데이터를 계정별로 나누려는 제안 (2.1 참고 — 1인용이라 의도적으로 하나다)
- 지시받지 않은 README.md 수정 (1.4 참고)
- `dist/`, `node_modules/`, `.env` 커밋
- `HashRouter` → `BrowserRouter` 교체
- 이모지 (6장 참고). 아이콘 라이브러리 추가도 마찬가지
- `sessions` 에 멤버 아닌 사람도 되는 목록 질의 추가
- 세션 실패 사유를 방문자에게 구분해서 알려주기 (4.1 참고)
