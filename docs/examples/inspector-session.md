# MCP Inspector CLI 실제 세션

> GUI 스크린샷 대신 재현 가능한 CLI 텍스트 세션을 기록합니다. 아래 출력은 2026-07-13에 기본 모드 서버를 실행하고 MCP Inspector 0.22.0으로 직접 받은 `tools/list` 전문입니다.

서버 실행:

```bash
PORT=18080 ~/.bun/bin/bun src/server/main.ts
```

Inspector 명령:

```bash
~/.bun/bin/bun x @modelcontextprotocol/inspector --cli http://127.0.0.1:18080/mcp --transport http --method tools/list
```

실제 출력:

```json
{
  "tools": [
    {
      "name": "assess_event_safety",
      "title": "행사 안전 준비 진단",
      "description": "Assesses event safety requirements using Event Safety Check(행사안전 체크), an offline Korean event-law, venue-rule, hazard-control, and checklist knowledge base.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "eventName": {
            "type": "string",
            "minLength": 1,
            "description": "행사 이름"
          },
          "eventType": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "festival",
                  "outdoor_event",
                  "exhibition",
                  "conference",
                  "performance",
                  "food_event",
                  "vip_event"
                ]
              },
              {
                "type": "string",
                "minLength": 1
              },
              {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1
                },
                "minItems": 1
              }
            ],
            "description": "행사 유형. 학교 축제, 플리마켓, 야외공연, 전시, 컨퍼런스처럼 입력할 수 있습니다"
          },
          "location": {
            "type": "string",
            "minLength": 1,
            "description": "행사 장소 또는 관할 지역"
          },
          "venueId": {
            "type": "string",
            "minLength": 1,
            "description": "지원 행사장 ID"
          },
          "expectedCrowd": {
            "type": "integer",
            "minimum": 0,
            "description": "한 번에 가장 많이 모일 것으로 예상되는 인원"
          },
          "outdoor": {
            "type": "boolean",
            "description": "야외 행사이면 true, 실내 행사이면 false"
          },
          "roadUse": {
            "type": "boolean",
            "description": "도로·보도 점용이나 교통 통제가 있으면 true"
          },
          "temporaryStructures": {
            "type": "boolean",
            "description": "임시로 설치하는 무대·천막·부스 등이 있으면 true"
          },
          "temporaryElectricity": {
            "type": "boolean",
            "description": "발전기·임시 배선·부스 전원을 사용하면 true"
          },
          "lpgUse": {
            "type": "boolean",
            "description": "LPG 용기나 가스를 사용하면 true"
          },
          "foodService": {
            "type": "boolean",
            "description": "식음료 판매·제공·시식이 있으면 true"
          },
          "performance": {
            "type": "boolean",
            "description": "공연·버스킹·콘서트 프로그램이 있으면 true"
          },
          "setupTeardown": {
            "type": "boolean",
            "description": "설치·철거 작업이 있으면 true"
          },
          "workAtHeight": {
            "type": "boolean",
            "description": "사다리·고소작업대·비계 등 높은 곳의 작업이 있으면 true"
          },
          "heavyObjectHandling": {
            "type": "boolean",
            "description": "무거운 장비·전시품을 반입하거나 들어 올리면 true"
          },
          "personalDataProcessing": {
            "type": "boolean",
            "description": "참가자 등록, QR 출입증, 촬영 또는 CCTV 운영이 있으면 true"
          },
          "vipSecurity": {
            "type": "boolean",
            "description": "VIP 동선, 보안검색 또는 민간경비가 필요하면 true"
          },
          "unhostedCrowd": {
            "type": "boolean",
            "description": "주최자 없이 자발적으로 많은 사람이 모이는 상황이면 true"
          }
        },
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "annotations": {
        "readOnlyHint": true,
        "destructiveHint": false,
        "idempotentHint": true,
        "openWorldHint": false
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "create_event_safety_plan",
      "title": "행사 안전관리계획 초안 만들기",
      "description": "Creates a 13-section event safety plan using Event Safety Check(행사안전 체크), an offline Korean event-law, venue-rule, hazard-control, and checklist knowledge base.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "eventName": {
            "type": "string",
            "minLength": 1,
            "description": "행사 이름"
          },
          "eventType": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "festival",
                  "outdoor_event",
                  "exhibition",
                  "conference",
                  "performance",
                  "food_event",
                  "vip_event"
                ]
              },
              {
                "type": "string",
                "minLength": 1
              },
              {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1
                },
                "minItems": 1
              }
            ],
            "description": "행사 유형. 학교 축제, 플리마켓, 야외공연, 전시, 컨퍼런스처럼 입력할 수 있습니다"
          },
          "location": {
            "type": "string",
            "minLength": 1,
            "description": "행사 장소 또는 관할 지역"
          },
          "venueId": {
            "type": "string",
            "minLength": 1,
            "description": "지원 행사장 ID"
          },
          "expectedCrowd": {
            "type": "integer",
            "minimum": 0,
            "description": "한 번에 가장 많이 모일 것으로 예상되는 인원"
          },
          "outdoor": {
            "type": "boolean",
            "description": "야외 행사이면 true, 실내 행사이면 false"
          },
          "roadUse": {
            "type": "boolean",
            "description": "도로·보도 점용이나 교통 통제가 있으면 true"
          },
          "temporaryStructures": {
            "type": "boolean",
            "description": "임시로 설치하는 무대·천막·부스 등이 있으면 true"
          },
          "temporaryElectricity": {
            "type": "boolean",
            "description": "발전기·임시 배선·부스 전원을 사용하면 true"
          },
          "lpgUse": {
            "type": "boolean",
            "description": "LPG 용기나 가스를 사용하면 true"
          },
          "foodService": {
            "type": "boolean",
            "description": "식음료 판매·제공·시식이 있으면 true"
          },
          "performance": {
            "type": "boolean",
            "description": "공연·버스킹·콘서트 프로그램이 있으면 true"
          },
          "setupTeardown": {
            "type": "boolean",
            "description": "설치·철거 작업이 있으면 true"
          },
          "workAtHeight": {
            "type": "boolean",
            "description": "사다리·고소작업대·비계 등 높은 곳의 작업이 있으면 true"
          },
          "heavyObjectHandling": {
            "type": "boolean",
            "description": "무거운 장비·전시품을 반입하거나 들어 올리면 true"
          },
          "personalDataProcessing": {
            "type": "boolean",
            "description": "참가자 등록, QR 출입증, 촬영 또는 CCTV 운영이 있으면 true"
          },
          "vipSecurity": {
            "type": "boolean",
            "description": "VIP 동선, 보안검색 또는 민간경비가 필요하면 true"
          },
          "unhostedCrowd": {
            "type": "boolean",
            "description": "주최자 없이 자발적으로 많은 사람이 모이는 상황이면 true"
          },
          "eventDate": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
            "description": "행사일(YYYY-MM-DD)"
          },
          "organizer": {
            "type": "string",
            "minLength": 1,
            "description": "주최·주관 기관 또는 담당 조직"
          }
        },
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "annotations": {
        "readOnlyHint": true,
        "destructiveHint": false,
        "idempotentHint": true,
        "openWorldHint": false
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "review_event_safety_plan",
      "title": "행사 안전관리계획 검수",
      "description": "Reviews missing, excessive, and condition-dependent items in an event safety plan using Event Safety Check(행사안전 체크).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "eventName": {
            "type": "string",
            "minLength": 1,
            "description": "행사 이름"
          },
          "eventType": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "festival",
                  "outdoor_event",
                  "exhibition",
                  "conference",
                  "performance",
                  "food_event",
                  "vip_event"
                ]
              },
              {
                "type": "string",
                "minLength": 1
              },
              {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1
                },
                "minItems": 1
              }
            ],
            "description": "행사 유형. 학교 축제, 플리마켓, 야외공연, 전시, 컨퍼런스처럼 입력할 수 있습니다"
          },
          "location": {
            "type": "string",
            "minLength": 1,
            "description": "행사 장소 또는 관할 지역"
          },
          "venueId": {
            "type": "string",
            "minLength": 1,
            "description": "지원 행사장 ID"
          },
          "expectedCrowd": {
            "type": "integer",
            "minimum": 0,
            "description": "한 번에 가장 많이 모일 것으로 예상되는 인원"
          },
          "outdoor": {
            "type": "boolean",
            "description": "야외 행사이면 true, 실내 행사이면 false"
          },
          "roadUse": {
            "type": "boolean",
            "description": "도로·보도 점용이나 교통 통제가 있으면 true"
          },
          "temporaryStructures": {
            "type": "boolean",
            "description": "임시로 설치하는 무대·천막·부스 등이 있으면 true"
          },
          "temporaryElectricity": {
            "type": "boolean",
            "description": "발전기·임시 배선·부스 전원을 사용하면 true"
          },
          "lpgUse": {
            "type": "boolean",
            "description": "LPG 용기나 가스를 사용하면 true"
          },
          "foodService": {
            "type": "boolean",
            "description": "식음료 판매·제공·시식이 있으면 true"
          },
          "performance": {
            "type": "boolean",
            "description": "공연·버스킹·콘서트 프로그램이 있으면 true"
          },
          "setupTeardown": {
            "type": "boolean",
            "description": "설치·철거 작업이 있으면 true"
          },
          "workAtHeight": {
            "type": "boolean",
            "description": "사다리·고소작업대·비계 등 높은 곳의 작업이 있으면 true"
          },
          "heavyObjectHandling": {
            "type": "boolean",
            "description": "무거운 장비·전시품을 반입하거나 들어 올리면 true"
          },
          "personalDataProcessing": {
            "type": "boolean",
            "description": "참가자 등록, QR 출입증, 촬영 또는 CCTV 운영이 있으면 true"
          },
          "vipSecurity": {
            "type": "boolean",
            "description": "VIP 동선, 보안검색 또는 민간경비가 필요하면 true"
          },
          "unhostedCrowd": {
            "type": "boolean",
            "description": "주최자 없이 자발적으로 많은 사람이 모이는 상황이면 true"
          },
          "planMarkdown": {
            "type": "string",
            "minLength": 1,
            "maxLength": 50000,
            "description": "검수할 행사 안전관리계획 Markdown(최대 50,000자)"
          }
        },
        "required": [
          "planMarkdown"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "annotations": {
        "readOnlyHint": true,
        "destructiveHint": false,
        "idempotentHint": true,
        "openWorldHint": false
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "search_event_venues",
      "title": "행사장 검색",
      "description": "Searches an offline Korean performance-facility directory for event venues using Event Safety Check(행사안전 체크).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "행사장 이름·주소·키워드"
          },
          "region": {
            "type": "string",
            "description": "시·도 또는 시·군·구"
          },
          "category": {
            "type": "string",
            "description": "시설 분류"
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10,
            "default": 5
          }
        },
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "annotations": {
        "readOnlyHint": true,
        "destructiveHint": false,
        "idempotentHint": true,
        "openWorldHint": false
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "get_event_venue_rules",
      "title": "행사장 안전규정 조회",
      "description": "Returns loading, structural, electrical, fire, booth, food, and submission rules for supported venues using Event Safety Check(행사안전 체크).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "venueId": {
            "type": "string",
            "minLength": 1,
            "description": "행사장 ID. 지원 예시: coex, kintex, bexco, setec, songdo_convensia, ceco, exco, icc_jeju, atcenter, suwon_convention_center, suwonmesse, kdjcenter, ueco, dcc, osco, hico, gumico, gsco, yeosu_expo"
          },
          "category": {
            "type": "string",
            "description": "규정 분류 필터"
          }
        },
        "required": [
          "venueId"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "annotations": {
        "readOnlyHint": true,
        "destructiveHint": false,
        "idempotentHint": true,
        "openWorldHint": false
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    },
    {
      "name": "get_event_risk_controls",
      "title": "행사 위험 예방조치 조회",
      "description": "Returns preventive controls and on-site checks for a selected event risk using Event Safety Check(행사안전 체크).",
      "inputSchema": {
        "type": "object",
        "properties": {
          "risk": {
            "type": "string",
            "enum": [
              "crowd_density",
              "entrance_bottleneck",
              "temporary_structure",
              "stage_rigging",
              "temporary_electricity",
              "work_at_height",
              "heavy_objects",
              "fire_lpg",
              "food_poisoning",
              "fire_evacuation",
              "medical_emergency",
              "privacy_cctv",
              "severe_weather"
            ],
            "description": "위험 유형: 군중 밀집, 출입구 병목, 임시구조물, 무대·리깅, 임시전기, 고소작업, 중량물, 화기·LPG, 식중독, 소방·피난, 응급환자, 개인정보·CCTV, 기상악화"
          }
        },
        "required": [
          "risk"
        ],
        "additionalProperties": false,
        "$schema": "http://json-schema.org/draft-07/schema#"
      },
      "annotations": {
        "readOnlyHint": true,
        "destructiveHint": false,
        "idempotentHint": true,
        "openWorldHint": false
      },
      "execution": {
        "taskSupport": "forbidden"
      }
    }
  ]
}
```

