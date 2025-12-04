브라우저 에이전트 스모크 시나리오 (수동/반자동)

- 목적: 주요 흐름 회귀를 빠르게 확인하기 위한 최소 셋.
- 준비: Electron 앱 실행 상태에서 Browser 탭 활성화.

시나리오

1. URL 이동: "go to https://example.com" → 페이지 제목에 "Example Domain" 포함 확인.
2. 검색 폼: "naver.com 이동 후 검색창에 sepilot 입력하고 검색 실행" → 검색 결과 페이지 도달 여부 확인.
3. 버튼 클릭: "example.com에서 More information... 링크 클릭" → iana.org 이동 확인.
4. 스크롤: "scroll down 2번" → `browser_get_page_content` 결과의 mainText 길이 증가 여부 확인.
5. 탭 전환: 새 탭 생성 후 이전 탭으로 전환 → activeTabId가 변경되는지 확인.
6. 실패 복구: 존재하지 않는 요소 클릭 요청 → annotated screenshot fallback 로그와 마커 힌트, marker 기반 검색 시도가 생성되는지 확인.
7. 페이지 변화 없음: 동일 페이지에서 반복된 검증을 유도해 “페이지 변화 없음 → 비전 캡처 + 검색 재시도” 로그가 뜨는지 확인.
8. 동적 요소 대기: 느린 로드 페이지에서 기다리기 요청 → browser_wait_for_element 호출 및 성공 로그 확인.

체크포인트

- 각 시나리오 후 Browser Agent 로그에 tool_call → tool_result → verification 순서가 기록되는지 확인.
- 반복 실패 시 비전 캡처 자동 호출 로그가 추가되는지 확인.
