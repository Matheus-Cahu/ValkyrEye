# Cloud

Serviços que recebem os eventos do Raspberry Pi, guardam os radares cadastrados
e as ocorrências detectadas, e futuramente armazenam e classificam as imagens
capturadas pelo drone como `pessoa`, `animal`, `outro` ou `inconclusivo`.

O fluxo completo do sistema está em [Arquitetura](../docs/ARQUITETURA.md).

## Arquitetura

```text
 Raspberry Pi (Drone/coordinator.py)          Navegador
              │ HTTP/JSON                         │
              ▼                                   ▼
 ┌──────────────────────────┐        ┌─────────────────────────┐
 │ api  (Express 5, :8080)  │        │ valkyreye (React, :3000)│  modo dev  
 │ CRUD radares/ocorrências │◄───────┤ painel de visualização  │
 └────────────┬─────────────┘        └─────────────────────────┘
              │ SQL (pg)
              ▼
 ┌──────────────────────────┐        ┌─────────────────────────┐
 │ db  (PostgreSQL 17)      │◄───────┤ Prisma Studio (:5555)   │  ferramenta local
 │ volume pgdata            │        │ inspeção e edição       │
 └──────────────────────────┘        └─────────────────────────┘
```

| Componente | Onde | Função |
| --- | --- | --- |
| `db` | [docker-compose.yml](docker-compose.yml) | PostgreSQL 17. Schema criado por [db/init.sql](db/init.sql). Porta publicada só em `127.0.0.1`. |
| `api` | [api/](api/) | API REST em Express 5 que acessa o banco com `pg` e valida todas as entradas. |
| Prisma Studio | [api/prisma/](api/prisma/) | Interface web para visualizar e editar o banco durante o desenvolvimento. Roda na máquina local, fora dos containers. |
| `valkyreye` | [valkyreye/](valkyreye/) | Front-end React com o mapa dos radares em torno da central. |

Ainda não implementados: upload e armazenamento das imagens, classificação e
autenticação na API. Até lá, a API não deve ser exposta fora de uma rede
confiável.

### Organização

```text
Cloud/
├── docker-compose.yml   serviços db e api
├── .env.example         modelo das variáveis (copiar para .env)
├── db/init.sql          schema do banco (fonte da verdade)
├── api/
│   ├── Dockerfile
│   ├── prisma.config.ts configuração do Prisma (lê ../.env)
│   ├── prisma/schema.prisma  gerado por introspecção, usado pelo Studio
│   └── src/
│       ├── index.js     servidor, /health e montagem das rotas
│       ├── db.js        pool de conexões PostgreSQL
│       ├── http.js      validação e tradução de erros do banco
│       ├── earthengine.js  mosaico Sentinel-2 via Google Earth Engine
│       └── routes/      radares.js, ocorrencias.js e satelite.js
└── valkyreye/
    └── src/
        ├── App.js       página, atualização periódica e estado
        ├── api.js       chamadas à API
        ├── useSatellite.js  geolocalização e imagem de satélite
        └── components/
            ├── RadarMap.js      mapa, seleção e reposicionamento
            ├── RadarPopover.js  janela com os dados do radar e a ocorrência
            ├── SignatureView.js desenho da assinatura ao redor do radar
            ├── Toast.js         aviso inferior com desfazer
            ├── usePanZoom.js    arrastar, zoom e detecção de toque
            └── format.js        formatação de distância e direção
```

## Modelo de dados

```text
radares 1 ──── N ocorrencias
```

**`radares`**

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `TEXT` (PK) | Mesmo `sensor_id` do alerta LoRa, ex.: `radar-01`. Letras, números, `-` e `_`, até 64 caracteres. |
| `distancia` | `DOUBLE PRECISION` | Distância do radar até o servidor central, em metros, maior que 0. |
| `direcao` | `DOUBLE PRECISION` | Direção do radar vista da central, em graus a partir do norte no sentido horário (90 = leste), de 0 (inclusive) a 360 (exclusive). |

