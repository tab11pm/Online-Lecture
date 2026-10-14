/* global process */
// Fake SDO MCP server that dies before the MCP handshake, leaving secrets in
// stderr so the client's redaction is exercised. All values are fake.
process.stderr.write('starting\n');
process.stderr.write(
  'cookie: session=abc123 https://sdo.tusur.ru/?sessionToken=xyz\n',
);
process.exit(3);
