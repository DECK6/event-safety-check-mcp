# 구현 지시서: event-safety-check-mcp v0.1.0

> 이 문서는 `docs/PRD.md`를 실제 코드로 옮기기 위한 설계·구현 지시서다.
> 설계: Claude Fable 5 / 구현: Codex. PRD와 이 문서가 충돌하면 이 문서를 따르고, 판단이 어려우면 PRD를 보라.

## 0. 컨텍스트

이 저장소는 `korea-mice-safety-agent`(GitHub DECK6/korea-mice-safety-agent@2546865)의 공개 패키지 경계만 복사한 것이다. 원본 도메인 로직(`src/lib/`, `src/ontology/`, `src/tools/`)은 **수정하지 않고** 어댑터로 감싼다. 원본 저장소 자체(`../korea-mice-safety-agent`)는 절대 건드리지 않는다.

핵심 산출물: PlayMCP에 제출할 **Stateless Streamable HTTP MCP 서버**. 노출 도구는 정확히 6개.

## 1. 기존 코드에서 재사용할 것 (수정 금지, import만)

| 재사용 대상 | 위치 | 용도 |
|---|---|---|
| `queryMiceSafetyApplicabilityTool` | `src/tools/query-mice-safety-applicability.ts` | assess 어댑터의 코어 |
| `generateMiceSafetyPlanTool` | `src/tools/generate-mice-safety-plan.ts` | plan 어댑터의 코어 |
| `reviewMiceSafetyPlanTool` | `src/tools/review-mice-safety-plan.ts` | review 어댑터의 코어 |
| `queryPerformanceVenuesTool` | `src/tools/query-performance-venues.ts` | venue 검색 어댑터의 코어 |
| `queryMiceVenueSafetyRulesTool` | `src/tools/query-mice-venue-safety-rules.ts` | venue 규정 어댑터의 코어 |
| `queryMiceHazardControlsTool` | `src/tools/query-mice-hazard-controls.ts` | 위험 통제 어댑터의 코어 |
| `baseMiceEventInputSchema` | `src/lib/mice-event-input-schema.ts` | 내부 입력 타입 |
| `MICE_DATA` 및 조회 함수 | `src/lib/mice-data.ts` | 필요 시 보조 조회 |
| `McpToolResult`, `ToolDefinition` | `src/lib/types.ts` | 타입 |
| `COMMON_RESPONSE_META`, `DATA_AS_OF` | `src/config/constants.ts` | 데이터 기준일 |
| `extractRawShape` 패턴 | `src/tool-registry.ts` | zod → registerTool 변환 참고 |

기존 도구 핸들러는 `tool.handler(input)`을 직접 호출해 `McpToolResult`(markdown text + `structuredContent`)를 받는다. 어댑터는 **입력을 내부 스키마로 변환 → 핸들러 호출 → `structuredContent`를 PRD 데이터 계약으로 재구성 → 사용자 친화 Markdown 재작성** 순서로 동작한다.

기존 `src/tool-registry.ts`(33개 도구)는 삭제하지 말되 **새 서버에서 import하지 않는다**.

## 2. 신규 파일 구조 (PRD §15)

```text
src/
  adapters/
    event-input-adapter.ts    # 공개 입력 → MiceEventInput 변환, missingInputs 계산
    event-result-adapter.ts   # 내부 structuredContent → PRD §14 계약 변환, attentionLevel 산정
  public-tools/
    assess-event-safety.ts
    create-event-safety-plan.ts
    review-event-safety-plan.ts
    search-event-venues.ts
    get-event-venue-rules.ts
    get-event-risk-controls.ts
    registry.ts               # PUBLIC_TOOLS 배열 (정확히 6개) + registerPublicTools(server)
  presenters/
    action-summary.ts         # assess 결과 → §13 순서의 Markdown
    plan-markdown.ts          # plan 결과 후처리 (용어 치환)
    review-markdown.ts        # review 결과 → 3단계 판정 Markdown
    terms.ts                  # MICE 용어 → 일반 용어 치환 테이블 & sanitize 함수
  server/
    mcp-server.ts             # McpServer 생성 + 6개 도구 등록 (annotations 포함)
    http.ts                   # Streamable HTTP 서버 (stateless), /mcp + /health
    main.ts                   # 엔트리포인트: http.ts 기동
  config/
    limits.ts                 # 본문 크기 제한, 결과 개수 제한 상수
    public-version.ts         # SERVICE_NAME/VERSION(0.1.0)/META/디스클레이머
```

