// Nextcloud responses are primarily WebDAV XML (parsed by custom regex in
// NextcloudApiClient.parseWebDAVResponse) and raw binary ArrayBuffer downloads.
// Neither format is suitable for Zod JSON schema validation.
//
// The only typed data structures returned by this client are assembled
// in-process from parsed XML, not received as JSON:
//   - NextcloudFile — built from regex matches in parseWebDAVResponse()
//   - DownloadFileResult — wraps a Buffer from arraybuffer response
//
// If a Nextcloud REST JSON endpoint is added in the future, add its schema here.

export {};
