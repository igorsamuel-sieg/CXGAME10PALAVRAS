# 🧙 Torneio das Casas de Hogwarts

Jogo multiplayer em tempo real com tema Harry Potter para equipes.

## Como funciona

- **40 palavras** (10 por casa) aparecem simultaneamente na tela para todos os jogadores
- Cada participante deve **selecionar exatamente as 10 palavras** que pertencem à sua casa
- Se errar, volta à tela sem saber quais acertou — tenta de novo
- **Vence quem acertar as 10 corretamente primeiro**
- O Mestre controla início, pausa e reset
- O Espectador acompanha o ranking em tempo real

## Deploy no Render

### 1. Suba o projeto para o GitHub
```bash
git init
git add .
git commit -m "Torneio Hogwarts"
git remote add origin https://github.com/SEU_USUARIO/hogwarts-game.git
git push -u origin main
```

### 2. Crie um Web Service no Render
- Acesse https://render.com e faça login
- Clique em **New → Web Service**
- Conecte ao seu repositório GitHub
- Configure:
  - **Build Command:** `npm install`
  - **Start Command:** `npm start`
  - **Environment:** Node

### 3. Configure as variáveis de ambiente no Render
Em **Environment → Environment Variables**, adicione:

| Variável           | Valor         | Descrição                          |
|--------------------|---------------|------------------------------------|
| `MASTER_PASSWORD`  | (sua senha)   | Senha do painel do Mestre          |
| `SPECTATOR_PASSWORD` | (opcional)  | Senha do espectador (deixe vazio para acesso livre) |

### 4. Deploy!
O Render irá buildar e subir o servidor automaticamente.

## Rodando localmente

```bash
# Copie e edite as variáveis de ambiente
cp .env.example .env

# Instale dependências
npm install

# Inicie
npm start
```

Acesse: http://localhost:3000

## Tipos de acesso

| Tipo        | Descrição                                       |
|-------------|--------------------------------------------------|
| **Mestre**  | Controla início/pausa/reset — precisa de senha  |
| **Espectador** | Acompanha ranking ao vivo                   |
| **Participante** | Joga — seleciona seu nome na lista        |

## Estrutura

```
hogwarts/
├── server.js          # Backend Node.js + WebSocket
├── public/
│   └── index.html     # Frontend completo
├── package.json
├── .env.example       # Template de variáveis de ambiente
└── .gitignore
```
