# 2차 구현 지시서: P1 잔여 + P2 (본선 기능)

> 전제: `docs/plans/implementation-plan.md`(1차)가 구현·검증 완료된 상태다. 이 문서는 PRD §21의 P1 잔여 항목과 P2 전체를 다룬다.
> 1차의 하드 룰 유지: `src/tools/`, `src/lib/`, `src/ontology/`, `src/config/constants.ts`, `src/tool-registry.ts`, NOTICE.md, LICENSE 수정 금지. bun만 사용.

## 0. 핵심 설계 결정

1. **예선 제출물 보호가 최우선.** 기본 실행(플래그 없음)에서는 지금과 완전히 동일하게 동작해야 한다: `/mcp`에 도구 정확히 6개, stateless, 파일 쓰기 없음, 네트워크 호출 없음. 기존 테스트 20개는 수정 없이 계속 통과해야 한다 (깨지면 안 됨).
2. P2 기능은 **환경변수 `EXTENDED_TOOLS=1`일 때만** 추가 도구 6개를 등록한다 (총 12개). `/health`의 `tools` 값도 이에 따라 6/12로 반영.
3. P2 상태 저장은 원본의 무거운 사고지휘 스토어(`mice-operations-store.ts`, homedir 파일·해시체인)를 쓰지 않고, **새로 만드는 경량 체크리스트 스토어**를 쓴다. 이유: P2 범위는 체크리스트/공유/캘린더이지 사고 지휘가 아니고, 기본값에서 디스크를 건드리면 안 되기 때문.
4. 외부 실시간 연계는 원본 `src/lib/mice-public-api-clients.ts`(KOPIS_SERVICE_KEY, TOUR_API_SERVICE_KEY, NEMC_SERVICE_KEY, env 미설정 시 warning 반환)를 재사용한다.
5. 서버명·도구명·설명에 `kakao` 문자열 금지는 P2에도 그대로 적용된다. "체크리스트 위젯"은 범용 위젯 JSON으로 표현한다.

## 1. P1 잔여 항목

### 1.1 근거 표시 개선
- `presenters/action-summary.ts`: 출처를 `[S1]`, `[S2]` 번호로 각 항목 끝에 표기하고, 마지막 "근거 자료" 섹션에 `[S1] 제목 — URL (기준일, 검증 상태)` 목록을 出력. topActions·requiredDocuments·riskControls의 각 항목에 해당 근거 번호를 연결.
- basisType 표기를 4종으로 통일: `법정 의무 후보` / `지자체 조례` / `행사장 규정` / `권장`.

### 1.2 결과 크기 최적화
- `config/limits.ts`에 상수 추가: `MAX_SOURCES=12`, `MAX_APPLICABLE=10`, `MAX_NOT_APPLICABLE=8`, `MAX_PLAN_BULLETS_PER_SECTION=8`.
- assess/plan structuredContent에서 중복 source 제거(이미 있으면 유지), 항목별 텍스트 200자 초과 시 말줄임.
- plan markdown 섹션당 불릿 상한 적용.

### 1.3 대표 예시 데이터
- `docs/examples/representative-queries.md`: PRD §20의 대표 질문 3개 + 시나리오 7개(총 10개)에 대해 **실제 서버를 돌려 얻은 실제 응답 전문**(markdown)을 수록. 구현 후 서버를 켜고 curl로 캡처해 채울 것 — 손으로 지어내지 말 것.
- `docs/examples/inspector-session.md`: MCP Inspector CLI 실행 명령과 tools/list 실제 출력 수록. (스크린샷은 GUI가 없어 텍스트 세션 기록으로 대체 — README에 그렇게 명시)

### 1.4 응답 문장 단순화 추가 패스
- assess/plan/review markdown에서 한 문장 40자 초과 항목을 점검해 단문화. 법령명은 그대로 두되 설명문은 "~하세요" 체로 통일.

