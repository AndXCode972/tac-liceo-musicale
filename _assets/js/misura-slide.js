/* MISURA DELLE SLIDE — da incollare nella console, o da eseguire con gli
   strumenti del browser su una lezione montata.

   A COSA SERVE. Dice quali slide non stanno nella schermata, di quanti
   pixel, e qual è il blocco che sfora. È la stessa misura che il lettore fa
   da sé in `TAC.deck.misuraTutte`, ma stampata in forma leggibile e con tre
   controlli in più che quella non fa.

   PERCHÉ NON STA DENTRO monta.py. Ci abbiamo provato: `monta.py` è Python
   senza browser, quindi può solo stimare l'altezza contando caratteri e
   blocchi. Calibrata su ventotto slide misurate davvero, la stima sbaglia in
   media **settanta pixel**, con punte di centocinquanta, e classifica male
   cinque slide su ventisette. Gli sfori che contano vanno da trenta a
   centotrenta pixel: un controllo con quell'errore direbbe «sfora» a slide
   che stanno e «va bene» a slide che escono, e un controllo inaffidabile si
   impara a ignorare. L'informazione che manca — dove va a capo una riga,
   quanto è alta una figura dopo il ridimensionamento — nel sorgente non c'è.

   La strada del browser senza interfaccia è stata scartata per un motivo
   pratico: il contenitore in cui lavora Claude ha la rete ristretta e non
   può scaricarlo, e installarlo nella cartella del progetto significherebbe
   rimettere in OneDrive centinaia di megabyte, che è esattamente quello che
   la pulizia del 30 luglio ha tolto.

   I TRE CONTROLLI IN PIÙ, tutti nati da difetti veri di questi giorni:

   1. QUANTE SLIDE SONO VISIBILI. Devono essere una. Lo stacco dei compiti è
      rimasto visibile su tutte le schermate per un giorno intero, perché una
      regola gli dava `display: grid` sempre invece che solo da attivo, e la
      misura dell'altezza non se ne accorgeva: una slide che si mostra dove
      non deve non sfora.

   2. I TESTI CENTRATI CHE NON LO SONO. Un blocco più stretto del suo
      contenitore non si centra da solo: resta a sinistra, e `text-align:
      center` centra le righe dentro quel blocco. Da fuori sembra a posto
      perché le righe sono simmetriche fra loro. Una didascalia era fuori
      asse di centottantotto pixel, dichiarata centrata e mai centrata.

   3. LA TRAPPOLA DELLE DUE COLONNE. Su una slide a due colonne l'altezza la
      decide la più alta: togliere testo dall'altra risparmia **zero**. Ci si
      può passare mezz'ora senza capire perché non cambia niente.

   4. TESTO NUDO DENTRO UNA GRIGLIA. In `display: grid` ogni figlio diventa
      una cella, e i pezzi di testo fra un tag e l'altro diventano celle
      anonime: una frase con tre <strong> dentro si spezza in sette righe,
      con il punto fermo isolato a inizio riga. Nella lezione 2 la slide dei
      compiti sforava di 794 pixel — il massimo di tutta la lezione — e la
      causa non era «troppo testo», era testo giusto impaginato da una regola
      che non sapeva di applicarsi anche a lui. Il difetto è quasi invisibile
      a chi guarda in fretta, perché le parole ci sono tutte e sono nell'ordine
      giusto: sembra una scelta tipografica.
*/
(() => {
  const SOGLIA = 40;          // sotto, non conviene intervenire

  const r = document.documentElement;
  const prima = r.style.getPropertyValue('--adatta');
  r.style.setProperty('--adatta', 1);   // si misura a scala piena

  const misura = s => {
    const d = s.querySelector('.slide-interna');
    if (!d) return null;
    const attiva = s.classList.contains('attiva');
    if (!attiva) s.classList.add('misura');
    void d.offsetHeight;
    const cs = getComputedStyle(s);
    const spazio = s.clientHeight - parseFloat(cs.paddingTop)
                                  - parseFloat(cs.paddingBottom) - 8;

    /* LA SCALA DEL PALCO. `getBoundingClientRect` risponde in pixel
       **dello schermo**, cioè già moltiplicati per il `transform: scale`
       del palco; `clientHeight` risponde in pixel CSS, che il transform
       non tocca. Confrontare il fondo dei figli con lo spazio voleva dire
       confrontare centimetri con pollici: su uno schermo grande, dove la
       scala è 1,77, ogni slide risultava sfondare di quattro-cinquecento
       pixel che non esistevano. Ventiquattro slide su trenta dichiarate
       troppo piene, e la slide «Cinque linee e quattro spazi» — che sullo
       schermo ha ancora spazio sotto — accusata di sforare di 467.
       Diviso per la scala, i due numeri parlano di nuovo la stessa lingua. */
    const kappa = s.getBoundingClientRect().width / (s.offsetWidth || 1) || 1;
    const base = d.getBoundingClientRect().top
                 + parseFloat(getComputedStyle(d).paddingTop) * kappa;
    let fondo = 0, colpevole = null;
    d.querySelectorAll('*').forEach(e => {
      const b = e.getBoundingClientRect();
      if (!b.height) return;
      if ((b.bottom - base) / kappa > fondo) {
        fondo = (b.bottom - base) / kappa;
        colpevole = e.tagName.toLowerCase()
                    + (e.className ? '.' + String(e.className).split(' ')[0] : '');
      }
    });
    /* `scrollHeight` da solo non basta: su un elemento con `overflow:
       visible` il browser lo riporta uguale a `clientHeight` anche quando il
       contenuto esce, quindi il contenuto che sborda è invisibile proprio
       allo strumento che deve cercarlo. Si prende il fondo vero dei figli. */
    const alto = Math.max(d.scrollHeight, Math.round(fondo));
    if (!attiva) s.classList.remove('misura');
    return { alto, spazio: Math.round(spazio), sforo: Math.round(alto - spazio), colpevole };
  };

  const giro = () => {
  const righe = [], storti = [], colonne = [], spezzati = [];

  /* Un contenitore in grid o flex non deve avere figli di testo nudo: il
     browser li avvolge in celle anonime e la frase si spezza. Si guarda il
     `display` calcolato, non il CSS scritto, perché la regola che trasforma
     il contenitore può stare in un `:has()` e valere solo in certi casi —
     che è esattamente com'è successo. */
  const cercaSpezzati = (s, k) => {
    s.querySelectorAll('.slide-interna, .slide-interna *').forEach(e => {
      const d = getComputedStyle(e).display;
      if (d !== 'grid' && d !== 'flex'
          && d !== 'inline-grid' && d !== 'inline-flex') return;
      const parole = [...e.childNodes]
        .filter(n => n.nodeType === 3 && n.textContent.trim().length > 1)
        .map(n => n.textContent.trim());
      if (!parole.length) return;
      /* Un pulsante è fatto apposta di un'icona e di una parola affiancate:
         `<button class="btn"><svg>…</svg> Ascolta</button>` è flex, ha un
         pezzo di testo nudo, ed è giusto così. Segnalarlo cinque volte per
         lezione insegna a saltare l'elenco, e allora il caso vero — la frase
         spezzata in nove righe — passa insieme agli altri. Si segnala solo
         quando le celle di testo sono almeno due, oppure quando il
         contenitore è una griglia vera, che manda a capo. */
      const pulsante = /^(BUTTON|A|LABEL|SUMMARY)$/.test(e.tagName);
      const griglia = d === 'grid' || d === 'inline-grid';
      if (pulsante && parole.length < 2) return;
      if (!griglia && parole.length < 2) return;
      spezzati.push({
        n: k,
        dove: e.tagName.toLowerCase()
              + (e.className ? '.' + String(e.className).split(' ')[0] : ''),
        display: d,
        celle: parole.length,
        primo: parole[0].slice(0, 40)
      });
    });
  };

  TAC.deck.slides.forEach((s, k) => {
    if (s.classList.contains('copertina')) return;
    const m = misura(s);
    if (!m) return;
    if (m.sforo > 1) righe.push({ n: k, titolo: s.dataset.titolo || '', ...m });

    const attiva = s.classList.contains('attiva');
    if (!attiva) s.classList.add('misura');

    // 2. testi dichiarati centrati che non lo sono
    s.querySelectorAll('.slide-interna *').forEach(e => {
      const c = getComputedStyle(e);
      if (c.textAlign !== 'center') return;
      if (!/^(P|DIV|FIGCAPTION|BLOCKQUOTE)$/.test(e.tagName)) return;
      const p = e.parentElement; if (!p) return;
      const re = e.getBoundingClientRect(), rp = p.getBoundingClientRect();
      if (!re.width || !rp.width) return;
      const scarto = Math.round((re.left + re.width / 2) - (rp.left + rp.width / 2));
      if (Math.abs(scarto) > 6)
        storti.push({ n: k, elemento: e.className || e.tagName, scarto });
    });

    // 3. due colonne di altezza simile: tagliare da una sola non serve
    s.querySelectorAll('.slide-interna .colonne').forEach(col => {
      const alt = [...col.children].map(c => c.getBoundingClientRect().height);
      if (alt.length === 2 && Math.abs(alt[0] - alt[1]) < 40 && m.sforo > 1)
        colonne.push({ n: k, altezze: alt.map(Math.round) });
    });

    // 4. testo nudo dentro un contenitore che è diventato grid o flex
    cercaSpezzati(s, k);

    if (!attiva) s.classList.remove('misura');
  });

  // 1. quante slide sono visibili: devono essere una
  const visibili = [...document.querySelectorAll('.slide')]
    .filter(s => getComputedStyle(s).display !== 'none')
    .map(s => s.dataset.titolo || '(senza titolo)');

  if (prima) r.style.setProperty('--adatta', prima);

  const gravi = righe.filter(x => x.sforo >= SOGLIA);
  return {
    slide: TAC.deck.slides.length,
    visibili_ora: visibili,
    visibili_ok: visibili.length === 1,
    sforano: righe.sort((a, b) => b.sforo - a.sforo),
    sopra_soglia: gravi.length,
    centrati_male: storti,
    due_colonne_pari: colonne,
    testo_spezzato: spezzati
  };
  };

  const esito = giro();

  /* ══ I GAMBI DELLE QUATTRO PARTI ══

     Andrea, 21 agosto: «le direzioni delle gambe sono sbagliate». Soprano
     con il gambo in giù e basso in su, su ogni rigo a quattro voci del
     progetto — cioè da quando la notazione a quattro parti esiste.

     La causa stava in `VF.Beam.generateBeams`, che ricalcola la direzione
     dei gambi del gruppo che gli si passa anche quando quel gruppo è di
     una nota sola. È stata corretta in `tac-core.js`.

     Questo controllo c'è perché quella correzione non basta a garantire
     che non torni: nessuno dei controlli in Python può vederla — la
     direzione del gambo nasce nel browser, dopo la formattazione, e nel
     sorgente non c'è. Un difetto che vive solo a schermo va cercato a
     schermo.

     LA REGOLA. Soprano in su, contralto in giù, tenore in su, basso in
     giù. È l'unica cosa che dice a chi appartiene una nota: due voci sullo
     stesso rigo si distinguono per il gambo, non per l'altezza. */
  const ATTESO = { soprano: 1, contralto: -1, tenore: 1, basso: -1 };
  const gambi = [];
  document.querySelectorAll('tac-stave[soprano]').forEach((s, n) => {
    const dir = (nota) => {
      try { return nota.getStemDirection(); } catch (e) { return 0; }
    };
    const guarda = (nome, note, dati) => {
      if (!note) return;
      note.forEach((nota, i) => {
        const d = dati && dati[i];
        if (d && (d.pausa || d.stanghetta)) return;
        const v = dir(nota);
        if (v && v !== ATTESO[nome]) {
          gambi.push({ rigo: n, didascalia: (s.getAttribute('caption') || '').slice(0, 40),
                       voce: nome, nota: i, verso: v > 0 ? 'su' : 'giù',
                       atteso: ATTESO[nome] > 0 ? 'su' : 'giù' });
        }
      });
    };
    guarda('soprano', s._note, s._dati);
    if (s._vociGiu) guarda('basso', s._vociGiu.voce.getTickables(), s._datiB);
    (s._vociInterne || []).forEach(v => guarda(v.nome, v.note, v.dati));
  });
  esito.gambi_storti = gambi;

  /* LA PROVA IN BIANCO, e non è pignoleria.

     Questo strumento ha già mentito una volta, e ha mentito **verso l'alto**:
     dichiarava ventiquattro slide troppo piene su trenta. Corretto l'errore,
     ha cominciato a rispondere zero — che è la risposta giusta, ma è anche
     esattamente la risposta che darebbe se avessi rotto la misura invece di
     aggiustarla. Uno zero da uno strumento che non misura niente ha la stessa
     faccia di uno zero da uno strumento che funziona.

     Allora si stringe il palco a quattrocento pixel, dove le slide DEVONO
     sforare, e si guarda se se ne accorge. Se anche lì dicesse zero, lo zero
     di sopra non varrebbe nulla e il campo `attendibile` lo dice.

     Il numero atteso è verificabile: togliendo 320 pixel di palco, lo sforo
     massimo deve venire intorno a 320. Nella lezione 2 è venuto 315. */
  const alta = r.style.getPropertyValue('--palco-h');
  r.style.setProperty('--palco-h', '400px');
  const bianco = giro();
  if (alta) r.style.setProperty('--palco-h', alta);
  else r.style.removeProperty('--palco-h');

  esito.prova_in_bianco = {
    sforano: bianco.sforano.length,
    massimo: bianco.sforano[0] ? bianco.sforano[0].sforo : 0
  };
  esito.attendibile = bianco.sforano.length > 0;

  return esito;
})()
