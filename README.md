# Event Safety Check · 행사안전 체크

학교 축제부터 플리마켓, 야외공연, 전시까지 장소와 인원, 현장 조건을 입력하면 먼저 준비할 안전조치와 문서, 주요 위험요인, 확인할 규정을 안내하는 MCP 서버입니다.

기본 모드는 요청 처리 중 외부 네트워크를 호출하거나 파일을 저장하지 않습니다. 법령·조례·행사장 규정·위험 통제 자료를 메모리에 올려 결정적으로 조회하며, Streamable HTTP를 stateless 방식으로 제공합니다.

## 실행

Bun이 필요합니다.

```bash
bun install
bun run typecheck
bun test
bun run build
bun run start
```

기본 주소는 `http://0.0.0.0:8080`입니다. 포트를 바꾸려면 `PORT` 환경변수를 지정합니다.

```bash
PORT=9000 bun run start
curl http://127.0.0.1:9000/health
```

MCP endpoint는 `POST /mcp`, 상태 확인 endpoint는 `GET /health`입니다. `/mcp`의 GET과 DELETE는 stateless 서버에서 지원하지 않습니다.

## 공개 도구

서버에는 다음 6개 도구만 등록됩니다.

| 도구 | 용도 |
| --- | --- |
| `assess_event_safety` | 행사 조건별 우선 행동, 문서, 위험, 적용·비적용 후보 진단 |
| `create_event_safety_plan` | 13개 섹션의 안전관리계획 Markdown 초안 생성 |
| `review_event_safety_plan` | 계획의 누락, 조건 불일치, 과도한 기준 적용 검수 |
| `search_event_venues` | KOPIS 오프라인 공연시설 인덱스에서 행사장 검색 |
| `get_event_venue_rules` | 지원 행사장의 반입·하역, 구조, 전기, 소방, 부스 규정 조회 |
| `get_event_risk_controls` | 13개 위험 유형의 예방조치와 현장 확인사항 조회 |

모든 도구는 읽기 전용이며 결과에 데이터 기준일과 면책 안내를 포함합니다. 행사 진단의 `attentionLevel`은 법적 적합성 점수가 아니라 추가 검토 필요도를 나타냅니다.

## 확장 도구

핵심 도구 6개에 더해 다음 도구 6개가 기본으로 함께 등록되어 총 12개가 노출됩니다.

| 도구 | 용도 |
| --- | --- |
| `create_event_checklist` | 진단 결과를 담당자·상태가 있는 체크리스트로 저장 |
| `update_checklist_item` | 체크리스트 상태, 담당자, 기한, 메모 변경 |
| `get_event_checklist` | 요약·전체·팀 공유 형식으로 체크리스트 조회 |
| `export_event_documents` | 계획서·체크리스트·근거를 응답 내 Markdown 문서 묶음으로 반환 |
| `add_event_to_calendar` | 결정적인 UID와 알림이 있는 RFC 5545 ICS 텍스트 생성 |
| `get_event_day_conditions` | 설정된 외부 연계와 오프라인 기상악화 통제책 조회 |

```bash
bun run start                  # 12개 도구 (기본)
EXTENDED_TOOLS=0 bun run start # 핵심 6개 도구로 제한
```

체크리스트는 행사명만 알아도 초안을 만들 수 있습니다. 생성 결과는 1부터 시작하는 번호로 표시되며, 후속 대화에서 내부 ID 없이 번호나 항목명으로 수정할 수 있습니다.

```text
사용자: 한강 플리마켓 체크리스트 만들어줘.
사용자: 1번은 김안전 담당으로 완료 처리해줘.
```

