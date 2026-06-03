# Claude Reset Notifier

Claude 세션 시작 시 사용량 갱신 시각을 자동으로 알려주는 유틸리티.

## 구성 요소

- **Chrome Extension** — claude.ai에서 메시지 전송 감지 → 리셋 시각 알림 + 카운트다운
- **Claude Code Hook** — CLI에서 프롬프트 전송 감지 → macOS 시스템 알림

## 설치

### Chrome Extension
1. `chrome://extensions` → 개발자 모드 ON
2. "압축해제된 확장 프로그램 로드" → `extension/` 폴더 선택
3. claude.ai에 로그인 → 메시지 전송 시 자동 동작

### Claude Code Hook
```bash
cd claude-code-hook && bash install.sh
```