**`ocorrencias`**

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `BIGSERIAL` (PK) | Gerado pelo banco. Retornado como texto no JSON. |
| `radar` | `TEXT` (FK) | Precisa existir em `radares`. Um radar com ocorrências não pode ser removido. |
| `timestamp` | `TIMESTAMPTZ` | Padrão: horário da inserção. |
| `analisada` | `BOOLEAN` | Padrão: `false`. |
| `assinatura` | `JSONB` | Vetor de tuplas `[ângulo_graus, distância_cm]`, ex.: `[[45, 310], [50, 185.5]]`. De 1 a 1000 tuplas, ângulo entre 0 e 360 e distância não negativa. |

As restrições ficam no banco (`CHECK`, chave estrangeira) e são repetidas na
API para devolver mensagens claras. O formato de cada tupla da assinatura é
validado só pela API.

## API

Base: `http://localhost:8080`. Corpos em JSON. Erros respondem
`{"erro": "..."}` com status 400 (entrada inválida), 404 (não encontrado) ou
409 (duplicado ou violação de referência).

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/health` | Verifica a API e a conexão com o banco |
| `GET` | `/radares` | Lista radares |
| `GET` | `/radares/:id` | Consulta um radar |
| `POST` | `/radares` | Cria (`id`, `distancia`, `direcao`) |
| `PATCH` | `/radares/:id` | Altera `distancia` e/ou `direcao` |
| `DELETE` | `/radares/:id` | Remove (409 se houver ocorrências) |
| `GET` | `/ocorrencias` | Lista, mais recentes primeiro. Filtros: `radar`, `analisada`, `limit` (1–500, padrão 100), `offset` |
| `GET` | `/ocorrencias/:id` | Consulta uma ocorrência |
| `POST` | `/ocorrencias` | Cria (`radar`, `assinatura`; opcionais `timestamp` ISO 8601 e `analisada`) |
| `PATCH` | `/ocorrencias/:id` | Altera qualquer campo, ex.: `{"analisada": true}` |
| `DELETE` | `/ocorrencias/:id` | Remove |
| `GET` | `/satelite?lat=&lon=&raio=` | PNG 1024×1024 do quadrado de lado `2·raio` m (100–20 000) centrado no ponto, norte para cima. 503 se o Earth Engine não estiver configurado, 502 se ele falhar |

Exemplo:

```bash
curl -X POST localhost:8080/radares \
  -H 'Content-Type: application/json' \
  -d '{"id": "radar-01", "distancia": 120, "direcao": 45}'

curl -X POST localhost:8080/ocorrencias \
  -H 'Content-Type: application/json' \
  -d '{"radar": "radar-01", "assinatura": [[45, 310], [50, 185.5]]}'

curl 'localhost:8080/ocorrencias?radar=radar-01&analisada=false'
```

## Procedimentos

Pré-requisitos: Docker com Compose v2 e, para o Prisma Studio, Node.js 20 ou
superior.

### Configuração inicial

```bash
cd Cloud
cp .env.example .env     # troque POSTGRES_PASSWORD
```

| Variável | Padrão | Uso |
| --- | --- | --- |
| `POSTGRES_DB` | `valkyreye` | Nome do banco |
| `POSTGRES_USER` | `valkyreye` | Usuário do banco |
| `POSTGRES_PASSWORD` | obrigatória | Senha do banco, usada pelo `db`, pela `api` e pelo Prisma |
| `POSTGRES_PORT` | `5432` | Porta do banco no host (`127.0.0.1`) |
| `API_PORT` | `8080` | Porta da API no host |
| `GEE_PROJECT` | `project_id` da chave | Projeto do Google Cloud registrado no Earth Engine |

O `.env` está no `.gitignore`; não o versione.

### Subir, acompanhar e parar

```bash
docker compose up -d --build   # constrói a API e sobe db + api
docker compose ps              # estado e healthcheck
docker compose logs -f api     # logs da API
curl localhost:8080/health     # {"status":"ok"}
docker compose down            # para os serviços e mantém os dados
```

A `api` só inicia depois de o `db` passar no healthcheck. Após alterar o
código em `api/src`, rode `docker compose up -d --build api`.

### Visualizar o banco com Prisma Studio

Com o `db` rodando:

```bash
cd api
npm install          # primeira vez
npm run studio       # abra http://localhost:5555
```

O Studio conecta em `localhost:POSTGRES_PORT` com as credenciais de
`Cloud/.env`. Para outro banco, defina `DATABASE_URL`. Edições feitas no
Studio vão direto para o banco e não passam pelas validações da API.

### Front-end

Com `db` e `api` rodando:

```bash
cd valkyreye
npm install          # primeira vez
npm start            # abre http://localhost:3000
npm test             # testes
```

Em desenvolvimento, o servidor do React encaminha as chamadas para
`http://localhost:8080` (campo `proxy` do `package.json`). Para apontar o build
para outra API, defina `REACT_APP_API_URL` antes do `npm run build`; nesse caso a
API precisa permitir CORS, o que ainda não está configurado.

