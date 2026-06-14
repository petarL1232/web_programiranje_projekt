# DocumentChain Web

Web aplikacija za pohranu dokumenata i provjeru njihove autentičnosti pomoću blockchain strukture.

Ovaj repozitorij trenutno sadrži fazu 1 i 2 projekta:

1. osnovni kostur projekta s `client` i `server` folderima
2. Express backend s rutom `GET /api/health`
3. Angular frontend s malim UI testom koji poziva backend
4. Prettier konfiguraciju
5. GitHub Actions CI workflow

## Tehnologije

- Angular 21 frontend
- Angular zoneless change detection + signals
- Node.js + Express backend
- Prettier za formatiranje
- GitHub Actions za CI provjere

## Struktura

```txt
document-chain-web/
  client/                Angular frontend
  server/                Express backend
  .github/workflows/     GitHub Actions workflow
  .gitignore
  .prettierrc
  .prettierignore
  package.json           root tooling: Prettier
```

## Prvo pokretanje

### Server

```cmd
cd server
npm install
copy .env.example .env
npm run dev
```

Server radi na:

```txt
http://localhost:5000
```

Health provjera:

```txt
http://localhost:5000/api/health
```

### Client

U drugom terminalu:

```cmd
cd client
npm install
npm start
```

Frontend radi na:

```txt
http://localhost:4200
```

Na stranici klikni **Test backend**. Ako server radi, prikazat će se JSON odgovor.

## Svaki put kad nastavljaš raditi

Terminal 1:

```cmd
cd server
npm run dev
```

Terminal 2:

```cmd
cd client
npm start
```

## Prettier

Iz root foldera projekta:

```cmd
npm install
npm run format
npm run format:check
```

`format` popravi format, a `format:check` samo provjeri format. GitHub Actions koristi `format:check`.

## GitHub Actions

Workflow je u:

```txt
.github/workflows/ci.yml
```

Na svaki push na `main` GitHub će:

1. instalirati root dependencyje
2. provjeriti Prettier format
3. instalirati server dependencyje
4. provjeriti server production audit
5. provjeriti server syntax
6. instalirati client dependencyje
7. provjeriti client production audit
8. buildati Angular client

## Git komande

Prvi push:

```cmd
git init
git add .
git commit -m "Setup project skeleton health check and CI"
git branch -M main
git remote add origin https://github.com/petarL1232/web_programiranje_projekt.git
git push -u origin main
```

Ako remote već postoji i želiš pregaziti trenutni GitHub sadržaj ovim čistim ZIP projektom:

```cmd
git push -u origin main --force-with-lease
```

Koristi force samo ako si siguran da na GitHubu nema ništa što želiš sačuvati.

## Sljedeća faza

Faza 3 je spajanje na MongoDB Atlas i dodavanje malog UI statusa za bazu.
