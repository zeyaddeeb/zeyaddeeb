# Local development

The main site runs on port 3000 and the blog on port 3001. Start the CRDT server on port 3002 from the repository root:

```sh
CRDT_BIND_ADDR=127.0.0.1:3002 cargo run --manifest-path crdt/Cargo.toml
```

Both web apps connect to that port during local development. Set `NEXT_PUBLIC_CRDT_URL` in either app to use another server. The server still binds to port 3001 by default for the existing deployment.

The `home` room counts connected tabs across both apps. Counts are connections, not unique people. Joining and leaving broadcasts the current count; pointer positions are transient and expire in the client. The homepage uses these messages for its live panel.