주의: PRD §15는 `tools/`에 신규 파일을 두라고 하지만 기존 원본 도구가 이미 `src/tools/`에 있으므로 충돌 방지를 위해 `src/public-tools/`를 사용한다(의도적 이탈).

## 3. 6개 공개 도구 사양

공통 사항:
- 모든 도구 `ToolDefinition` 형식 재사용.
- `registerPublicTools`는 `server.registerTool(name, { title, description, inputSchema, annotations }, handler)` 형태로 등록하고, **annotations를 반드시 전달**한다:
  ```json
  { "readOnlyHint": true, "destructiveHint": false, "idempotentHint": true, "openWorldHint": false }
  ```
- description은 영문 기본 + 서비스명 병기. 예: `"... using Event Safety Check(행사안전 체크), an offline Korean event-law, venue-rule, hazard-control, and checklist knowledge base."`
- 서버명·도구명·설명에 `kakao` 문자열 금지.
- 모든 결과 `structuredContent.meta`:
  ```json
  { "service": "Event Safety Check(행사안전 체크)", "version": "0.1.0", "dataDate": "2026-05-31", "disclaimer": "<기존 constants.ts 디스클레이머 재사용>" }
  ```
- 에러 시 내부 경로·스택 노출 금지. zod 에러는 "입력값을 확인해 주세요: <필드명>" 수준으로 요약.

### 3.1 `assess_event_safety`

- 입력 스키마 (zod, 모두 optional — 부족하면 missingInputs로 질문 유도):
  ```
  eventName, eventType(enum: festival|outdoor_event|exhibition|conference|performance|food_event|vip_event 배열 또는 자유 문자열 배열),
  location(문자열: 장소/관할 지역), venueId, expectedCrowd(int>=0), outdoor(bool),
  roadUse, temporaryStructures, temporaryElectricity, lpgUse, foodService,
  performance, setupTeardown, workAtHeight, heavyObjectHandling,
  personalDataProcessing(개인정보·CCTV), vipSecurity, unhostedCrowd
  ```
  각 필드 `.describe()`는 한글 일반 용어로 (예: "임시로 설치하는 무대·천막·부스 등이 있으면 true").
- 처리: `event-input-adapter`로 `MiceEventInput` 구성(`location` → `jurisdiction`으로 전달) → `queryMiceSafetyApplicabilityTool.handler` 호출.
- 출력 `structuredContent`: PRD §14 계약 그대로.
  - `eventProfile`: 사용자가 입력한 조건 + 시스템 추론 조건(추론 항목은 `inferred: true` 표시).
  - `attentionLevel` 산정 규칙 (법적 점수 아님):
    - `high_review`: expectedCrowd>=3000 또는 unhostedCrowd 또는 roadUse
    - `enhanced`: expectedCrowd>=1000 또는 (temporaryStructures|lpgUse|temporaryElectricity|workAtHeight 중 하나 이상)
    - `basic`: 그 외
  - `topActions`: 어댑터가 내부 applicability 결과의 duties/submission 항목에서 **최대 5개** 선별. 각 항목 `{action, reason, deadline, basisType(법정 의무 후보|조례|베뉴 규정|권장), agency}`.
  - `requiredDocuments`: `{name, category(법정 의무 후보|베뉴 제출 문서|권장 체크리스트|관할기관 확인 필요), basis}` 배열.
  - `riskControls`: 최대 5개 `{risk, why, controls[]}`.
  - `applicableCandidates` / `notApplicable`: 내부 결과의 법령·조례에서 매핑. notApplicable에는 `reason` 필수.
  - `missingInputs`: 아래 우선순위로 **최대 3개** 질문 문자열: ①예상 최대 인원 ②실내·실외와 장소 ③임시무대·전기·가스·식음료 여부.
  - `sources`: `{id, title, url, dataDate, verificationStatus}`.
