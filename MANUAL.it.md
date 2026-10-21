<div align="center">

<img src="public/markasso-logo-icon.svg" width="80" height="80" alt="Markasso logo" />

<h2>Markasso — Manuale utente</h2>

<p>Una lavagna dark-canvas per diagrammi, appunti e disegno a mano libera.<br/>
<a href="https://markasso.it">Apri l'app</a> · <a href="./README.md">Torna al README</a></p>

</div>

---

## Strumenti

Seleziona uno strumento dalla toolbar o premi la sua scorciatoia da tastiera.

| Strumento   | Tasto | Descrizione |
|-------------|-----|-------------|
| Mano        | `H` o `Spazio` | Sposta la vista (pan) |
| Selezione   | `V` o `1` | Seleziona, sposta, ridimensiona, ruota gli elementi |
| Rettangolo  | `R` o `2` | Disegna rettangoli |
| Rombo       | `D` o `3` | Disegna forme a rombo/diamante |
| Ellisse     | `E` o `4` | Disegna ellissi e cerchi |
| Linea       | `A` / `L` o `5` | Disegna linee rette e linee con punte di freccia |
| Penna       | `P` o `6` | Disegno a mano libera |
| Testo       | `T` o `7` | Aggiungi testo |
| Nota adesiva | `N` | Aggiungi note adesive (disponibile anche dal riquadro comandi) |
| Forma flowchart | `S` | Disegna l'ultimo simbolo flowchart scelto nella Libreria |
| Libreria    | `I` | Apri la Libreria: forme flowchart e icone (vedi sotto) |
| Gomma       | `0` | Cancella elementi cliccando o trascinando sopra di essi |

Non esiste uno strumento curva separato: trascina la maniglia del punto medio di una linea dopo averla tracciata per piegarla in una curva di Bézier quadratica (vedi Modifica dei connettori più sotto).

Premi `Esc` per tornare in qualsiasi momento allo strumento Selezione.

### Modifica dei connettori

Lo slot connettore principale è **Linea** (posizione `5` nella toolbar).

- `A`, `L` e `5` selezionano tutti lo stesso strumento connettore.
- Le punte di freccia sono uno stile delle linee, configurabile dal pannello proprietà.
- Trascina la maniglia di controllo del punto medio dopo averla tracciata per piegare una linea in una curva di Bézier quadratica.
- Le etichette sui connettori curvi ora riservano il proprio spazio lungo la curva effettiva, non lungo la corda diritta.
- **Percorso:** passa un connettore da **Dritto** a **A gomito** (ortogonale) nel pannello proprietà. Vedi Smart Arrow Link più sotto.
- **Stili delle punte:** ogni estremità può avere una punta aperta, un triangolo vuoto o pieno, un rombo vuoto o pieno, oppure un cerchio.

### Blocco strumento

Il **pulsante a puntina** (icona puntina da disegno) all'estrema sinistra della toolbar controlla cosa succede dopo aver finito di disegnare una forma:

- **Non fissato (predefinito):** lo strumento torna a Selezione e il nuovo elemento viene selezionato — il pannello proprietà si apre automaticamente per poterlo stilizzare subito.
- **Fissato:** lo strumento di disegno resta attivo così puoi posizionare la forma successiva senza riselezionarlo. Utile per disegnare più forme dello stesso tipo di seguito.

> **Nota:** l'icona puntina (blocco strumento) è intenzionalmente diversa dall'icona lucchetto (blocco elemento) per evitare confusione: puntina = mantieni lo strumento attivo, lucchetto = l'elemento non può essere modificato.

---

## Disegno

### Forme (Rettangolo / Ellisse)
Clicca e trascina per disegnare. Tieni premuto `Shift` durante il trascinamento per vincolare a un quadrato o un cerchio.

### Rombo (Diamante)
Clicca e trascina per disegnare una forma a rombo. Tieni premuto `Shift` per vincolare a un rombo equilatero. Supporta riempimento, tratto, opacità e imprecisione come le altre forme.

### Linea / Punte di freccia
Clicca per impostare il punto di partenza, trascina fino al punto finale, rilascia per confermare.
Tieni premuto `Shift` per vincolare l'angolo a incrementi di 45°.

