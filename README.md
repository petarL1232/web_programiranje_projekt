# DocumentChain Web

Web aplikacija za pohranu dokumenata i provjeru autentičnosti pomoću blockchain strukture.

Ovaj ZIP trenutno pokriva:

- Faza 1: kostur projekta (`client` + `server`)
- Faza 2: osnovni Express backend + Angular UI gumb za testiranje backenda

## Struktura

```txt
document-chain-web/
  client/   Angular frontend
  server/   Node.js + Express backend
  README.md
```

## Pokretanje backenda

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Backend se pokreće na:

```txt
http://localhost:5000
```

Test ruta:

```txt
GET http://localhost:5000/api/health
```

## Pokretanje frontenda

U drugom terminalu:

```bash
cd client
npm install
npm start
```

Angular se pokreće na:

```txt
http://localhost:4200
```

Na početnoj stranici klikni **Test backend**. Ako sve radi, prikazat će se poruka iz Express servera.

## Git commit

Nakon raspakiravanja napravi Git repo i prvi commit:

```bash
git init
git add .
git commit -m "Setup project skeleton and backend health check"
```

Za projekt je bitno imati barem 5 commitova kroz barem tjedan dana, pa ćemo svaku iduću fazu commitati odvojeno.

## Sljedeća faza

Faza 3 bit će spajanje na MongoDB Atlas bazu.