- Markdown (`presenters/action-summary.ts`): PRD §13 순서 — ①행사 조건 요약(입력/추론 구분) ②이것부터 하세요(≤5) ③필요한 문서 ④주요 위험요인(≤5) ⑤적용하지 않은 항목 ⑥주의사항(데이터 기준일·원문 확인·법률 자문 아님). **MICE, 온톨로지, 컴플라이언스 매트릭스, 적용성 엔진 같은 용어 금지** — `presenters/terms.ts`의 치환 함수를 마지막에 통과시킬 것 (예: "MICE 행사"→"행사", "적용성"→"적용 여부").

### 3.2 `create_event_safety_plan`

- 입력: assess와 동일 + `eventDate(YYYY-MM-DD)`, `organizer`.
- 처리: `generateMiceSafetyPlanTool.handler` 호출 (output: "markdown").
- 출력: PRD §10.2의 13개 섹션 구조로 Markdown 재구성(내부 결과 섹션을 매핑; 부족한 섹션은 내부 structuredContent에서 생성). 파일 생성 금지. `structuredContent`에는 §14 계약 + `planMarkdown` 필드.
- 용어 치환 필수.

### 3.3 `review_event_safety_plan`

- 입력: assess 입력 + `planMarkdown: z.string().min(1).max(50000)` (**50,000자 제한 — PRD §16**). planMarkdown은 required.
- 처리: `reviewMiceSafetyPlanTool.handler` 호출.
- 출력: 내부 findings(severity error/warning/info)를 3단계 판정으로 변환:
  - error → `보완 필요`, warning → `관할기관 확인 필요` 또는 `보완 필요`(근거 명확 시), info/통과 → `확인됨`.
  - `적법`, `허가 가능`, `법적으로 완전함` 표현 금지 (terms.ts sanitize에 금칙어로 추가하고 테스트로 강제).
- `structuredContent`: `{verdictSummary: {확인됨: n, 보완필요: n, 관할확인: n}, findings[], missingItems[], overApplied[], meta}`.

### 3.4 `search_event_venues`

- 입력: `query, region, category, limit: z.number().int().min(1).max(10).default(5)` (**기본 5, 최대 10 — 원본의 max 100/default 20을 좁힌다**).
- 처리: `queryPerformanceVenuesTool.handler`에 limit 그대로 전달.
- 출력: 원본 결과 재사용 가능. 단 markdown 헤더를 "공연시설 검색 결과"→"행사장 검색 결과" 수준으로 일반화하고 meta 교체.

### 3.5 `get_event_venue_rules`

- 입력: `venueId: z.string()` (required; describe에 예시 나열: coex, kintex, bexco, setec, songdo_convensia, ceco, exco, icc_jeju 등 19개), `category` optional.
- 처리: `queryMiceVenueSafetyRulesTool.handler`.
- 출력: 반입·하역/바닥하중/천장고/전기/소방·피난/부스·리깅/식음료/금지행위/제출 문서/출처·확인일 항목으로 재구성. 알 수 없는 venueId면 지원 목록을 안내(에러 아님).

### 3.6 `get_event_risk_controls`

- 입력: `risk: z.enum([...])` — PRD §10.6의 13개 위험을 한국어 그대로 노출하지 말고 **영문 slug enum + 한글 describe**로:

  | slug | 내부 hazard id |
  |---|---|
  | crowd_density | crowd_density_high |
  | entrance_bottleneck | ingress_egress_bottleneck |
  | temporary_structure | temporary_structure_collapse |
  | stage_rigging | temporary_structure_collapse (+ trigger rigging) |
  | temporary_electricity | temporary_electrical_fire_shock |
  | work_at_height | worker_fall_height |
  | heavy_objects | heavy_object_handling |
  | fire_lpg | fire_hazard_hot_work_lpg |
  | food_poisoning | food_poisoning |
  | fire_evacuation | blocked_evacuation_route |
  | medical_emergency | medical_emergency |
  | privacy_cctv | personal_data_cctv_privacy |
  | severe_weather | weather_outdoor_event |