O mapa coloca o servidor central no centro, com o norte para cima, e desenha
cada radar a partir de `distancia` e `direcao`:
`x = distancia · sen(direcao)` (leste) e `y = distancia · cos(direcao)` (norte).
Ao carregar, a escala se ajusta para que o radar mais distante fique perto da
borda. Os anéis tracejados marcam distâncias, com o passo ajustado ao zoom.
A lista é consultada a cada 10 segundos.

| Ação | Mouse | Toque | Teclado (mapa focado) |
| --- | --- | --- | --- |
| Mover | arrastar | arrastar com um dedo | setas |
| Zoom | roda, duplo clique (Shift + duplo clique afasta) | pinça | `+` e `-` |
| Ajustar aos radares | botão no canto inferior direito | botão | — |

Depois que o mapa é movido, a atualização periódica não altera mais a
visualização; o botão de ajuste volta ao enquadramento automático.

#### Imagem de satélite

Ao abrir o painel, o navegador pede a localização do usuário. Supõe-se que o
operador está junto à central: essa posição vira o centro do mapa, e a API
pede ao Google Earth Engine um mosaico **Sentinel-2** (10 m por pixel, mediana
dos últimos 12 meses, nuvens removidas pela camada SCL) do quadrado em torno
dela. A imagem é desenhada sob a grade, na mesma escala dos radares; o raio é
de pelo menos 3 km (6 × 6 km, cerca de 6 m por pixel); acima disso, o dobro
do radar mais distante, arredondado para 1, 2 ou 5 × 10ⁿ m (máximo 20 km). O botão no topo dos controles mostra ou oculta a camada.

- A geolocalização só funciona em `localhost` ou HTTPS.
- 10 m por pixel é a melhor resolução gratuita global; em escalas de poucos
  metros a imagem fica borrada.
- A API guarda até 32 imagens em memória por 12 horas (posição arredondada a
  ~10 m), então recarregar o painel não gera nova consulta.

Configuração (uma vez):

