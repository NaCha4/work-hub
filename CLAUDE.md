# CLAUDE.md

이 저장소의 작업 규칙은 [AGENTS.md](AGENTS.md) 에 있다. 작업 전에 반드시 읽는다.

특히 다음 세 가지는 예외 없이 지킨다.

1. **`main` push 는 곧 배포다.** `npm run build` 가 통과한 상태에서만 push 한다.
   이력을 고쳐 쓰는 push(`--force`, 올라간 커밋의 rebase, 삭제)는 먼저 물어본다.
2. 커밋은 **기능 단위**로, 메시지는 Conventional Commits 형식에 **한국어 설명**으로 쓴다.
3. 세션 시작 시 원격에 받아올 것이 있으면 `git pull --ff-only` 로 먼저 반영한다.
