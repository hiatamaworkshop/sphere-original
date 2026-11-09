# docker_compose_sphere_v1

Compose stack for Sphere. See [../README.md](../README.md) to start it and [../DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) for the API.

| Path | Contents |
|---|---|
| `services/periphery` | HTTP API + WebSocket gateway (:3001) |
| `services/renalCore` | Physics engine, built into periphery |
| `services/nginx`, `postgres`, `redis`, `minio` | Infrastructure containers |
| `sphere.config.json` | Constants loaded by periphery |