**Collegare linee a forme (Smart Link):** passa con lo strumento linea sopra una forma qualsiasi — appare un'evidenziazione con un anello ciano sul punto del bordo più vicino. Clicca e trascina per iniziare da quel punto. Sposta l'estremità vicino a un'altra forma per collegarla. Il connettore si aggancia al bordo (non al centro) e segue le forme quando si spostano. Se abiliti le punte di freccia, la punta segue la tangente finale della curva.

### Curve
Non esiste uno strumento curva separato. Disegna una linea, poi trascina il punto di controllo (maniglia a diamante) al suo punto medio per piegarla in una curva di Bézier quadratica. Seleziona la curva e trascina una delle tre maniglie per rimodellarla.

### Penna (disegno a mano libera)
Tieni premuto e trascina per disegnare. Il tratto viene smussato automaticamente al rilascio. Lo strumento penna resta attivo dopo ogni tratto così puoi continuare a disegnare senza riselezionarlo. La pressione dello stilo viene registrata quando disponibile.

### Gomma
Seleziona lo strumento Gomma (`0`) poi clicca o trascina sopra gli elementi per eliminarli. Viene cancellato per primo l'elemento più in alto sotto il cursore. Gli elementi bloccati vengono saltati. Una scia luminosa segue il cursore come feedback visivo. Gli elementi si evidenziano al passaggio della gomma.

### Testo
Clicca in un punto qualsiasi per posizionare una casella di testo e iniziare a scrivere. Premi `Invio` per confermare, `Esc` per annullare. Fai doppio clic su un testo esistente per modificarlo.

**Formattazione:** con un elemento testo selezionato, il pannello proprietà espone gli interruttori **Grassetto**, **Corsivo**, **Sottolineato** e **Barrato**.

**Modalità codice:** attiva la modalità Codice nel pannello proprietà per creare un blocco monospace con sfondo scuro. Usa `Tab` per l'indentazione e `Shift+Invio` per confermare.

**Allineamento del testo:** imposta l'allineamento a sinistra, al centro o a destra per ogni elemento dal pannello proprietà.

### Etichette sulle forme
Fai doppio clic su un rettangolo o un'ellisse per aggiungere un'etichetta di testo al suo interno. L'etichetta viene ritagliata ai confini della forma.

### Etichette sui connettori
Fai doppio clic su una linea con punte di freccia per aggiungere un'etichetta lungo il suo percorso. Sui connettori curvi, lo spazio vuoto segue la curvatura della Bézier.

---

## Libreria: forme flowchart e icone

Apri la **Libreria** con `I` o con il pulsante libreria (i libri) nella toolbar in alto a destra. È un pannello laterale con ricerca, come quello di Excalidraw:

- **Clic** su un elemento per inserirlo al centro della vista, oppure **trascinalo** sul canvas per posizionarlo dove vuoi.
- La **ricerca** filtra tutte le sezioni insieme. Gli elementi usati di recente compaiono per primi.
- Le sezioni si possono chiudere; i pacchetti di icone partono chiusi per tenere l'elenco corto.
- Sui dispositivi touch la Libreria si apre come foglio dal basso, dal menu degli strumenti.

### Forme flowchart
Otto simboli standard: **Inizio / Fine**, **Dati (I/O)**, **Documento**, **Database**, **Processo predefinito**, **Preparazione**, **Input manuale** e **Attesa**.

- Inseriscili dalla Libreria, oppure premi `S` e trascina per disegnare l'ultimo simbolo scelto.
- Doppio clic su una forma per scrivere un'etichetta, che si dispone nell'area di testo del simbolo.
- Con delle forme selezionate, la riga **Forma** del pannello proprietà cambia il simbolo sul posto (si può annullare).
- Supportano riempimento, stili del tratto, imprecisione, rotazione, export PNG/SVG e sessioni live; i connettori si agganciano al loro contorno reale.

### Icone
La sezione **Icone** contiene le icone di architettura di Markasso: server, database, cache, coda, storage, load balancer, firewall, router, rete, API, container, funzione, browser, app mobile e desktop, utente, utenti, sistema esterno, segreto e documento.

