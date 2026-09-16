/**
 * Shared HTTP helpers for cloud-functions handlers.
 *
 * Cloud-functions can't reuse agents/_shared.ts (which imports the OpenAI
 * Agents SDK). These wrappers handle JSON I/O the way the EdgeOne Makers
 * Node Functions runtime expects.
 */

import type { CloudFunctionContext } from '@edgeone/types';
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=UTF-8' } as const;

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export function readJsonBody(context: CloudFunctionContext): Record<string, unknown> {
  // SOP node-entry §2: the request body is already parsed by the runtime —
  // read context.request.body directly (do NOT call context.request.json()).
  const data = context?.request?.body;
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}