- 처리: hazard id로 `MICE_DATA.hazards`에서 직접 조회(또는 `queryMiceHazardControlsTool.handler`에 매핑값 전달).
- 출력: `{risk, label, whyDangerous, preventiveControls[], onSiteChecks[], legalBasis[], sources[], meta}` + Markdown.

## 4. HTTP 서버 (PRD §16)

`src/server/http.ts`:
- `@modelcontextprotocol/sdk`의 `StreamableHTTPServerTransport`를 **stateless 모드**(`sessionIdGenerator: undefined`)로 사용. 요청마다 `new McpServer(...)` + `new StreamableHTTPServerTransport(...)` 생성 후 `server.connect(transport)` → `transport.handleRequest(req, res, body)` 패턴 (SDK stateless 예제 그대로). 온톨로지 JSON은 모듈 로드 시 1회만 메모리에 올라가므로(기존 `MICE_DATA` 싱글턴) 요청별 서버 생성 비용은 낮다.
- 라우팅 (`node:http` 사용, 외부 프레임워크 금지):
  - `POST /mcp` → MCP 요청. `GET /mcp`, `DELETE /mcp` → stateless이므로 405 JSON-RPC 에러 응답 (SDK 예제 방식).
  - `GET /health` → `200 {"status":"ok","service":"event-safety-check-mcp","version":"0.1.0","tools":6,"dataDate":"2026-05-31"}`.
  - 그 외 404.
- `PORT` env (기본 8080), `0.0.0.0` 바인딩.
- 요청 본문 제한: `config/limits.ts`의 `MAX_BODY_BYTES = 256 * 1024` — 초과 시 413.
- 로그는 `console.error`만 사용 (stdout 오염 금지 습관 유지).
- 에러 응답에 스택/내부 경로 금지.
- SDK 버전: `@modelcontextprotocol/sdk`를 **최신 1.x로 업그레이드**해 protocol `2025-03-26`~`2025-11-25` 범위를 지원하는지 확인. `bun add @modelcontextprotocol/sdk@latest`.

`src/server/main.ts`: http.ts의 `startServer()` 호출 + SIGINT/SIGTERM graceful shutdown.

## 5. package.json / 빌드 (PRD §17)

- `name: "event-safety-check-mcp"`, `version: "0.1.0"`, `description`(영문, Event Safety Check(행사안전 체크) 병기), `bin` 제거 또는 유지 시 이름 변경, `main: build/server/main.js`.
- scripts (**bun 기준**):
  ```json
  {
    "build": "tsc",
    "start": "bun build/server/main.js",
    "dev": "bun src/server/main.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  }
  ```
- 기존 npm scripts 중 scripts/ 디렉터리를 참조하는 것들은 전부 제거(scripts/는 복사 안 됨).
- `docx`, `commander` 의존성: 새 서버 경로에서 사용하지 않으면 제거 가능하나, 기존 도구 파일들이 import하는지 확인(`export-mice-safety-plan-bundle.ts`가 docx 사용, `cli.ts`가 commander 사용). **tsc가 src 전체를 컴파일하므로 의존성은 유지**한다. 삭제하지 말 것.
- `package-lock.json` 삭제, `bun.lock` 커밋.
- tsconfig: 기존 유지. `src/public-tools`, `src/adapters` 등은 include 패턴에 이미 포함됨.