| 환경변수 | 역할 | 미설정 시 동작 |
| --- | --- | --- |
| `EVENT_STORE_PATH` | 체크리스트 JSON 저장 경로 | 프로세스 메모리에만 저장하며 파일을 쓰지 않음 |
| `KOPIS_SERVICE_KEY` | 공연·축제 카탈로그 연계 | 당일 조건 도구가 오프라인 안내 반환 |
| `TOUR_API_SERVICE_KEY` | 관광공사 행사·축제 연계 | 당일 조건 도구가 오프라인 안내 반환 |
| `NEMC_SERVICE_KEY` | 응급의료기관 연계 | 당일 조건 도구가 오프라인 안내 반환 |

외부 키가 모두 없으면 `get_event_day_conditions`는 네트워크를 호출하지 않고 기상악화 대비 체크리스트를 반환합니다. `EVENT_STORE_PATH`를 설정했을 때만 체크리스트 저장소가 JSON 파일을 읽고 원자적으로 갱신합니다. 문서 내보내기와 캘린더 도구는 파일을 만들지 않고 응답 문자열만 반환합니다.

> 확장 도구를 포함해도 기본 설정에서는 파일 쓰기와 외부 네트워크 호출이 없습니다. 체크리스트는 프로세스 메모리에 저장되며, `EVENT_STORE_PATH`·외부 API 키를 설정했을 때만 각각 파일 저장·실시간 연계가 활성화됩니다. 핵심 6개만 노출해야 하는 환경에서는 `EXTENDED_TOOLS=0`을 설정하세요.

MCP Inspector GUI 화면 대신 재현 가능한 CLI 텍스트 세션을 [docs/examples/inspector-session.md](docs/examples/inspector-session.md)에 기록합니다. 대표 질의 10개의 실제 응답은 [docs/examples/representative-queries.md](docs/examples/representative-queries.md)에 있습니다.

## Docker

```bash
docker build -t event-safety-check-mcp .
docker run --rm -p 8080:8080 event-safety-check-mcp
curl http://127.0.0.1:8080/health
```

이미지에는 실행에 필요한 컴파일 결과와 공개 JSON만 포함되며, 원본 PDF·HWP, 내부 변환 문서, 테스트, 개발 문서는 포함하지 않습니다.

## 입력 예시

`assess_event_safety`에 다음과 같은 인자를 전달할 수 있습니다.

```json
{
  "eventName": "학교 축제",
  "eventType": "학교 축제",
  "location": "서울시 학교 운동장",
  "expectedCrowd": 800,
  "outdoor": true,
  "temporaryStructures": true,
  "temporaryElectricity": true,
  "foodService": true
}
```

행사 유형은 `festival`, `outdoor_event`, `exhibition`, `conference`, `performance`, `food_event`, `vip_event` slug나 “학교 축제”, “플리마켓”, “야외공연” 같은 일반 표현으로 입력할 수 있습니다. 필수 판단 정보가 부족하면 한 번에 최대 3개 질문을 반환합니다.

## 데이터와 신뢰성

데이터 기준일은 **2026-05-31**입니다. 법령·조례·행사장 규정은 수시로 바뀌므로 제출이나 시행 전 최신 원문과 관할기관·행사장 답변을 확인해야 합니다.

내부 신뢰성은 기존 한국 MICE 안전 온톨로지의 법령 레지스트리, 지자체 조례 팩, KOPIS 시설 인덱스, 행사장 시설 요약, 위험·통제 및 작업자 안전 연결 구조를 그대로 재사용합니다. 공개 응답은 이를 일반 행사 용어로 바꾸고 조건과 관계없는 공연·식품·LPG·경비 기준을 비적용 항목으로 구분합니다.

주요 출처에는 법제처 국가법령정보센터, 행정안전부 지역축제·다중운집 자료, 문화체육관광부·KOPIS 시설 정보, 한국관광공사 안전관리 자료, 행사장 공식 운영 자료가 포함됩니다. 각 결과는 출처 URL과 검증 상태를 가능한 범위에서 함께 제공합니다.

## 주의

행사안전 체크는 현장 의사결정 보조 도구입니다. 법률 자문, 허가 가능 여부, 관할기관의 최종 판단, 행사장 승인, 경찰·소방·의료 협의를 대신하지 않습니다.