## 2. P2 기능 (EXTENDED_TOOLS=1 전용 도구 6개)

### 2.0 체크리스트 스토어 — `src/lib-public/checklist-store.ts` (신규 디렉터리, src/lib 수정 금지 때문)
- 모듈 레벨 싱글턴 `Map<eventKey, EventChecklist>`.
- `eventKey`: 입력 eventName+date로 만든 짧은 슬러그 + 4자 해시 (예: `school-festival-2026-09-12-a3f2`). 충돌 시 suffix 증가.
- `EventChecklist`: `{ eventKey, eventName, eventDate?, organizer?, createdAt, updatedAt, profile(입력 요약), items: ChecklistItem[] }`.
- `ChecklistItem`: `{ id, title, category(문서|위험통제|사전협의|당일운영), basisType, sourceRef?, status: "todo"|"in_progress"|"done"|"not_applicable", assignee?, dueBy?, note?, updatedAt }`.
- 영속화: `EVENT_STORE_PATH` env가 설정된 경우에만 JSON 파일로 저장(임시파일 후 rename 원자적 쓰기, 시작 시 로드). 미설정 시 순수 인메모리. 이벤트 최대 200개 LRU 초과 시 가장 오래된 것 제거.
- `createdAt` 등 타임스탬프는 `new Date().toISOString()` 사용 (서버 런타임이므로 허용; 단 결정성 테스트에서 타임스탬프 필드는 비교 제외).

### 2.1 `create_event_checklist` (쓰기)
- 입력: assess와 동일 + `eventDate`, `organizer`.
- 처리: 내부적으로 assess 어댑터 실행 → topActions/requiredDocuments/riskControls를 ChecklistItem으로 펼쳐 스토어에 저장.
- 출력: `{ eventKey, itemCount, widget, meta }` + markdown 체크리스트. `widget`은 범용 위젯 JSON:
  ```json
  { "type": "checklist", "title": "행사명 안전 체크리스트", "eventKey": "...",
    "items": [{ "id": "...", "label": "...", "checked": false, "assignee": null, "dueBy": null, "category": "문서" }] }
  ```
- annotations: `readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:false`.

### 2.2 `update_checklist_item` (쓰기)
- 입력: `eventKey`(req), `itemId`(req), `status?`, `assignee?`, `dueBy?(YYYY-MM-DD)`, `note?`.
- 담당자 배정과 완료 상태 저장을 이 도구 하나로 처리. 존재하지 않는 키/항목이면 안내 메시지(isError 아님)와 현재 항목 목록 반환.
- annotations: readOnly=false, idempotent=false.

### 2.3 `get_event_checklist` (읽기)
- 입력: `eventKey`(req), `format?: "summary"|"full"|"share"` (기본 summary).
- `share`: 팀 공유용 스냅샷 — 완료율, 미완료 항목, 담당자별 현황을 붙여넣기 좋은 markdown으로.
- 출력에 widget JSON 포함. annotations: readOnly=true, idempotent=true.

### 2.4 `export_event_documents` (읽기)
- 입력: assess 입력과 동일(+`eventKey?` — 있으면 체크리스트 현황 포함).
- 처리: 안전관리계획 markdown(1차 create_event_safety_plan 재사용) + 체크리스트 + 근거 목록을 하나의 문서 번들로 합쳐 **응답으로만** 반환. 파일 쓰기 금지. `structuredContent.documents[]`에 `{id, title, markdown}` 배열.
- annotations: readOnly=true, idempotent=true.

### 2.5 `add_event_to_calendar` (읽기)
- 입력: `eventName`(req), `eventDate`(req, YYYY-MM-DD), `location?`, `eventKey?`, `reminders?: number[]`(행사 D-일 기준 며칠 전 알림, 기본 [7,1]).
- 처리: RFC 5545 ICS 텍스트 생성(VEVENT + 준비 마감용 VALARM). 외부 호출 없음. UID는 eventKey 기반 결정적 생성.
- 출력: `structuredContent.ics`(문자열) + "이 내용을 .ics 파일로 저장해 캘린더에 등록하세요" 안내 markdown.
- annotations: readOnly=true, idempotent=true.