## 6. Dockerfile (PRD §17)

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile
COPY src ./src
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY package.json NOTICE.md LICENSE ./
USER bun
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["bun", "build/server/main.js"]
```
- 온톨로지 JSON은 tsc `resolveJsonModule`로 build/에 복사되는지 확인 — **tsc는 JSON을 outDir로 emit하지 않을 수 있음**. 확인 후 필요 시 build 스크립트에 `cp -R src/ontology build/ontology` 추가. `data/` 디렉터리는 이미지에 **포함하지 않는다** (런타임은 src/ontology JSON만 사용; venue-safety-rules가 data/markdown을 읽는지 grep으로 확인하고, 읽는다면 해당 마크다운 대신 인덱스 JSON 사용 여부를 검증).
- `.dockerignore` 작성: .git, node_modules, build, data, docs, tests, outputs.

## 7. 테스트 (PRD §19) — `tests/`에 bun:test로 작성

기존 `tests/*.test.mjs` 2개는 node --test 형식이므로 **bun:test로 포팅하거나 삭제 후 대체**한다 (원본 로직 검증은 새 테스트로 커버).

`tests/public-tools.test.ts` — 핸들러 직접 호출(HTTP 불필요)로 PRD §19의 10개 시나리오:
1. 800명 학교 축제(무대·푸드트럭·임시전기) → topActions ≤5, requiredDocuments 존재, attentionLevel=enhanced
2. 2,000명 플리마켓(천막·식음료·LPG) → fire_lpg/식품 관련 riskControls 포함, attentionLevel=enhanced
3. 5,000명 야외공연(도로 통제·야간) → attentionLevel=high_review
4. 300명 실내 전시(설치·철거) → worker 안전 항목 포함
5. 800명 컨퍼런스(등록·CCTV) → privacy 관련 문서/위험 포함
6. 40명 실내 워크숍(위험시설 없음) → attentionLevel=basic, topActions에 과잉 항목 없음
7. 주최자 없는 10,000명 운집 → unhostedCrowd → high_review
8. VIP 행사 → security 항목 포함
9. 공연 없는 행사 → notApplicable에 공연법 계열 존재, applicableCandidates에 없음
10. 식음료·LPG 없는 행사 → 식품/LPG 규정이 applicableCandidates·requiredDocuments에 없음

`tests/quality-gates.test.ts`:
- 동일 입력 2회 호출 결과 deep-equal (결정성)
- assess Markdown에 금칙어 없음: `MICE`, `온톨로지`, `적용성 엔진`, `컴플라이언스`
- review 결과에 `적법`/`허가 가능`/`법적으로 완전함` 없음
- review planMarkdown 50,001자 → zod 에러
- search_event_venues 기본 5건·최대 10건
- 모든 도구 결과에 `meta.dataDate`와 sources(해당 시) 존재

`tests/http.test.ts`:
- 서버 기동 → `GET /health` 200
- `POST /mcp` initialize → tools/list 하면 **정확히 6개**, 각 도구에 annotations 4종 존재
- 본문 300KB POST → 413

## 8. 문서 (P1, 시간 남으면)

- README.md 전면 재작성: 서비스 소개(PRD §20), 실행법(bun/docker), 도구 6개 표, 데이터 출처·기준일, 디스클레이머. MICE 용어는 "신뢰성" 섹션에서만.
- NOTICE.md, LICENSE 유지 (수정 금지).

## 9. 완료 정의 (PRD §22 요약)

아래가 모두 통과해야 끝:

```bash
bun install
bun run typecheck   # 에러 0
bun test            # 전부 통과
bun run build
bun run start &     # PORT=8080
curl -s localhost:8080/health   # 200
# MCP initialize + tools/list → 6개 도구 + annotations
```

- 기존 33개 도구는 /mcp에 노출되지 않는다.
- `git status` 기준 원본 저장소(`../korea-mice-safety-agent`)는 변경 0.
- 커밋은 논리 단위로 나눠서 (adapters / public-tools / server / tests / docker).

## 10. 작업 순서 권장

1. package.json + bun 전환, `bun install`, `bun run typecheck` 통과 확인 (기존 코드 그대로 컴파일되는지 먼저 검증)
2. config(limits, public-version) + terms.ts
3. event-input-adapter + event-result-adapter
4. 6개 public-tools + registry
5. presenters
6. server(mcp-server, http, main) + /health
7. tests 3종
8. Dockerfile + .dockerignore
9. README
