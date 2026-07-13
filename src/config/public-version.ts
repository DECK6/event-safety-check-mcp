import { COMMON_RESPONSE_META, DATA_AS_OF } from "./constants.js";

export const SERVICE_NAME = "Event Safety Check(행사안전 체크)";
export const SERVICE_ID = "event-safety-check-mcp";
export const SERVICE_VERSION = "0.1.0";
export const SERVICE_DISCLAIMER = COMMON_RESPONSE_META.warning;

export const PUBLIC_RESPONSE_META = Object.freeze({
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  dataDate: DATA_AS_OF,
  disclaimer: SERVICE_DISCLAIMER,
});

export type PublicResponseMeta = typeof PUBLIC_RESPONSE_META;
