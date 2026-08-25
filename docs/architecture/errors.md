# API error format

Every error response — thrown domain exception, a bare NestJS
`HttpException` (validation, guards), or an unhandled exception — is
normalized by `AllExceptionsFilter` (`apps/api/src/common/errors/`) to:

```json
{
  "statusCode": 400,
  "code": "PURCHASE_ORDER_INVALID_STATUS",
  "message": "Purchase order cannot be received from DRAFT state",
  "details": {},
  "requestId": "e2f1e6b0-...-...-...-..."
}
```

- **`statusCode`** — standard HTTP status.
- **`code`** — stable, machine-readable (`AppErrorCode` enum in
  `app-error-code.ts`). Clients branch on this, not on `message`. Once
  shipped, a code's meaning doesn't change — add a new one instead.
- **`message`** — human-readable, safe to show in a UI/log. For an
  unhandled (500) exception this is always the generic `"Internal server
  error"` — the real error is logged server-side with `requestId`, never
  echoed to the client.
- **`details`** — optional structured context.
- **`requestId`** — set by `RequestIdMiddleware` (reuses an inbound
  `x-request-id` header if present), also echoed back as a response
  header. Use it to correlate a client-visible error with server logs.

## Raising a domain error

```ts
throw new BadRequestAppException(
  AppErrorCode.PURCHASE_ORDER_INVALID_STATUS,
  `Purchase order cannot be received from ${po.status} state`,
);
```

`AppException` and its `NotFoundAppException` /
`BadRequestAppException` / `ForbiddenAppException` /
`UnauthenticatedAppException` subclasses live in `app-exception.ts`. A
bare NestJS exception (e.g. `ForbiddenException` from a guard) still gets
normalized to the same shape, with `code` inferred from the HTTP status
(`codeForStatus` in the filter) since it has no domain code of its own.