### 2.6 `get_event_day_conditions` (읽기, 외부 네트워크)
- 입력: `eventDate`(req), `location?`, `venueId?`.
- 처리: 원본 `src/lib/mice-public-api-clients.ts`·`live-operations-adapters.ts`를 재사용해 기상특보·재난문자·(가능 시)혼잡 정보를 조회. **env 키 미설정 시 에러가 아니라** "실시간 연계를 쓰려면 KOPIS_SERVICE_KEY / TOUR_API_SERVICE_KEY / NEMC_SERVICE_KEY를 설정하세요" 안내와 오프라인 기상악화 대비 체크리스트(get_event_risk_controls의 severe_weather 재사용)를 반환.
- annotations: readOnly=true, idempotent=false, **openWorldHint:true** (유일한 예외 — 외부 API 호출 도구이므로).

### 2.7 등록
- `src/public-tools/registry.ts`: `PUBLIC_TOOLS`(6개)는 그대로 두고 `EXTENDED_TOOLS_SET`(6개) 추가. `registerPublicTools(server)`가 `process.env.EXTENDED_TOOLS === "1"`일 때 둘 다 등록.
- `/health`: `tools` 필드를 실제 등록 수로, `extended: true|false` 필드 추가.

## 3. 테스트 추가 (기존 20개 무수정 통과 + 신규)

`tests/extended-tools.test.ts`:
1. 플래그 off: tools/list 6개 (기존 http 테스트로 커버되면 생략 가능하되 명시적으로 1개 추가)
2. 플래그 on(테스트에서 env 주입): tools/list 12개, 신규 6개 annotations 확인 (get_event_day_conditions만 openWorld=true)
3. create → get: itemCount>0, widget.items 길이 일치, 체크리스트 카테고리 4종 유효
4. update: status=done + assignee 배정 → get에서 반영, 완료율 계산 정확
5. 존재하지 않는 eventKey → isError 아님 + 안내 메시지
6. add_event_to_calendar: ICS에 BEGIN:VCALENDAR/VEVENT/VALARM 포함, 같은 입력 → 같은 UID
7. export_event_documents: documents 배열에 계획서+체크리스트 포함, 파일 시스템 쓰기 없음
8. get_event_day_conditions (키 미설정): isError 아님, 안내 + severe_weather 통제책 포함
9. EVENT_STORE_PATH 설정 시: create 후 프로세스 내 재로드로 데이터 유지 (스토어 모듈 함수 직접 테스트)

`tests/quality-gates.test.ts` 추가 어서션:
- assess markdown에 `[S1]` 근거 번호와 "근거 자료" 섹션 존재
- structuredContent sources ≤ MAX_SOURCES

## 4. 문서

- README: "확장 모드 (본선 기능)" 섹션 — EXTENDED_TOOLS=1, EVENT_STORE_PATH, 외부 API 키 3종 표. 예선 제출 시 플래그를 켜지 않는다는 주의 문구.
- `docs/examples/` 2개 파일 (1.3 참조 — 실제 출력으로).
- Dockerfile 수정 불필요 (env로 제어).

## 5. 완료 정의

```bash
bun run typecheck && bun test && bun run build   # 기존 20 + 신규 전부 통과
# 플래그 off 서버: /health tools=6, tools/list 6개 (기존과 동일)
# EXTENDED_TOOLS=1 서버: /health tools=12, tools/list 12개
```
- 기존 1차 테스트 파일은 한 줄도 수정하지 않는다 (quality-gates에 어서션 추가는 허용).
- 기본 실행 경로에서 fs 쓰기·네트워크 호출이 없음을 코드 리뷰로 확인.
- 커밋 단위: store / P2 tools+registry / P1 개선 / tests / docs·examples.
