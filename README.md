# Aurapoli, pronto per Cloudflare

- `public/` è il sito: un solo `index.html` più icone e manifest.
- `src/worker.js` è il server delle stanze online (un Durable Object per stanza).
- `wrangler.jsonc` collega le due cose.

## Pubblicare con le stanze online (consigliato)

Serve Node.js installato sul computer (nodejs.org, versione LTS). Poi, dentro questa cartella:

```
npx wrangler login
npx wrangler deploy
```

Il primo comando apre il browser per collegare il tuo account Cloudflare. Il secondo pubblica tutto:
il sito sarà su `aurapoli.<tuo-sottodominio>.workers.dev`. Funziona anche con il piano gratuito.

Per aggiornare il gioco: sostituisci i file e rilancia `npx wrangler deploy`. Il link resta lo stesso.

Nota: la schermata «Upload and deploy» del sito di Cloudflare non accetta questo pacchetto (avvisa che serve
`wrangler deploy`): per le stanze online va pubblicato da terminale.

## Solo partite sullo stesso dispositivo

Se non ti servono le stanze online basta il file `aurapoli-sito.zip`: lo scompatti e trascini i file
su Workers & Pages → Create → Pages (o Workers) → caricamento diretto. Il pulsante «Crea una stanza» resterà spento.

## Dominio tuo

Nel Worker → Settings → Domains & Routes → aggiungi per esempio `gioco.tuodominio.it`.

## Come funzionano le stanze

- Chi crea la stanza è l'host: la partita gira sul suo dispositivo, il server fa solo da centralino.
- Gli amici entrano con il link `?stanza=CODICE` o scrivendo il codice, e giocano dal loro telefono.
- Se un amico perde la connessione, al suo posto gioca un bot finché non rientra con lo stesso link.
- Se l'host chiude la pagina la partita si ferma: riaprendo il sito trova «Riprendi la partita salvata» e la stanza riparte.
- Le stanze vuote si cancellano da sole dopo un giorno.
