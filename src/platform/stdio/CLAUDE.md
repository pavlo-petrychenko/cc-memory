# stdio

The `Stdio` port: reading stdin, writing stdout, and exiting the process.
Hook entrypoints read a JSON payload from stdin and always print exactly one
line of JSON before exiting 0; the CLI writes to stdout and exits with a
mapped code.

Going through this port instead of `process.stdin`/`console.log`/
`process.exit` directly is what lets an entrypoint be tested by feeding a
fake stdin and asserting on captured writes, with no real process exit ending
the test run.