1. No [Google Cloud](https://console.cloud.google.com/), crie ou escolha um
   projeto e registre-o em <https://code.earthengine.google.com/register>
   (uso não comercial/acadêmico é gratuito). Ative a **Earth Engine API**.
2. Crie uma conta de serviço com dois papéis: **Service Usage Consumer**
   (`roles/serviceusage.serviceUsageConsumer`) e um papel personalizado com
   `earthengine.computations.create`, `earthengine.thumbnails.create` e
   `earthengine.thumbnails.get`. O papel *Earth Engine Resource Viewer* não
   basta (não gera miniaturas); o *Resource Writer* funciona, mas também
   permite alterar assets.
3. Gere a chave JSON em `Cloud/secrets/gee-service-account.json` (a pasta está
   no `.gitignore`) e rode `docker compose up -d --build api`.

Com o `gcloud` (troque `PROJETO`):

```bash
SA=valkyreye-gee@PROJETO.iam.gserviceaccount.com
gcloud services enable earthengine.googleapis.com --project=PROJETO
gcloud iam service-accounts create valkyreye-gee --project=PROJETO
gcloud iam roles create valkyreyeSatellite --project=PROJETO \
  --title="ValkyrEye satellite thumbnails" --stage=GA \
  --permissions=earthengine.computations.create,earthengine.thumbnails.create,earthengine.thumbnails.get
gcloud projects add-iam-policy-binding PROJETO --condition=None \
  --member="serviceAccount:$SA" --role=projects/PROJETO/roles/valkyreyeSatellite
gcloud projects add-iam-policy-binding PROJETO --condition=None \
  --member="serviceAccount:$SA" --role=roles/serviceusage.serviceUsageConsumer
gcloud iam service-accounts keys create secrets/gee-service-account.json --iam-account="$SA"
```

A primeira imagem de cada região leva de 10 a 20 s; as seguintes vêm do cache.

Fora do Docker, defina `GEE_PRIVATE_KEY_FILE=../secrets/gee-service-account.json`
ao rodar `npm run dev`.

#### Ocorrências

Junto com os radares, o painel consulta a cada 10 segundos as ocorrências com
`analisada = false`. Um radar com alguma pendente fica **vermelho e pulsando**.

Ao abrir o radar, a janela mostra a ocorrência pendente mais recente (ou, sem
pendentes, a última registrada) com a data e um desenho da `assinatura`:

- o círculo central é o radar;
- o espaço ao redor é dividido em `n` fatias iguais de `360°/n`, uma por
  tupla, na ordem do vetor, começando no topo e seguindo no sentido horário;
- em cada fatia, um arco azul marca a distância medida (anéis tracejados de
  referência; escala mínima de 4 m, o alcance do HC-SR04). Distância `0` é
  tratada como "sem eco" e deixa a fatia vazia.

**Marcar como analisada** grava `analisada: true` em todas as pendentes do
radar (`PATCH /ocorrencias/:id`), e o alerta some.

Para testar:

```bash
curl -X POST localhost:8080/ocorrencias -H 'Content-Type: application/json' \
  -d '{"radar": "radar-01", "assinatura": [[0, 300], [45, 120], [90, 310], [135, 0], [180, 290], [225, 305], [270, 80], [315, 300]]}'
```

#### Reposicionar um radar

1. Clique ou toque em um radar para abrir a janela com distância e direção.
2. Em **Reposicionar**, arraste o radar ou toque no mapa no novo local. A
   janela mostra os valores novos e os anteriores, e uma linha tracejada liga
   a posição antiga à nova. Arrastar fora do radar continua movendo o mapa.
3. **Fixar posição** grava `distancia` e `direcao` com `PATCH /radares/:id`
   (resolução de 0,1 m e 0,1°). **Cancelar** ou `Esc` descarta a mudança.
4. Um aviso na parte inferior oferece **Desfazer reposicionamento** por 15
   segundos (o prazo pausa com o ponteiro ou o foco sobre o aviso). Desfazer
   grava de volta a posição anterior.

Se a gravação falhar, o radar continua em edição com a mensagem de erro.

### Acessar o banco com psql

```bash
docker compose exec db psql -U valkyreye -d valkyreye
```

### Alterar o schema

O [db/init.sql](db/init.sql) é a fonte da verdade, e o PostgreSQL só o executa
quando o volume `pgdata` é criado.

1. Edite `db/init.sql`.
2. Em desenvolvimento, recrie o banco (**apaga todos os dados**):
   `docker compose down -v && docker compose up -d --build`.
   Com dados a preservar, aplique a mudança via `psql` com `ALTER TABLE`
   e replique-a no `init.sql`.
3. Atualize o schema do Prisma: `cd api && npm run db:pull`.
4. Ajuste a validação em `api/src/routes/` e a documentação acima.

Não use `prisma migrate`: o `schema.prisma` não representa as restrições
`CHECK` e serviria de base para migrações incompletas.

### Backup e restauração

```bash
docker compose exec -T db pg_dump -U valkyreye -d valkyreye -Fc > backup.dump
docker compose exec -T db pg_restore -U valkyreye -d valkyreye --clean < backup.dump
```

### Rodar a API fora do Docker

Útil para depurar com recarga automática. Pare o container da API e aponte
para o banco local:

```bash
docker compose stop api
cd api
PGHOST=localhost PGPORT=5432 PGUSER=valkyreye PGPASSWORD=<senha> \
  PGDATABASE=valkyreye PORT=8080 npm run dev
```

## Integração com o Raspberry Pi

O coordenador em [Drone/coordinator.py](../Drone/coordinator.py) guarda as
capturas em `outbox/` com `upload_status: "pending"`. O envio ainda não está
implementado; ele deverá cadastrar a ocorrência via `POST /ocorrencias` e só
marcar o envio como concluído após uma resposta `201`. O Pi mantém a cópia
local até essa confirmação.
