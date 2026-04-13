// WebDAV (Nextcloud/Wolke) responses are entirely XML-based (RFC 4918).
// The Nextcloud WebDAV client in `services/api-clients/nextcloudApiClient.ts`
// makes the following types of requests — none of which return JSON:
//
//   PROPFIND  → HTTP 207 Multi-Status XML body, parsed by a custom regex in
//               parseWebDAVResponse(). The resulting NextcloudFile objects are
//               assembled in-process, not deserialized from JSON.
//
//   PUT       → HTTP 201/204, no response body.
//   DELETE    → HTTP 204, no response body.
//   MKCOL     → HTTP 201/405, no response body.
//
//   GET (download) → responseType 'arraybuffer', raw binary content.
//
// Because there are no JSON response bodies in this client, there is nothing
// to validate with Zod at the HTTP boundary.
//
// The parsed object shape (NextcloudFile) is defined and typed via TypeScript
// interfaces in nextcloudApiClient.ts. If a Nextcloud OCS JSON endpoint
// (e.g. /ocs/v2.php/...) is added in the future, add its schema here.
//
// See schemas/nextcloud.ts for the same explanation scoped to the
// NextcloudApiClient wrapper used by TransferService.

export {};
