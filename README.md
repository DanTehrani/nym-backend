## Development

### Install dependencies

```bash
yarn
```

### Spin up database

```bash
docker-compose up -d
```

### Run database migrations

```bash
cd packages/nym-api
```

```bash
DATABASE_URL=postgresql://nymdev:password@localhost:5432/nym yarn prisma migrate dev --name init
```

### Start development server

```bash
yarn dev
```

## Todos
- [x] Basic logic of the API endpoints
- [ ] Merkle tree management
  - [ ] Merkle tree related endpoints
  - [ ] Publinc input checks
