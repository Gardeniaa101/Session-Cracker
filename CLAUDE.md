# Claude Reset Notifier

Chrome Extension + Claude Code Hook으로 Claude 세션 리셋 시각을 자동 알림하는 유틸리티.

## 프로젝트 구조

- extension/ — Chrome Extension (Manifest V3)
- claude-code-hook/ — Claude Code CLI Hook 스크립트
- app/ — macOS/iOS 네이티브 앱 (Phase 2~3, 아직 미구현)

## 기술 제약

- extension/background.js는 Manifest V3 Service Worker. window 객체 사용 금지, self만 사용. 모든 상태는 chrome.storage.local에 저장.
- Chrome Extension API 호출은 반드시 비동기(async/await 또는 callback). Service Worker는 Chrome이 언제든 종료시킬 수 있으므로 인메모리 상태 불가.
- claude-code-hook/은 Node.js 18+ 환경. 외부 의존성 없이 내장 fetch, fs, child_process만 사용.
- 포인트 색상: #d97757 (Claude 브랜드 주황)

## 검증 방법

- Extension: chrome://extensions 개발자 모드에서 로드 후 claude.ai에서 테스트
- Hook: Claude Code에서 프롬프트 전송 후 macOS 알림 확인

## 규칙

- 비공식 API(claude.ai/api/organizations/*/usage)는 언제든 변경 가능 — 모든 API 호출에 try-catch + calculated 폴백 필수
- API 응답 파싱은 optional chaining 사용 (response?.five_hour?.resets_at)
- 알림 메시지에서 source가 calculated이면 반드시 "약 ~경 (추정)" 형식으로 표시
- CSS/UI에서 하드코딩된 색상 대신 변수 사용. 포인트 색상만 #d97757 직접 사용
