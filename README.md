# Event Safety Check · 행사안전 체크

학교 축제부터 플리마켓, 야외공연, 전시까지 장소와 인원, 현장 조건을 입력하면 먼저 준비할 안전조치와 문서, 주요 위험요인, 확인할 규정을 안내하는 MCP 서버입니다.

서버는 요청 처리 중 외부 네트워크를 호출하거나 파일을 저장하지 않습니다. 법령·조례·행사장 규정·위험 통제 자료를 메모리에 올려 결정적으로 조회하며, Streamable HTTP를 stateless 방식으로 제공합니다.

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
