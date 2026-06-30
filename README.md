# Agenda API com envio diario por e-mail

Projeto Node.js com:

- Arquivo `agenda.json` para registrar atividades
- API para listar e cadastrar atividades
- Agendamento diario para enviar e-mail com as atividades do dia

## 1) Configuracao

Copie `.env.example` para `.env` e preencha os campos SMTP.

Exemplo no PowerShell:

```powershell
Copy-Item .env.example .env
```

## 2) Rodar o projeto

```powershell
npm.cmd start
```

A API sobe em `http://localhost:3000`.

## 3) Endpoints

- `GET /health`
- `GET /agenda`
- `GET /agenda?date=YYYY-MM-DD`
- `GET /agenda/:id`
- `POST /agenda`
- `PUT /agenda/:id`
- `DELETE /agenda/:id`
- `POST /agenda/enviar-resumo-hoje`
- `POST /agenda/testar-email`

### Exemplo de cadastro

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/agenda -ContentType "application/json" -Body '{
  "title": "Estudar Node",
  "date": "2026-06-30",
  "time": "20:00",
  "description": "Revisar agendamento com node-cron"
}'
```

### Exemplo para disparar envio manual

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/agenda/enviar-resumo-hoje
```

### Exemplo de atualizacao (PUT)

```powershell
Invoke-RestMethod -Method Put -Uri http://localhost:3000/agenda/1 -ContentType "application/json" -Body '{
  "title": "Reuniao com cliente (atualizada)",
  "date": "2026-06-30",
  "time": "09:30",
  "description": "Revisar contrato final"
}'
```

### Exemplo de remocao (DELETE)

```powershell
Invoke-RestMethod -Method Delete -Uri http://localhost:3000/agenda/2
```

### Exemplo de teste de envio de e-mail (Ethereal)

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/agenda/testar-email
```

Esse endpoint cria uma conta de teste e retorna `previewUrl` para visualizar o e-mail enviado.

## Observacoes

- O envio automatico usa `DAILY_CRON` (padrao: `0 7 * * *`).
- Se SMTP nao estiver configurado, o endpoint de envio retorna erro explicando as variaveis faltantes.
- Validacoes de payload em `POST /agenda` e `PUT /agenda/:id`:
  - `date` deve seguir `YYYY-MM-DD`
  - `time` deve seguir `HH:mm` (24h, de 00:00 ate 23:59)
- Validacao de query em `GET /agenda?date=...`:
  - `date` tambem deve seguir `YYYY-MM-DD`