- Seguono i colori del tratto e del riempimento, il tema e l'imprecisione, e mantengono le proporzioni quando le ridimensioni.
- Ogni icona ha un'etichetta sotto (doppio clic per modificarla). I connettori agganciati dal basso si fermano sotto l'etichetta.
- Sono disponibili anche dal riquadro comandi (`Ctrl+K`, "Icona: ...").

### Icone Kubernetes
La sezione **Kubernetes** contiene il set ufficiale di icone Kubernetes (control plane, nodi, workload, rete, storage, configurazione, controllo accessi). Si carica la prima volta che apri la sezione o cerchi nella Libreria. Le icone sono incluse sotto licenza Apache-2.0.

### Importare le icone AWS, Azure e Google Cloud
I fornitori cloud consentono di usare le loro icone nei diagrammi ma non di ridistribuirle dentro uno strumento, quindi Markasso non le include. Scarichi tu il pacchetto ufficiale e lo importi:

Dove scaricare lo ZIP ufficiale:

- **AWS:** [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) ("Icon package")
- **Azure:** [Azure architecture icons](https://learn.microsoft.com/azure/architecture/icons/) (accetta i termini, poi "Download SVG icons")
- **Google Cloud:** [Google Cloud icons](https://cloud.google.com/icons) (icone dei prodotti principali e/o delle categorie)

Poi:

1. Nella Libreria clicca **Importa pacchetto di icone (ZIP)** in fondo e scegli il file. Gli stessi link di download sono indicati anche lì.
2. Il pacchetto compare come nuova sezione, con il nome del fornitore e diviso nelle sue categorie. Ogni icona è presente una sola volta, alla dimensione più grande.
3. Per eliminare un pacchetto clicca la **✕** accanto al suo nome.

Da sapere:
- I pacchetti restano **solo in questo browser** e non vengono mai caricati online. I diagrammi contengono le icone che usano, quindi diagrammi condivisi ed export le mostrano a tutti.
- Le icone dei fornitori non si ricolorano e non si ruotano, come richiedono i loro termini; puoi comunque ridimensionarle e cambiarne opacità e colore dell'etichetta.
- Usale nel rispetto dei termini di ciascun fornitore.

---

## Selezione

### Selezionare gli elementi
- **Clic** su un elemento per selezionarlo.
- **Shift+clic** per aggiungere o rimuovere un elemento dalla selezione corrente.
- **Clic e trascinamento** sul canvas vuoto per una selezione a rettangolo (marquee).
- **Ctrl+A** per selezionare tutti gli elementi.

### Spostare
Trascina un elemento selezionato per spostarlo. Quando sono selezionati più elementi si spostano tutti insieme.

**Shift+trascina per clonare:** tieni premuto `Shift` e trascina un elemento selezionato per lasciare l'originale al suo posto e trascinarne una copia. Se sono selezionati più elementi, vengono clonati tutti.

### Ridimensionare
Seleziona un elemento — appaiono otto maniglie attorno al riquadro di selezione. Trascina una maniglia qualsiasi per ridimensionare. Tieni premuto `Shift` mentre trascini una maniglia d'angolo per mantenere le proporzioni.

### Ruotare
Trascina la maniglia circolare sopra il riquadro di selezione per ruotare. Solo per elementi singoli.

### Spostamento fine (nudge)
Con elementi selezionati, usa le **frecce direzionali** per spostare di 1px. Tieni premuto `Shift` per passi da 10px.

### Eliminare
Premi `Canc` o `Backspace` per rimuovere gli elementi selezionati. Gli elementi bloccati vengono saltati.

---

## Gruppi

Raggruppa gli elementi perché si comportino come un'unica unità.

| Azione | Come |
|--------|-----|
| Raggruppa | Seleziona 2+ elementi → `Ctrl+G` o clicca il pulsante gruppo nella toolbar |
| Separa gruppo | Seleziona elementi raggruppati → `Ctrl+Shift+G` o clicca il pulsante separa |
| Seleziona l'intero gruppo | Clicca un membro qualsiasi |
| Entra nel gruppo (seleziona il singolo) | Clicca un membro una seconda volta mentre il gruppo è già selezionato |
| Esci dal gruppo | Premi `Esc` per tornare alla selezione dell'intero gruppo |

---

## Allineamento

Con due o più elementi selezionati, appare la **toolbar di allineamento** sopra la selezione. Permette di allineare e distribuire gli elementi con un clic.

| Azione | Descrizione |
|--------|-------------|
| Allinea a sinistra | Allinea i bordi sinistri all'elemento più a sinistra |
| Allinea al centro (O) | Centra orizzontalmente |
| Allinea a destra | Allinea i bordi destri all'elemento più a destra |
| Allinea in alto | Allinea i bordi superiori all'elemento più in alto |
| Allinea al centro (V) | Centra verticalmente |
| Allinea in basso | Allinea i bordi inferiori all'elemento più in basso |
| Distribuisci orizzontalmente | Spazia gli elementi uniformemente sull'asse orizzontale |
| Distribuisci verticalmente | Spazia gli elementi uniformemente sull'asse verticale |

---

## Blocco

Blocca gli elementi per proteggerli da modifiche accidentali.

- **Blocca:** seleziona gli elementi → clicca il pulsante lucchetto nella toolbar contestuale, oppure premi `Ctrl+Shift+L` (`⌘⇧L` su Mac).
- **Sblocca:** seleziona l'elemento bloccato → clicca il pulsante sblocca, oppure premi di nuovo `Ctrl+Shift+L`.

Quando la selezione contiene elementi bloccati, appare un **indicatore lucchetto** all'estremità destra della pillola della toolbar. Cliccandolo si sbloccano direttamente gli elementi bloccati nella selezione.

Gli elementi bloccati:
- Restano pienamente visibili
- Possono essere cliccati per essere selezionati (utile per ispezionarne lo stile o sbloccarli)
- Non possono essere spostati, ridimensionati, eliminati o collegati

---

## Smart Arrow Link

Le linee, con o senza punte di freccia, possono essere collegate in modo permanente alle forme.

**Creare un collegamento:**
1. Seleziona lo strumento linea con `A`, `L` o `5`.
2. Passa sopra una forma — si evidenzia e mostra un anello ciano sul bordo. Clicca per iniziare da quel punto del bordo.
3. Trascina verso un'altra forma — anche il suo bordo si evidenzia. Rilascia per collegare.
4. Il connettore ora è live: sposta una delle due forme e la linea segue, agganciandosi sempre al punto corretto del bordo.
5. Dopo aver posizionato il connettore, lo strumento torna automaticamente a Selezione.

**Modificare un collegamento:**
Seleziona la freccia → trascina una delle due maniglie ciano alle estremità. Trascina vicino a una forma per ricollegare, oppure trascina lontano da tutte le forme per scollegare.

**Scollegare:** trascina una maniglia di estremità lontano dalla forma collegata e rilascia nello spazio vuoto.

**Eliminare una forma collegata:** eliminando una forma vengono automaticamente rimosse tutte le frecce e le linee ad essa collegate.

**Porte di connessione:** mentre disegni un connettore o ne trascini un'estremità vicino a una forma compaiono quattro porte (sopra, destra, sotto, sinistra). Rilascia l'estremità su una porta per **fissarla** lì: resta su quel punto quando la forma viene spostata, ridimensionata o ruotata. Rilasciala in un altro punto del bordo e resta **libera**, scorrendo lungo il bordo verso l'altra estremità.

**Connettori a gomito:** imposta **Percorso → A gomito** nel pannello proprietà (con lo strumento linea attivo vale per i connettori che disegni dopo). Il percorso ortogonale si ricalcola dalle due estremità: esce da ogni forma con un breve tratto dritto, le estremità libere si spostano al centro del lato rivolto verso l'altra forma, e l'etichetta sta a metà del percorso.

**Stili delle punte:** con un connettore selezionato scegli lo stile di **Punta iniziale** e **Punta finale**: aperta, triangolo, triangolo pieno, rombo, rombo pieno o cerchio (ereditarietà, aggregazione e composizione UML). Le punte chiuse restano vuote su qualsiasi sfondo, export compresi.

---

## Ordine dei livelli

Controlla quali elementi appaiono in primo piano.

| Azione | Tastiera | Toolbar |
|--------|----------|---------|
| Porta in primo piano | `Ctrl+Shift+]` | pulsante primo piano |
| Sposta avanti di uno | — | pulsante avanti |
| Sposta indietro di uno | — | pulsante indietro |
| Manda sullo sfondo | `Ctrl+Shift+[` | pulsante sfondo |

---

## Modifica e cronologia

| Azione | Scorciatoia |
|--------|----------|
| Annulla | `Ctrl+Z` |
| Ripristina | `Ctrl+Y` o `Ctrl+Shift+Z` |
| Copia | `Ctrl+C` |
| Incolla | `Ctrl+V` |
| Duplica | `Ctrl+D` |
| Elimina | `Canc` / `Backspace` |
| Seleziona tutto | `Ctrl+A` |
| Blocca / sblocca elementi | `Ctrl+Shift+L` (`⌘⇧L`) |
| Raggruppa | `Ctrl+G` (`⌘G`) |
| Separa gruppo | `Ctrl+Shift+G` (`⌘⇧G`) |

---

## Proprietà di stile

Con un elemento selezionato, il **pannello Proprietà** (icona a cursori nella toolbar contestuale) permette di modificare:

- **Colore tratto** e **colore riempimento**
- **Spessore del tratto**
- **Stile del tratto:** solido, tratteggiato, punteggiato
- **Terminazione linea:** piatta / arrotondata / quadrata (linee, frecce, curve, disegno a mano libera)
- **Opacità** (0–100%)
- **Imprecisione** — 0 = nitido, valori più alti = aspetto disegnato a mano / abbozzato
- **Ombra** — sfocatura, colore e offset per un'ombra portata
- **Bordi** — Squadrati o Arrotondati (solo rettangoli)
- **Font** e **dimensione font** (elementi testo)
- **Formattazione** — Grassetto, Corsivo, Sottolineato, Barrato (elementi testo)
- **Allineamento** — sinistra / centro / destra (elementi testo)
- **Modalità codice** — blocco monospace con sfondo scuro (elementi testo)
- **Colore nota** — palette predefinita (note adesive)

---

## Griglia

| Azione | Scorciatoia |
|--------|----------|
| Attiva/disattiva griglia | `G` |
| Tipi di griglia | Punti / Linee / Millimetrata (dalle Impostazioni) |

---

## Navigazione

| Azione | Come |
|--------|-----|
| Pan | Trascinamento con clic centrale, oppure `Alt+trascina` |
| Zoom | Rotella del mouse, oppure pizzico su trackpad/touch |
| Adatta tutti gli elementi | `F` |
| Reimposta zoom al 100% | `Shift+0` |
| Mostra/nascondi tutti i pannelli | `\` (backslash) |
| Minimappa | Angolo in basso a destra — clicca o trascina la minimappa per spostare la vista |

---

## Riquadro comandi

Premi `Ctrl+K` per aprire il riquadro comandi. Digita per cercare con ricerca fuzzy tutte le azioni disponibili — formati di esportazione, cambio strumento, livelli di zoom, cambio tema, impostazioni di lingua e operazioni di allineamento. Usa `↑` / `↓` per navigare ed `Invio` per eseguire. Premi `Esc` per chiudere.

---

## Ricerca elementi

Premi `Ctrl+F` per cercare elementi sul canvas in base alla loro etichetta o al contenuto testuale. Seleziona un risultato per spostare la vista su quell'elemento e selezionarlo. Premi `Esc` per chiudere. Nascosta su dispositivi touch/mobile.

---

## Minimappa

Un piccolo pannello panoramico nell'angolo in basso a destra mostra tutti gli elementi in scala ridotta. Il rettangolo blu rappresenta la vista corrente. Clicca in un punto qualsiasi della minimappa per spostarti lì; trascina per fare pan in continuo. Comprimila o espandila con il pulsante dedicato.

---

## Link di condivisione

Clicca l'**icona di condivisione** nella toolbar in alto a destra per codificare l'intera scena in un URL. Il link viene copiato automaticamente negli appunti. Condividilo — chiunque apra l'URL vede lo stesso canvas, pronto per continuare a modificarlo.

---

## Tema

Passa tra i temi **Scuro**, **Chiaro** e **Sistema** dal pannello Impostazioni (menu hamburger). La tua preferenza viene salvata tra una sessione e l'altra.

---

## Importa ed esporta

- **Importa immagine:** clicca l'icona immagine nella toolbar contestuale (oppure trascina e rilascia sul canvas, o `Ctrl+V` per incollare dagli appunti).
- **Apri .markasso:** trascina e rilascia un file `.markasso` sul canvas, oppure usa File → Apri nel menu Impostazioni.
- **Salva .markasso:** File → Salva nel menu Impostazioni. Salva l'intera scena incluse le immagini.
- **Importa diagramma Mermaid:** trascina e rilascia un file `.mmd` o `.mermaid` sul canvas, clicca il pulsante Mermaid nella toolbar, oppure incolla testo Mermaid con `Ctrl+V`. Tipi di diagramma supportati:
  - Parsing e disposizione usano il motore ufficiale Mermaid, caricato alla prima importazione.
  - Flowchart (inclusi i sottografi), diagrammi di sequenza, classi, stati ed entità-relazioni vengono convertiti in elementi nativi modificabili.
  - Gli altri tipi di diagramma, come gantt, pie, gitGraph e mindmap, vengono importati come immagine SVG; i singoli nodi non sono modificabili.
  - Dopo la conversione la vista si adatta automaticamente al diagramma importato.
- **Importa pacchetto di icone (ZIP):** i pacchetti di icone AWS, Azure e Google Cloud si importano dalla Libreria. Vedi *Importare le icone AWS, Azure e Google Cloud*.
- **Esporta PNG:** scarica un PNG a 2× ritagliato al riquadro che racchiude tutti gli elementi.
- **Esporta SVG:** scarica un SVG pulito ritagliato al riquadro che racchiude gli elementi.
- **Esporta HTML:** scarica un file `.html` autonomo con il canvas incorporato come immagine.
- **Salvataggio automatico:** il canvas si salva automaticamente in `localStorage` — il tuo lavoro sopravvive ai refresh della pagina.

---

## Riferimento scorciatoie da tastiera

| Scorciatoia | Azione |
|----------|--------|
| `H` / `Spazio` | Mano (pan) |
| `V` / `1` | Strumento Selezione |
| `R` / `2` | Rettangolo |
| `D` / `3` | Rombo (Diamante) |
| `E` / `4` | Ellisse |
| `A` / `L` / `5` | Linea + punte di freccia |
| `P` / `6` | Penna |
| `T` / `7` | Testo |
| `N` | Nota adesiva |
| `S` | Forma flowchart (ultimo simbolo scelto) |
| `I` | Apri / chiudi la Libreria |
| `0` | Gomma |
| `?` | Apri la finestra di aiuto scorciatoie |
| `Esc` | Torna a Selezione / esci dal gruppo / deseleziona |
| `G` | Attiva/disattiva griglia |
| `F` | Adatta il canvas agli elementi |
| `Shift+0` | Reimposta zoom al 100% |
| `\` | Mostra/nascondi tutti i pannelli UI |
| `Ctrl+K` | Apri il riquadro comandi |
| `Ctrl+F` | Apri la ricerca elementi |
| `Ctrl+Z` | Annulla |
| `Ctrl+Y` | Ripristina |
| `Ctrl+A` | Seleziona tutto |
| `Ctrl+C` | Copia selezione |
| `Ctrl+V` | Incolla (elementi o immagine dagli appunti) |
| `Ctrl+D` | Duplica selezione |
| `Ctrl+G` | Raggruppa selezione |
| `Ctrl+Shift+G` | Separa gruppo |
| `Ctrl+Shift+]` | Porta in primo piano |
| `Ctrl+Shift+[` | Manda sullo sfondo |
| `Frecce direzionali` | Sposta di 1px |
| `Shift+Freccia` | Sposta di 10px |
| `Canc` / `Backspace` | Elimina selezione |
| `Shift+clic` | Aggiungi/rimuovi dalla selezione |
| `Shift+trascina` | Clona e trascina (lascia l'originale al suo posto) |
