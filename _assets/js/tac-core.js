/* ============================================================
   TAC-CORE — Libreria di componenti per le lezioni di
   Teoria, Analisi e Composizione — Liceo Musicale

   Dipendenze: _assets/lib/vexflow.js, _assets/lib/tone.js

   Componenti disponibili nelle slide:
     <tac-stave>   pentagramma disegnato e suonabile
     <tac-piano>   tastiera cliccabile
     <tac-quiz>    domande a scelta multipla autocorrettive
     <tac-drag>    trascina l'etichetta giusta
     <tac-ear>     ascolta e riconosci
     <tac-rhythm>  cellula ritmica con metronomo
   ============================================================ */

(function () {
  'use strict';

  const TAC = window.TAC = {};

  /* ==========================================================
     0. IL CASO RIPRODUCIBILE

     `Math.random()` non si può rifare due volte uguale, e questo
     va benissimo finché un esercizio serve solo a chi lo sta
     facendo. Smette di bastare appena si vuole che una scheda
     assegnata sia **ricostruibile**: per rivedere la prova di uno
     studente bisogna poter rifare esattamente gli esercizi che gli
     erano capitati, e con il caso puro non si può, perché non
     resta traccia di che cosa sia uscito.

     Qui il caso parte da un numero, il seme. Stesso seme, stessa
     sequenza, per sempre e su qualunque macchina. Da questo solo
     fatto discende tutta la struttura delle schede: il codice che
     lo studente riporta contiene il seme e le sue risposte, e
     tanto basta a ricostruire la prova intera — le domande si
     rigenerano, le risposte giuste si ricalcolano. Nel codice non
     serve mettere né le une né le altre, e infatti non ci sono.

     L'algoritmo è mulberry32: trenta righe, distribuzione più che
     buona per quello che ci serve, e soprattutto **identico
     ovunque**, che è l'unica proprietà che conta qui. Non è
     crittografico e non deve esserlo: non protegge niente, serve
     solo a ripetersi.

     Senza seme si torna a `Math.random()`, così un esercizio usato
     in classe resta imprevedibile come deve essere.
     ========================================================== */

  TAC.caso = {
    seme: null,
    _tira: null,

    /** Fissa il seme. Da qui in poi la sequenza è determinata. */
    semina(seme) {
      this.seme = (typeof seme === 'string') ? this.daTesto(seme) : (seme | 0);
      let a = this.seme;
      this._tira = function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
      return this.seme;
    },

    /** Torna al caso vero: è così che si comporta in classe. */
    libera() { this.seme = null; this._tira = null; },

    numero() { return this._tira ? this._tira() : Math.random(); },
    intero(n) { return Math.floor(this.numero() * n); },
    scegli(a) { return a[this.intero(a.length)]; },

    /** Un seme da una stringa qualsiasi, per semi leggibili. */
    daTesto(s) {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    },

    /** Un seme nuovo, quando la scheda comincia e non ne ha uno. */
    nuovo() { return (Math.random() * 0xFFFFFFFF) >>> 0; }
  };

  /* ==========================================================
     0-bis. IL CODICE D'ESITO

     Una verifica finisce con un codice che lo studente copia e
     consegna. Da quel codice il docente ricava il voto.

     Che cosa ci sta dentro, e che cosa no. Dentro: il numero della
     prova, il seme, e la risposta data a ogni domanda. Fuori: il
     nome dello studente, le domande, le risposte giuste, il
     punteggio. Il nome sta fuori per una ragione decisa una volta
     per tutte — sul sito non finiscono dati di minori — e il resto
     sta fuori perché **si ricalcola**: stesso seme, stesse domande,
     stesse risposte giuste. Un codice che portasse il punteggio
     sarebbe un codice da credere sulla parola; così invece il
     punteggio lo rifà il docente.

     Trentadue caratteri, quelli di Crockford: niente I, L, O, U.
     La I e la L si confondono con l'uno, la O con lo zero, e la U
     compare per sbaglio dentro parole che e meglio non far
     comparire. Chi trascrive a mano sbaglia meno, e chi legge male
     lo scopre subito perche c'e una cifra di controllo.

     Che cosa la cifra di controllo protegge, detto chiaro: gli
     **errori di trascrizione**, non l'imbroglio. Un codice
     ricopiato male non viene accettato per buono. Un codice
     inventato a tavolino da chi ha letto il JavaScript si potrebbe
     costruire — ma per farsi dare un voto alto bisognerebbe
     comunque metterci dentro le risposte giuste, che e esattamente
     la cosa che la verifica chiede di sapere. La prova in classe si
     sorveglia come sempre; questo meccanismo serve a riportare un
     risultato, non a fare da guardiano.
     ========================================================== */

  TAC.esito = {
    ALFABETO: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
    VERSIONE: 2,

    /* La risposta e un numero da 0 a 31: 0 vuol dire «non data», e
       da 1 a 31 sono le scelte.

       ERANO SETTE, E SETTE NON BASTAVANO. La ragione scritta qui
       prima — «una domanda con piu di sette opzioni non si
       risponde, si indovina» — vale per il quiz, dove le opzioni
       sono due o tre. Non vale per il trascinamento, dove la
       «scelta» e un gettone fra quelli disponibili.

       Fuori da una verifica il trascinamento ne mette in gioco
       sette: le cinque parole giuste delle frasi estratte piu due
       prese fra le rimanenti. Ma quel calcolo parte dalle risposte
       giuste, e in una verifica le risposte giuste nella pagina non
       ci sono — e' tutto il punto. Restano quindi in gioco tutte le
       risposte possibili dell'esercizio.

       PERCHE' CINQUE BIT E NON QUATTRO. Contate, le risposte
       possibili dei trascinamenti di verifica arrivano a quindici:
       con quattro bit ci stavano esatte, tutte e sette le verifiche
       al limite del campo. Ma «ci sta esatto» vuol dire che la
       prossima frase aggiunta a un esercizio lo fa sbordare, e
       sborderebbe in silenzio — il numero verrebbe troncato e il
       docente leggerebbe una risposta diversa da quella data.
       Il controllo in `controlla()` adesso se ne accorgerebbe, ma
       un margine che dipende da un controllo e' piu' fragile di un
       margine che c'e'. Cinque bit costano tre caratteri di codice
       e tolgono il problema. */
    MAX_SCELTE: 31,
    MAX_DOMANDE: 63,
    BIT_RISPOSTA: 5,

    _bit(n, quanti) {
      let s = '';
      for (let i = quanti - 1; i >= 0; i--) s += (n >>> i) & 1;
      return s;
    },

    /* Cifra di controllo: dieci bit, presi con un CRC classico.
       Va calcolata sui bit veri, non sulle lettere: cosi becca
       anche lo scambio di due caratteri, che e l'errore di
       trascrizione piu comune dopo la lettura sbagliata. */
    _controllo(bit) {
      let r = 0x3FF;
      for (const c of bit) {
        const alto = (r >>> 9) & 1;
        r = ((r << 1) & 0x3FF) ^ (+c ^ alto ? 0x199 : 0);
      }
      return r & 0x3FF;
    },

    /**
     * Il codice da consegnare.
     * @param {{prova:number, seme:number, risposte:number[]}} dati
     */
    codifica(dati) {
      const risposte = dati.risposte || [];
      if (risposte.length > this.MAX_DOMANDE) {
        throw new Error('troppe domande per un codice solo: ' + risposte.length);
      }
      for (const r of risposte) {
        if (!(r >= 0 && r <= this.MAX_SCELTE)) {
          throw new Error('risposta fuori scala: ' + r);
        }
      }
      let bit = this._bit(this.VERSIONE, 3)
              + this._bit(dati.prova, 10)
              + this._bit(dati.seme >>> 0, 32)
              + this._bit(risposte.length, 6);
      for (const r of risposte) bit += this._bit(r, this.BIT_RISPOSTA);
      bit += this._bit(this._controllo(bit), 10);
      while (bit.length % 5) bit += '0';

      let fuori = '';
      for (let i = 0; i < bit.length; i += 5) {
        fuori += this.ALFABETO[parseInt(bit.slice(i, i + 5), 2)];
      }
      return fuori.replace(/(.{5})(?=.)/g, '$1-');
    },

    /**
     * Riapre un codice. Torna null se non e un codice valido: e il
     * caso della trascrizione sbagliata, e va detto a chi lo
     * incolla invece di restituire numeri a caso.
     */
    leggi(codice) {
      if (typeof codice !== 'string') return null;
      /* Chi ricopia a mano scrive volentieri O per 0 e I per 1: si
         accetta e si raddrizza, invece di rimandarlo indietro. */
      const pulito = codice.toUpperCase().replace(/[^0-9A-Z]/g, '')
                           .replace(/O/g, '0').replace(/[IL]/g, '1')
                           .replace(/U/g, 'V');
      let bit = '';
      for (const c of pulito) {
        const k = this.ALFABETO.indexOf(c);
        if (k < 0) return null;
        bit += this._bit(k, 5);
      }
      if (bit.length < 61) return null;

      const versione = parseInt(bit.slice(0, 3), 2);
      if (versione !== this.VERSIONE) return null;
      const prova = parseInt(bit.slice(3, 13), 2);
      const seme = parseInt(bit.slice(13, 45), 2) >>> 0;
      const n = parseInt(bit.slice(45, 51), 2);
      const passo = this.BIT_RISPOSTA;
      const fine = 51 + n * passo;
      if (bit.length < fine + 10) return null;

      const risposte = [];
      for (let i = 0; i < n; i++) {
        risposte.push(parseInt(bit.slice(51 + i * passo, 51 + (i + 1) * passo), 2));
      }
      const atteso = parseInt(bit.slice(fine, fine + 10), 2);
      if (this._controllo(bit.slice(0, fine)) !== atteso) return null;

      /* In fondo restano da uno a quattro bit di riempimento, per
         arrivare a un numero tondo di caratteri. Sono zeri, e vanno
         controllati: senza, l'ultimo carattere si puo sbagliare a
         ricopiare e il codice viene accettato lo stesso. Il voto
         verrebbe giusto — quei bit non dicono niente — ma il codice
         letto non sarebbe piu quello scritto, e un codice che non
         combacia con quello consegnato e una discussione che non si
         vuole avere in classe. */
      if (/[^0]/.test(bit.slice(fine + 10))) return null;

      return { versione, prova, seme, risposte };
    },

    /* ------------------------------------------------------
       Dal numero di risposte giuste al voto.

       La scala non si inventa qui: e quella di
       `00_Programmazione/07_Griglie_Solfeggio_e_Dettato.md`, che
       vale per tutte le prove del corso. Venti punti, voto = punti
       diviso due, e sotto i sei punti il voto e 3 — perche una
       prova quasi in bianco non merita distinzioni fini, e perche
       il 2 non si mette.
       ------------------------------------------------------ */

    /* `ottenuto` e `massimo` non sono per forza il numero di
       risposte giuste: una verifica puo pesare le domande in modo
       diverso, e il peso lo dice la verifica, non il codice. Il
       codice porta le risposte; quanto valgono lo sa la scheda di
       correzione. */
    punti(ottenuto, massimo) {
      if (!massimo) return 0;
      return Math.round(20 * ottenuto / massimo);
    },

    voto(punti) {
      return punti < 6 ? 3 : punti / 2;
    },

    /** Il voto come si scrive sul registro: 7½, non 7.5. */
    votoScritto(voto) {
      const intero = Math.floor(voto);
      return (voto - intero === 0.5) ? intero + '½' : String(intero);
    },

    /** Tutto insieme, che e come lo usa la pagina del docente. */
    valuta(ottenuto, massimo) {
      const p = this.punti(ottenuto, massimo);
      const v = this.voto(p);
      return { ottenuto, massimo, punti: p, voto: v,
               scritto: this.votoScritto(v) };
    }
  };

  /* ==========================================================
     0-ter. LA CORREZIONE

     Vive solo sul computer del docente. Sta qui e non nella pagina di
     correzione perche' deve rimontare la verifica **con lo stesso
     codice** che la monta per lo studente: se la ricostruzione fosse
     scritta a parte, sarebbe una seconda implementazione della pesca,
     e due implementazioni della stessa pesca prima o poi divergono —
     in silenzio, perche' il codice si aprirebbe lo stesso e i numeri
     ci sarebbero tutti.

     Vuole un `<tac-verifica>` gia' nel documento, coi dati interi
     (quelli con le risposte). La pagina del docente lo tiene nascosto.
     ========================================================== */

  TAC.correzione = {
    /**
     * @param {Element} verifica  un <tac-verifica> coi dati interi
     * @param {number}  seme      il seme letto dal codice
     * @param {number[]} date     le risposte lette dal codice
     */
    correggi(verifica, seme, date) {
      verifica.rifaiConSeme(seme);

      /* Le risposte attese, nello stesso ordine in cui la verifica le
         raccoglie: esercizio per esercizio, domanda per domanda. */
      const esercizi = [];
      let k = 0;
      verifica._prove.forEach(p => {
        const peso = parseFloat(p.getAttribute('peso')) || 1;
        const attese = [];
        if (p.tagName === 'TAC-QUIZ') {
          (p._dom || []).forEach(d => attese.push({
            domanda: d.d, giusta: d.c + 1,
            testoGiusta: (d.o || [])[d.c]
          }));
        } else if (p.tagName === 'TAC-DRAG') {
          (p._frasi || []).forEach(f => attese.push({
            domanda: f.testo,
            giusta: (p._mescolati || []).indexOf(f.giusta) + 1,
            testoGiusta: f.giusta
          }));
        }
        const righe = attese.map(a => {
          const data = date[k++];
          return {
            domanda: a.domanda,
            giusta: a.testoGiusta,
            data: data,
            vuota: data === 0 || data === undefined,
            ok: data === a.giusta
          };
        });
        esercizi.push({
          titolo: p.tagName === 'TAC-QUIZ' ? 'domande' : 'trascinamento',
          peso: peso,
          righe: righe,
          giuste: righe.filter(r => r.ok).length,
          totale: righe.length
        });
      });

      /* IL CONTO E' LA MEDIA PESATA DELLE RESE, NON LA SOMMA DEI PUNTI.
         Un esercizio da venti domande schiaccerebbe uno da cinque anche
         avendo peso minore, e il peso non servirebbe piu' a niente. */
      let resa = 0, pesi = 0;
      esercizi.forEach(e => {
        if (!e.totale) return;
        resa += e.peso * (e.giuste / e.totale);
        pesi += e.peso;
      });
      const cento = pesi ? Math.round(resa / pesi * 100) : 0;

      /* Se il codice porta piu' o meno risposte di quante ne servono, il
         confronto e' andato fuori sincrono e il voto non vale niente. Va
         detto, non aggiustato: e' il segno che il codice appartiene a
         un'altra prova, o a una versione precedente della stessa. */
      const attese = esercizi.reduce((n, e) => n + e.totale, 0);
      return {
        esercizi: esercizi,
        cento: cento,
        attese: attese,
        ricevute: date.length,
        coerente: attese === date.length,
        valutazione: TAC.esito.valuta(cento, 100)
      };
    }
  };

  /* ==========================================================
     1. AUDIO
     ========================================================== */

  const Audio = TAC.audio = {
    pronto: false,
    synth: null,      /* voce generica, al centro */
    voci: [],         /* una per parte, con timbro e posizione distinti */
    click: null,
    tick: null,
    sampler: null,
    campionato: false,

    /* I browser aprono il contesto audio in stato sospeso e lo lasciano
       partire solo dentro un gesto dell'utente. Una catena di await, per
       quanto breve, esce dal gesto e il permesso decade. Perciò si sblocca
       al primo tocco sulla pagina, prima e a prescindere da quale pulsante
       sia stato premuto. */
    sblocca() {
      if (this._sbloccato || typeof Tone === 'undefined') return;
      const tenta = () => {
        try {
          let c = Tone.getContext();
          let g = c && c.rawContext;
          if (g && g.state !== 'running' && g.resume) g.resume();
          if (Tone.start) Tone.start();

          /* Se il contesto resta sospeso nonostante resume(), lo si sostituisce
             con uno nuovo creato qui dentro, cioè dentro il gesto: è il caso in
             cui il browser rifiuta di riattivare un contesto nato prima che
             l'utente toccasse la pagina. */
          if (g && g.state !== 'running' && Tone.setContext && Tone.Context) {
            try {
              Tone.setContext(new Tone.Context({ latencyHint: 'interactive' }));
              c = Tone.getContext(); g = c && c.rawContext;
              if (g && g.state !== 'running' && g.resume) g.resume();
              this.pronto = false;   /* la catena va ricostruita sul contesto nuovo */
              this._strum = {}; this._bus = null; this._tentato = false;
            } catch (e) { /* si resta con quello di prima */ }
          }
          if (g && g.state === 'running') {
            this._sbloccato = true;
            ['pointerdown', 'keydown', 'touchstart'].forEach(
              e => document.removeEventListener(e, tenta, true));
          }
        } catch (e) { /* si riprova al gesto successivo */ }
      };
      ['pointerdown', 'keydown', 'touchstart'].forEach(
        e => document.addEventListener(e, tenta, true));
      this._tenta = tenta;
    },

    async avvia() {
      if (this.pronto) return;
      if (typeof Tone === 'undefined') {
        console.warn('TAC: Tone.js non caricato, audio disattivato.');
        return;
      }
      if (this._tenta) this._tenta();
      await Tone.start();
      const g = Tone.getContext() && Tone.getContext().rawContext;
      if (g && g.state !== 'running' && g.resume) { try { await g.resume(); } catch (e) {} }

      /* Il suono asciutto va dritto all'uscita. Il riverbero sta su una
         mandata parallela e viene agganciato solo quando è pronto: in
         Tone.js deve prima generare la propria risposta all'impulso, e
         finché non l'ha fatta non lascia passare nulla. Messo sul percorso
         principale, come avevo fatto, spegne l'audio. */
      const riv = this._bus = new Tone.Gain(1).toDestination();
      try {
        const eco = new Tone.Reverb({ decay: 1.9, preDelay: 0.012, wet: 1 }).toDestination();
        const mandata = new Tone.Gain(0.22).connect(eco);
        const aggancia = () => { try { this._bus.connect(mandata); } catch (e) {} };
        if (eco.ready && eco.ready.then) eco.ready.then(aggancia).catch(() => {});
        else aggancia();
      } catch (e) { /* senza riverbero si sente lo stesso */ }

      /* Ripiego sintetico. Ogni parte ha la sua posizione nello spazio e un
         filtro un po' più chiuso man mano che scende: è quello che permette
         di distinguere le quattro voci di un quartetto invece di sentirle
         impastate in un blocco solo. */
      const POSTI = [-0.45, -0.16, 0.16, 0.45];
      this.voci = POSTI.map((p, i) => {
        const pan = new Tone.Panner(p).connect(riv);
        const flt = new Tone.Filter({ frequency: 3800 - i * 420, type: 'lowpass',
                                      rolloff: -12 }).connect(pan);
        const v = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 2, spread: 16 },
          envelope: { attack: 0.03, decay: 0.3, sustain: 0.45, release: 0.5 }
        }).connect(flt);
        v.volume.value = -18 - i * 1.4;
        return v;
      });

      this.synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 2, spread: 14 },
        envelope: { attack: 0.02, decay: 0.28, sustain: 0.4, release: 0.6 }
      }).connect(riv);
      this.synth.volume.value = -14;

      /* Il metronomo esce asciutto, fuori dal riverbero: deve stare sopra la
         musica e restare riconoscibile, non confondersi con essa. */
      this.click = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.02, sustain: 0 }
      }).connect(new Tone.Filter(2800, 'highpass').toDestination());
      this.click.volume.value = -13;

      /* Il colpo dei battiti.

         Stava a −19 dB, e sopra ci andava una seconda attenuazione: la
         forza con cui viene percosso, 0,25 per la suddivisione. Livello
         effettivo circa −31 dB, cioè **quindici decibel sotto la
         musica**. In aula, con un proiettore che ronza e ventiquattro
         ragazzi, la suddivisione semplicemente non arrivava. Segnalato
         da Andrea: «il volume dei battiti in genere è molto basso».

         Alzato di otto decibel. Anche il decadimento è un po' più lungo:
         quaranta millesimi di onda quadra si percepiscono più deboli di
         quanto misurino, perché l'orecchio ha bisogno di qualche decina
         di millesimi per valutare l'intensità di un suono breve. Resta
         comunque un colpo secco, non una nota. */
      this.tick = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 }
      }).toDestination();
      this.tick.volume.value = -11;

      this.pronto = true;
    },

    /* ---------------------------------------------------------------
       STRUMENTI VERI, CAMPIONATI

       I campioni vengono dalla raccolta FluidR3 (pubblico dominio) e dal
       pianoforte Salamander. Si caricano dalla rete solo quando servono:
       una parte di quartetto costa una ventina di file da 25 KB.

       Se la rete manca resta il ripiego sintetico e la lezione funziona
       lo stesso — solo con un timbro meno bello.
       --------------------------------------------------------------- */

    FLUID: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/',

    /* Attenzione ai nomi: questa raccolta usa i bemolli. Db4 esiste, Cs4 no. */
    ORGANICI: {
      tastiera: [{ f: 'salamander', v: -7 }],
      archi:    [{ f: 'violin', v: -5 }, { f: 'violin', v: -7 },
                 { f: 'viola',  v: -6 }, { f: 'cello',  v: -4 }],
      voci:     [{ f: 'choir_aahs', v: -6 }],
      fiati:    [{ f: 'flute', v: -6 }, { f: 'oboe', v: -7 },
                 { f: 'clarinet', v: -6 }, { f: 'bassoon', v: -5 }]
    },

    AMBITI: {
      violin:     ['G3','Bb3','Db4','E4','G4','Bb4','Db5','E5','G5','Bb5','Db6','E6','G6'],
      viola:      ['C3','Eb3','Gb3','A3','C4','Eb4','Gb4','A4','C5','Eb5','Gb5','A5','C6'],
      cello:      ['C2','Eb2','Gb2','A2','C3','Eb3','Gb3','A3','C4','Eb4','Gb4','A4'],
      choir_aahs: ['C3','Eb3','Gb3','A3','C4','Eb4','Gb4','A4','C5','Eb5','A5'],
      flute:      ['C4','Eb4','Gb4','A4','C5','Eb5','Gb5','A5','C6','Eb6'],
      oboe:       ['Bb3','Db4','E4','G4','Bb4','Db5','E5','G5','Bb5'],
      clarinet:   ['D3','F3','Ab3','B3','D4','F4','Ab4','B4','D5','F5','Ab5'],
      bassoon:    ['Bb1','Db2','E2','G2','Bb2','Db3','E3','G3','Bb3','Db4']
    },

    _strum: {},   /* già caricati o in caricamento */

    /* Carica uno strumento e lo restituisce quando è pronto. Il pianoforte
       ha una raccolta sua, migliore di quella generale. */
    strumento(nome) {
      if (this._strum[nome]) return this._strum[nome];
      if (typeof Tone === 'undefined' || !this._bus) return null;

      let base, urls;
      if (nome === 'salamander') {
        base = 'https://tonejs.github.io/audio/salamander/';
        urls = {};
        ['A0','C1','D#1','F#1','A1','C2','D#2','F#2','A2','C3','D#3','F#3','A3',
         'C4','D#4','F#4','A4','C5','D#5','F#5','A5','C6','D#6','F#6','A6','C7']
          .forEach(n => urls[n] = n.replace('#', 's') + '.mp3');
      } else {
        base = this.FLUID + nome + '-mp3/';
        urls = {};
        (this.AMBITI[nome] || ['C3','C4','C5']).forEach(n => urls[n] = n + '.mp3');
      }

      const p = new Promise(risolvi => {
        try {
          const sp = new Tone.Sampler({
            urls, baseUrl: base, release: nome === 'salamander' ? 1.2 : 0.5,
            onload:  () => { this.campionato = true;
                             document.dispatchEvent(new CustomEvent('tac-strumento'));
                             risolvi(sp); },
            onerror: () => risolvi(null)
          }).connect(this._bus);
          setTimeout(() => risolvi(sp.loaded ? sp : null), 6000);
        } catch (e) { risolvi(null); }
      });
      this._strum[nome] = p;
      return p;
    },

    /* Prepara tutte le parti di un organico. Restituisce l'elenco degli
       strumenti pronti, o un elenco vuoto se la rete non ha risposto. */
    async preparaOrganico(nome) {
      const spec = this.ORGANICI[nome] || this.ORGANICI.tastiera;
      const pronti = await Promise.all(spec.map(x => this.strumento(x.f)));
      pronti.forEach((sp, k) => { if (sp) sp.volume.value = spec[k].v; });
      return pronti.every(x => x) ? pronti : [];
    },

    /* Strumento per la parte i-esima */
    voce(i, organico) {
      if (organico && organico.length)
        return organico[Math.min(i, organico.length - 1)];
      return this.voci[Math.min(i, this.voci.length - 1)] || this.synth;
    },

    NOMI: { tastiera: 'pianoforte', archi: 'quartetto d\'archi',
            voci: 'coro', fiati: 'quintetto di fiati' },

    nomeStrumento(organico, pronto) {
      return pronto ? (this.NOMI[organico] || 'strumenti campionati') : '';
    },

    async nota(n, dur = '4n', quando) {
      await this.avvia();
      (this.campionato ? this.sampler : this.synth).triggerAttackRelease(n, dur, quando);
    },

    async accordo(note, dur = '2n', quando) {
      await this.avvia();
      (this.campionato ? this.sampler : this.synth).triggerAttackRelease(note, dur, quando);
    },

    /* LA CONVENZIONE DEI TRE LIVELLI, scritta qui e in nessun altro posto.

       Il battere è il colpo **grave**, la pulsazione sta in mezzo, la
       suddivisione è il colpo **acuto e più debole**. Non è una scelta di
       gusto: è quello che lo studente deve imparare a riconoscere a
       orecchio, e per impararlo deve essere sempre lo stesso.

       Era scritta in tre posti diversi, e in uno era rovesciata: il
       metronomo dei brani accentava con un LA acutissimo, mentre l'esempio
       dei tre livelli accentava col RE grave. Chi faceva le due lezioni di
       fila imparava due segnali opposti per la stessa cosa, e il difetto
       non produceva nessun errore visibile — semplicemente l'orecchio non
       costruiva l'abitudine, perché l'abitudine veniva contraddetta.
       Trovato da Andrea: «siamo sicuri che il suono utilizzato sia lo
       stesso della lezione 1?».

       Chi aggiunge un esempio con dei battiti prende le altezze da qui.
       Se un giorno la convenzione va cambiata, si cambia in questa riga e
       cambia dappertutto. */
    LIVELLI: {
      metro: { altezza: 'D4', forza: 1.00 },
      puls:  { altezza: 'A5', forza: 0.70 },
      sudd:  { altezza: 'D6', forza: 0.45 },
      /* Il ritmo scritto: sta nella famiglia della pulsazione, un colpo
         secco allo stesso livello, appena più forte perché è la voce che
         si segue. Non è un quarto livello metrico — è la riga che si
         legge, sopra i battiti che la misurano. */
      ritmo: { altezza: 'A5', forza: 0.95 }
    },

    /* `sopraMusica` aggiunge un colpo di rumore bianco sopra il tono.

       Serve solo quando il metronomo suona sopra una registrazione vera:
       lì il tono da solo si confonde con la musica e si perde. Sugli
       esempi nudi non va messo, perché è un suono in più che la lezione 1
       non fa sentire, e la differenza si nota. */
    async metronomo(forte, quando, sopraMusica) {
      await this.avvia();
      if (!this.tick) return;
      const L = forte ? this.LIVELLI.metro : this.LIVELLI.puls;
      if (sopraMusica && this.click) {
        this.click.triggerAttackRelease('32n', quando, forte ? 1 : 0.4);
      }
      this.tick.triggerAttackRelease(L.altezza, '64n', quando, L.forza);
    },

    /* Un colpo di altezza scelta. Serve ai tre livelli sovrapposti: se
       metro, pulsazione e suddivisione suonassero uguali non si
       distinguerebbero, e sovrapporli non insegnerebbe niente. */
    async colpo(altezza, forza, quando) {
      await this.avvia();
      if (!this.tick) return;
      this.tick.triggerAttackRelease(altezza, '64n', quando, forza);
    },


    zittisci() {
      if (this.synth) this.synth.releaseAll();
      (this.voci || []).forEach(v => v.releaseAll && v.releaseAll());
      Object.values(this._strum || {}).forEach(p => {
        if (p && p.then) p.then(sp => sp && sp.releaseAll && sp.releaseAll());
      });
    },

    fermaTutto() {
      if (!this.pronto) return;
      this.zittisci();
      Tone.Transport.stop();
      Tone.Transport.cancel();
    }
  };

  /* ==========================================================
     2. UTILITÀ SULLE NOTE

     Formato interno (VexFlow):  c/4  f#/4  bb/3
     Formato Tone.js:            C4   F#4   Bb3
     ========================================================== */

  const NOMI_IT = { c: 'do', d: 're', e: 'mi', f: 'fa', g: 'sol', a: 'la', b: 'si' };
  const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

  /* QUALI NOTE ALTERA UN'ARMATURA, nell'ordine in cui i segni si scrivono.

     Serve perché fino al 20 agosto 2026 l'armatura si **vedeva e non si
     sentiva**: `keysig` finiva su `addKeySignature`, cioè nel disegno, e
     la riproduzione leggeva le note com'erano scritte. Un rigo con
     `keysig="Bb"` e `notes="b/4 …"` mostrava un si sotto due bemolli — che
     si legge si bemolle — e faceva sentire un si naturale.

     Era esattamente la slide dell'unità 5, lezione 2, quella che dice
     «il rigo qui sopra si legge si♭, do, re, mi♭… anche se davanti alle
     note non c'è niente». Diceva il vero all'occhio e il falso
     all'orecchio, ed è il guasto peggiore di tutti perché in una lezione
     sull'armatura l'orecchio è la prova. */
  const ARMATURE = {
    'C': [],
    'G': ['f'], 'D': ['f', 'c'], 'A': ['f', 'c', 'g'],
    'E': ['f', 'c', 'g', 'd'], 'B': ['f', 'c', 'g', 'd', 'a'],
    'F#': ['f', 'c', 'g', 'd', 'a', 'e'],
    'C#': ['f', 'c', 'g', 'd', 'a', 'e', 'b'],
    'F': ['b'], 'Bb': ['b', 'e'], 'Eb': ['b', 'e', 'a'],
    'Ab': ['b', 'e', 'a', 'd'], 'Db': ['b', 'e', 'a', 'd', 'g'],
    'Gb': ['b', 'e', 'a', 'd', 'g', 'c'],
    'Cb': ['b', 'e', 'a', 'd', 'g', 'c', 'f']
  };

  const N = TAC.note = {

    /* "f#/4" -> {lettera:'f', alt:'#', ottava:4} */
    scomponi(k) {
      const m = String(k).trim().toLowerCase().match(/^([a-g])(#{1,2}|b{1,2}|n)?\/(-?\d+)$/);
      if (!m) throw new Error('Nota non valida: ' + k);
      return { lettera: m[1], alt: m[2] || '', ottava: parseInt(m[3], 10) };
    },

    /* "f#/4" -> "F#4"  (per Tone.js) */
    aTone(k) {
      const p = this.scomponi(k);
      const alt = p.alt === 'n' ? '' : p.alt;
      return p.lettera.toUpperCase() + alt + p.ottava;
    },

    /* La nota come la si **sente** sotto un'armatura.

       Un'alterazione scritta davanti alla nota comanda sempre: se c'è un
       bequadro, o un diesis, o un bemolle, l'armatura non c'entra più. È
       la regola vera, ed è anche quello che serve — le lezioni che
       mostrano un'armatura mostrano quasi sempre, subito dopo, la nota
       che ne esce. */
    conArmatura(k, armatura) {
      const segni = ARMATURE[armatura];
      if (!segni || !segni.length) return k;
      const p = this.scomponi(k);
      if (p.alt) return k;
      if (segni.indexOf(p.lettera) < 0) return k;
      return p.lettera + (/b$/.test(armatura) ? 'b' : '#') + '/' + p.ottava;
    },

    /* "f#/4" -> "fa diesis" */
    aItaliano(k, conOttava) {
      const p = this.scomponi(k);
      let s = NOMI_IT[p.lettera];
      if (p.alt === '#') s += ' diesis';
      else if (p.alt === '##') s += ' doppio diesis';
      else if (p.alt === 'b') s += ' bemolle';
      else if (p.alt === 'bb') s += ' doppio bemolle';
      else if (p.alt === 'n') s += ' bequadro';
      return conOttava ? s + ' ' + p.ottava : s;
    },

    /* numero MIDI */
    midi(k) {
      const p = this.scomponi(k);
      let v = SEMI[p.lettera] + (p.ottava + 1) * 12;
      if (p.alt === '#') v += 1;
      else if (p.alt === '##') v += 2;
      else if (p.alt === 'b') v -= 1;
      else if (p.alt === 'bb') v -= 2;
      return v;
    },

    /* trasporta di n semitoni, notazione con diesis */
    trasporta(k, semitoni) {
      const m = this.midi(k) + semitoni;
      const CROM = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
      return CROM[((m % 12) + 12) % 12] + '/' + (Math.floor(m / 12) - 1);
    }
  };

  /* ==========================================================
     3. PARSER DELLA NOTAZIONE ABBREVIATA

     notes="c/4:q  e/4:8  f/4:8  g/4:h."
     accordi: c/4+e/4+g/4:h        pausa: r:q
     legatura di valore: c/4:q~ c/4:q     (la tilde lega alla nota dopo)
     terzina: c/4:8t d/4:8t e/4:8t        (la « t » su tutte e tre)
     ========================================================== */

  const DURATE_BATTITI = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125 };
  const DURATE_TONE    = { w: '1n', h: '2n', q: '4n', '8': '8n', '16': '16n', '32': '32n' };

  function leggiNote(testo) {
    return String(testo).trim().split(/[\s,]+/).filter(Boolean).map(gettone => {
      /* La stanghetta si scrive « | » in mezzo alle note. Non dura niente e
         non suona: è un segno per l'occhio, ed è esattamente questo che
         serve mostrare quando si spiega che cos'è una battuta. */
      if (gettone === '|' || gettone === '||' || gettone === '|:' || gettone === ':|') {
        return { keys: [], dur: 'q', puntata: false, pausa: false,
                 battiti: 0, stanghetta: gettone };
      }
      /* LA LEGATURA DI VALORE si scrive con una tilde in coda alla figura
         che comincia il suono: « c/4:q~ c/4:q ». Lega alla nota successiva,
         che è l'unica cosa che una legatura di valore possa fare.

         Serve dalla lezione 4, dove la legatura è metà dell'argomento, e
         serve *disegnata su un rigo* e non solo descritta a parole: il
         punto della lezione è che la legatura ricuce una durata tagliata
         dalla stanghetta, e la stanghetta sta sul rigo.

         La tilde si toglie prima di leggere la durata, altrimenti « q~ »
         non sarebbe una figura conosciuta e diventerebbe un quarto per
         via del ripiego — un errore muto, che si vedrebbe solo contando
         i battiti di una battuta. */
      const legata = gettone.endsWith('~');
      if (legata) gettone = gettone.slice(0, -1);
      const [parteNote, parteDur = 'q'] = gettone.split(':');
      /* LA TERZINA si scrive con una « t » in coda alla figura, su
         ciascuna delle tre note: « c/4:8t d/4:8t e/4:8t ».

         Perché il segno sta su ogni nota e non su una parentesi intorno
         al gruppo: una parentesi vuole un parser annidato, e sopra a un
         formato che per il resto è una nota per gettone sarebbe l'unica
         cosa che non si legge da sinistra a destra. Marcando le note, il
         gruppo si ricostruisce contando fino a tre — ed è la stessa cosa
         che fa chi legge.

         Il difetto possibile è dichiarato: una terzina scritta su due
         note sole, o su quattro, qui non dà errore. Lo trova
         `_notazione.py`, che conta i movimenti di ogni battuta, perché è
         lì che si vede: una terzina monca non torna. */
      const terzina = /t\.?$/.test(parteDur);
      const puntata = parteDur.includes('.');
      const dur = parteDur.replace(/[.t]/g, '') || 'q';
      const pausa = /^r$/i.test(parteNote);
      const keys = pausa ? ['b/4'] : parteNote.split('+').map(s => s.trim().toLowerCase());
      let battiti = DURATE_BATTITI[dur] || 1;
      if (puntata) battiti *= 1.5;
      /* tre nel tempo di due: ogni nota dura due terzi di quello che
         c'è scritto, ed è **questa** riga che fa suonare la terzina —
         la parentesi col numero sopra è solo come si vede. */
      if (terzina) battiti *= 2 / 3;
      return { keys, dur, puntata, pausa, battiti, legata, terzina };
    });
  }

  /* Il segno di battuta, nella forma che VexFlow si aspetta. Se questa
     versione della libreria non avesse BarNote si ripiega su una pausa
     invisibile: meglio una stanghetta mancante che un pentagramma vuoto. */
  function stanghettaVF(VF, segno) {
    try {
      const b = new VF.BarNote();
      const T = VF.Barline ? VF.Barline.type : null;
      if (T) {
        if (segno === '||') b.setType(T.DOUBLE);
        else if (segno === '|:') b.setType(T.REPEAT_BEGIN);
        else if (segno === ':|') b.setType(T.REPEAT_END);
        else b.setType(T.SINGLE);
      }
      return b;
    } catch (e) {
      return new VF.GhostNote({ duration: 'q' });
    }
  }

  /* Le terzine, nella forma che VexFlow disegna: la parentesi e il « 3 ».

     Va chiamata **prima** che la voce riceva le note. `VF.Tuplet`, nel
     costruire, moltiplica i tick delle note che gli si danno: se la voce
     le ha già contate, le conta al valore scritto e la battuta risulta
     più lunga di quello che è. Costruire dopo non dà errore — dà una
     battuta che non torna, che è peggio.

     I gruppi si fanno contando fino a tre. Un gruppo che resta a due o
     a uno non diventa una terzina: si scarta, e la battuta non tornerà.
     È voluto — vedi il commento sulla « t » in `leggiNote`. */
  function costruisciTerzine(VF, dati, note) {
    const gruppi = [];
    let g = [];
    dati.forEach((d, i) => {
      if (d.stanghetta) { g = []; return; }
      if (!d.terzina) { g = []; return; }
      g.push(note[i]);
      if (g.length === 3) { gruppi.push(g); g = []; }
    });
    return gruppi.map(tre => {
      try {
        return new VF.Tuplet(tre, { num_notes: 3, notes_occupied: 2 });
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  }

  /* A quale nota si lega quella marcata con la tilde.

     Si scavalcano le stanghette, e non per completezza: è *il* caso che
     la lezione 4 deve mostrare. Una legatura che unisce due note dentro
     la stessa battuta si potrebbe quasi sempre scrivere col punto; quella
     che attraversa la stanghetta no, ed è la ragione per cui la legatura
     esiste. Se la tilde sta sull'ultima figura non c'è niente a cui
     legare e si restituisce -1, che chi chiama tratta come «nessuna». */
  function legataA(dati, i) {
    let j = i + 1;
    while (j < dati.length && dati[j].stanghetta) j++;
    return j < dati.length ? j : -1;
  }

  /* Disegna le legature di valore. Va chiamata **dopo** che la voce è
     stata formattata e disegnata: StaveTie chiede alle note dove sono
     finite sul rigo, e prima della formattazione non lo sanno ancora. */
  function disegnaLegature(VF, ctx, dati, note) {
    for (let i = 0; i < dati.length; i++) {
      if (!dati[i].legata || dati[i].stanghetta || dati[i].pausa) continue;
      const j = legataA(dati, i);
      if (j < 0 || dati[j].pausa) continue;
      const quante = Math.min(dati[i].keys.length, dati[j].keys.length);
      const indici = Array.from({ length: quante }, (_, k) => k);
      try {
        new VF.StaveTie({
          firstNote: note[i], lastNote: note[j],
          firstIndexes: indici, lastIndexes: indici
        }).setContext(ctx).draw();
      } catch (e) { /* meglio una legatura mancante che un rigo vuoto */ }
    }
  }

  /* ══ I SEGNI SULLA PARTITURA ══════════════════════════════════════
     Andrea, 30 agosto 2026: «per le analisi sarebbe importante segnalare
     le cose in partitura, quindi far vedere la partitura con i segni
     delle cose importanti mentre se ne parla».

     È la cosa che mancava a tutto il quinto anno, che è analisi da capo
     a fondo. Fino a oggi una slide di analisi poteva scrivere «alla
     battuta 5 entra la risposta» e far vedere il rigo: chi legge doveva
     contare le battute con il dito. Il `caption` diceva dove guardare,
     il disegno no — e su un rigo di venti battute la distanza fra le due
     cose è il punto in cui uno studente si perde.

     COME SI SCRIVE:

         segna="b3=entra la risposta · b7-b9=pedale di tonica"

     · `b3`      tutta la battuta 3
     · `b3.2`    la seconda nota della battuta 3
     · `n5`      la quinta nota del rigo, battute a parte
     · `b7-b9`   dalla battuta 7 alla 9 comprese
     · `n5-n9`   dalla quinta nota alla nona
     Il testo dopo `=` è l'etichetta; senza, si disegna il segno e basta.

     I segni si separano con `·`, che è il separatore di tutto il corso.

     ⚠ CON `a-passi` I SEGNI NON SI VEDONO SUBITO. Compaiono uno per
     volta, a ogni clic, e sotto il rigo si legge l'etichetta di quello
     appena comparso. È la richiesta letterale — «mentre se ne parla» —
     ed è l'unico modo perché il segno arrivi *dopo* la domanda invece
     che prima: un rigo con tutti i segni addosso ha già risposto.

     PERCHÉ SVG A MANO E NON UN MODIFICATORE DI VexFlow. Perché i segni
     devono potersi accendere e spegnere uno alla volta, e un modificatore
     si disegna insieme alla nota: per nasconderlo bisognerebbe ridisegnare
     tutto il rigo a ogni clic. Un `<g>` per segno si mostra e si nasconde
     con una riga, e non tocca niente di quello che c'è sotto. */

  /* «b3.2=la sensibile» → {tipo:'b', da:3, nota:2, a:null, testo:'…'} */
  function leggiSegni(testo) {
    if (!testo) return [];
    return String(testo).split(/\s*[·|]\s*/).map(function (pezzo) {
      const eq = pezzo.indexOf('=');
      const dove = (eq < 0 ? pezzo : pezzo.slice(0, eq)).trim();
      const etichetta = eq < 0 ? '' : pezzo.slice(eq + 1).trim();
      const parti = dove.split('-').map(s => s.trim()).filter(Boolean);
      function punto(s) {
        const m = String(s).match(/^([bn])\s*(\d+)(?:\.(\d+))?$/i);
        if (!m) return null;
        return { tipo: m[1].toLowerCase(),
                 numero: parseInt(m[2], 10),
                 nota: m[3] ? parseInt(m[3], 10) : null };
      }
      const da = punto(parti[0]);
      if (!da) return null;
      return { da: da, a: parti[1] ? punto(parti[1]) : null,
               testo: etichetta };
    }).filter(Boolean);
  }

  /* Da un punto («b3.2», «n5») all'intervallo di indici dentro `dati`.

     ⚠ SI CONTANO I SUONI, NON I SEGNI SUL RIGO. Le stanghette e **le
     pause** non entrano nel conto: `n4` è il quarto suono che si sente,
     non la quarta cosa disegnata.

     Non è una comodità, è l'unico modo perché il segno dica quello che
     dice la lezione. Il soggetto del BWV 847 comincia con una pausa di
     croma, e la lezione 4 dell'unità 11 scrive «il quarto suono è sol»:
     contando anche la pausa, `n4` avrebbe segnato il do e la freccia
     avrebbe indicato la nota sbagliata sotto una frase giusta. È il
     guasto che questo progetto continua a incontrare — il disegno che
     contraddice il testo — e qui si evita scegliendo il conto del
     musicista invece di quello del disegnatore.

     Chi voglia segnare una pausa segna la battuta intera. */
  function indiciDelSegno(dati, punto) {
    const battuta = [];      // battuta di ciascun indice
    const nellaBattuta = []; // quantesimo SUONO dentro la sua battuta
    const progressiva = [];  // quantesimo suono del rigo
    let b = 1, dentro = 0, tutte = 0;
    for (let i = 0; i < dati.length; i++) {
      if (dati[i].stanghetta) { b++; dentro = 0; battuta.push(null);
                                nellaBattuta.push(null); progressiva.push(null);
                                continue; }
      if (dati[i].pausa) { battuta.push(b); nellaBattuta.push(null);
                           progressiva.push(null); continue; }
      dentro++; tutte++;
      battuta.push(b); nellaBattuta.push(dentro); progressiva.push(tutte);
    }
    const dentroA = [];
    for (let i = 0; i < dati.length; i++) {
      if (battuta[i] === null) continue;
      if (punto.tipo === 'n') {
        if (progressiva[i] === punto.numero) dentroA.push(i);
      } else {
        if (battuta[i] !== punto.numero) continue;
        if (punto.nota === null || nellaBattuta[i] === punto.nota) dentroA.push(i);
      }
    }
    return dentroA;
  }

  /* ==========================================================
     4. <tac-stave> — PENTAGRAMMA

     <tac-stave
        clef="treble"          chiave: treble | bass | alto | tenor
        time="4/4"             indicazione di tempo (facoltativa)
        keysig="G"             armatura (facoltativa)
        notes="c/4:q e/4:q"
        caption="La scala di do maggiore"
        tempo="90"             per la riproduzione
        play                   mostra il pulsante Ascolta
        width="640">
     </tac-stave>

     ── LA SCRITTURA A QUATTRO PARTI, 18 agosto ────────────────────
     Andrea: «nella scrittura a quattro voci le stanghette delle note
     vanno nelle direzioni opposte». È la convenzione, e non è un vezzo
     tipografico: il gambo è **il modo in cui si legge quale nota
     appartiene a quale voce**. Sul rigo acuto stanno soprano e
     contralto; se le due note sono scritte come un accordo hanno un
     gambo solo, e le due linee smettono di essere leggibili come linee.
     Su una lezione che passa un'ora a dire «le voci sono quattro
     persone», il disegno diceva il contrario del testo — lo stesso
     guasto della graffa e della travatura a due sotto la didascalia
     «tre».

     Quindi quattro attributi, uno per voce:

        soprano="g/4:h a/4:h"     rigo acuto, gambo in su
        contralto="e/4:h e/4:h"   rigo acuto, gambo in giù
        tenore="c/4:h c/4:h"      rigo grave, gambo in su
        basso="c/3:h a/2:h"       rigo grave, gambo in giù

     Basta `soprano` per entrare in questa modalità. `notes` e `bass`
     restano quello che erano — una linea per rigo, gambo automatico —
     e servono a tutto il resto: melodie, ritmi, esempi a una voce.
     Non si è cambiato il loro comportamento perché li usano oltre cento
     righi già scritti, e un cambiamento silenzioso su quelli sarebbe
     l'errore 10 rifatto una terza volta.

     ── E IL RIGO GRAVE ADESSO SUONA ───────────────────────────────
     Guardando `suona` per aggiungere le voci nuove è venuto fuori che
     il rigo grave **non è mai stato suonato**: la riproduzione
     percorreva soltanto `this._dati`, cioè la voce acuta. Ogni esempio
     di armonia a due righi faceva sentire mezza armonia — il basso, che
     è quello che regge tutto, era muto. Nessuno se n'era accorto perché
     l'esempio suonava, e un esempio che suona sembra un esempio che
     funziona.
     ========================================================== */

  class TacStave extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      this.render();
    }

    render() {
      const VF = window.VexFlow;
      const clef    = this.getAttribute('clef')   || 'treble';
      const time    = this.getAttribute('time')   || '';
      const keysig  = this.getAttribute('keysig') || '';
      this._armatura = keysig;   /* la riproduzione la applica: v. conArmatura */
      const caption = this.getAttribute('caption') || '';
      /* LE QUATTRO PARTI. Basta `soprano` per entrare in questa modalità:
         il rigo acuto prende soprano e contralto, il grave tenore e basso,
         e ciascuna voce ha il suo gambo. Senza, tutto resta come prima. */
      const quattro = this.hasAttribute('soprano');
      const testo   = quattro ? (this.getAttribute('soprano') || '')
                              : (this.getAttribute('notes') || '');
      this._tempo   = parseFloat(this.getAttribute('tempo') || '84');
      const larghezza = parseInt(this.getAttribute('width') || '0', 10) ||
                        Math.min(880, Math.max(340, (this.clientWidth || 700) - 40));

      if (caption) {
        const d = document.createElement('div');
        d.className = 'tac-didascalia';
        d.textContent = caption;
        this.appendChild(d);
      }

      const tela = document.createElement('div');
      /* ASCOLTO ALLA CIECA. Con `nascondi` il rigo si disegna — serve, perché
         è da lì che nasce il suono — ma non si vede: resta il solo pulsante
         di ascolto.

         È un modo di fare lezione che ricorre: si ascolta prima e si guarda
         dopo, e fra le due cose ci sta la domanda. Mostrare subito la
         partitura risponde alla domanda prima di averla fatta — chi legge
         conta le voci con gli occhi invece che con l'orecchio. Nasce per la
         prima ora della seconda, dove si chiede «quante ne senti?» e la
         slide dopo fa vedere le stesse battute. */
      if (this.hasAttribute('nascondi')) {
        tela.style.position = 'absolute';
        tela.style.left = '-99999px';
        tela.setAttribute('aria-hidden', 'true');
      }
      this.appendChild(tela);

      const dati = leggiNote(testo);
      this._dati = dati;

      const renderer = new VF.Renderer(tela, VF.Renderer.Backends.SVG);
      const altezza = clef === 'bass' ? 150 : 150;
      renderer.resize(larghezza, altezza);
      const ctx = renderer.getContext();

      const testoBasso = quattro ? this.getAttribute('basso')
                                 : this.getAttribute('bass');
      const doppio = testoBasso !== null;
      if (doppio) renderer.resize(larghezza, 260);

      const stave = new VF.Stave(10, 22, larghezza - 24);
      stave.addClef(clef);
      if (keysig) stave.addKeySignature(keysig);
      if (time)   stave.addTimeSignature(time);
      stave.setContext(ctx).draw();

      let staveB = null;
      if (doppio) {
        staveB = new VF.Stave(10, 132, larghezza - 24);
        staveB.addClef('bass');
        if (keysig) staveB.addKeySignature(keysig);
        if (time)   staveB.addTimeSignature(time);
        staveB.setContext(ctx).draw();
        /* LA GRAFFA È DEL PIANOFORTE, NON DI DUE VOCI. Andrea, 17 agosto:
           «non mettiamo la parentesi graffa su un rigo non per pianoforte».
           La graffa dice «un solo esecutore, due mani»; due voci che
           cantano vogliono la **parentesi quadra**, che dice «parti
           diverse dello stesso sistema». Su una lezione che passa un'ora a
           spiegare che le voci sono due, una graffa dice il contrario del
           testo. Con `pianoforte` si torna alla graffa. */
        new VF.StaveConnector(stave, staveB)
          .setType(this.hasAttribute('pianoforte')
                   ? VF.StaveConnector.type.BRACE
                   : VF.StaveConnector.type.BRACKET)
          .setContext(ctx).draw();
        new VF.StaveConnector(stave, staveB).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
        new VF.StaveConnector(stave, staveB).setType(VF.StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();
        this._staveB = staveB;
        this._datiB = leggiNote(testoBasso);
        if (this._datiB.length) {
          /* Nelle quattro parti il basso ha il gambo **in giù**, perché
             sopra di lui, sullo stesso rigo, c'è il tenore. Da solo il
             gambo lo sceglie VexFlow guardando l'altezza, ed è giusto
             così. */
          const noteB = this._datiB.map(d => {
            if (d.stanghetta) return stanghettaVF(VF, d.stanghetta);
            const sn = new VF.StaveNote({ keys: d.keys, duration: d.dur + (d.pausa ? 'r' : ''), clef: 'bass' });
            if (quattro) sn.setStemDirection(VF.Stem.DOWN);
            if (!d.pausa) d.keys.forEach((k, i) => {
              const p = N.scomponi(k);
              if (p.alt) sn.addModifier(new VF.Accidental(p.alt), i);
            });
            if (d.puntata) VF.Dot.buildAndAttach([sn], { all: true });
            return sn;
          });
          const totB = this._datiB.reduce((a, d) => a + d.battiti, 0);
          const vB = new VF.Voice({ numBeats: Math.max(1, Math.ceil(totB)), beatValue: 4 });
          vB.setMode(VF.VoiceMode.SOFT);
          vB.addTickables(noteB);
          const perGruppoB = parseInt(this.getAttribute('travatura') || '', 10);
          const travB = VF.Beam.generateBeams(
            noteB.filter((n, i) => !this._datiB[i].pausa && !this._datiB[i].stanghetta),
            perGruppoB > 0 ? { groups: [new VF.Fraction(perGruppoB, 8)] } : undefined);
          /* e adesso il gambo torna in giù: `generateBeams` l'ha appena
             ricalcolato. Solo a quattro parti — da solo, il basso tiene
             la direzione che gli viene dall'altezza. */
          if (quattro) noteB.forEach((n, i) => {
            const d = this._datiB[i];
            if (d && (d.pausa || d.stanghetta)) return;
            if (typeof n.setStemDirection === 'function') n.setStemDirection(VF.Stem.DOWN);
          });
          /* NON SI FORMATTA ANCORA: si mette da parte. Le due voci vanno
             formattate **insieme**, altrimenti ogni rigo distribuisce le
             sue note per conto suo e le simultanee non cadono incolonnate.
             Andrea, 17 agosto: «le voci devono essere correttamente
             ordinate anche in senso verticale».

             Era il difetto: due `new VF.Formatter()` separati, uno per
             rigo. Ognuno faceva un lavoro corretto, e il risultato era una
             partitura in cui la terza battuta della voce acuta stava sopra
             la seconda della grave. Su una lezione che chiede di seguire
             due linee simultanee, è il disegno che smentisce il contenuto. */
          this._vociGiu = { voce: vB, trav: travB };
        }
      }

      /* ══ IL GAMBO SI RIMETTE DOPO LE TRAVATURE ══
         Andrea, 21 agosto, guardando la prima lezione dell'unità 10: «le
         direzioni delle gambe sono sbagliate». Soprano con il gambo in
         giù e basso in su: le due voci **esterne** invertite, le due
         interne giuste.

         La causa è `VF.Beam.generateBeams`, che di suo ha
         `maintain_stem_directions: false` e **ricalcola** la direzione dei
         gambi del gruppo che gli si passa — anche quando il gruppo è di
         una nota sola e non produce nessuna travatura. Il soprano e il
         basso ci passano (righe 1096 e 1206); il contralto e il tenore no,
         e per questo erano gli unici due giusti.

         Il difetto è del genere peggiore: non dà errore, disegna quattro
         note nel posto giusto, e sbaglia l'unica cosa che dice **a chi
         appartiene una nota**. Su una lezione che insegna a leggere quattro
         linee, il disegno smentiva il contenuto.

         Si rimette dopo, e non ci si fida di un'opzione: `generateBeams`
         viene chiamato in due punti diversi con configurazioni diverse, e
         una terza chiamata domani se ne dimenticherebbe. Questo passaggio
         è l'ultimo prima di formattare, e vale per tutti. */
      const rimettiGambi = (note, dati, verso) => {
        note.forEach((n, i) => {
          if (dati[i] && (dati[i].pausa || dati[i].stanghetta)) return;
          if (typeof n.setStemDirection === 'function') n.setStemDirection(verso);
        });
      };

      /* LE DUE VOCI INTERNE, contralto e tenore.

         Stanno sul rigo di qualcun altro: il contralto sotto il soprano,
         il tenore sopra il basso. Il gambo è l'unica cosa che dice a chi
         appartiene una nota, e per questo va **imposto**, non lasciato
         decidere all'altezza: un contralto che sale sopra il soprano
         avrebbe altrimenti il gambo in su e le due linee si
         scambierebbero sotto gli occhi di chi legge. */
      const vociInterne = [];
      if (quattro) {
        [['contralto', clef, VF.Stem.DOWN, stave],
         ['tenore',    'bass', VF.Stem.UP,  staveB]].forEach(([nome, ch, verso, rigo]) => {
          const testoV = this.getAttribute(nome);
          if (testoV === null || !rigo) return;
          const dV = leggiNote(testoV);
          if (!dV.length) return;
          const noteV = dV.map(d => {
            if (d.stanghetta) return stanghettaVF(VF, d.stanghetta);
            const sn = new VF.StaveNote({ keys: d.keys,
                                          duration: d.dur + (d.pausa ? 'r' : ''),
                                          clef: ch });
            sn.setStemDirection(verso);
            if (!d.pausa) d.keys.forEach((k, i) => {
              const p = N.scomponi(k);
              if (p.alt) sn.addModifier(new VF.Accidental(p.alt), i);
            });
            if (d.puntata) VF.Dot.buildAndAttach([sn], { all: true });
            return sn;
          });
          const tot = dV.reduce((a, d) => a + d.battiti, 0);
          const vv = new VF.Voice({ numBeats: Math.max(1, Math.ceil(tot)), beatValue: 4 });
          vv.setMode(VF.VoiceMode.SOFT);
          vv.addTickables(noteV);
          vociInterne.push({ nome: nome, dati: dV, note: noteV, voce: vv, rigo: rigo });
        });
      }
      this._vociInterne = vociInterne;

      if (dati.length) {
        const note = dati.map(d => {
          if (d.stanghetta) return stanghettaVF(VF, d.stanghetta);
          const sn = new VF.StaveNote({
            keys: d.keys,
            duration: d.dur + (d.pausa ? 'r' : ''),
            clef: clef
          });
          /* il soprano ha il gambo in su: sotto di lui c'è il contralto */
          if (quattro) sn.setStemDirection(VF.Stem.UP);
          if (!d.pausa) {
            d.keys.forEach((k, i) => {
              const p = N.scomponi(k);
              if (p.alt) sn.addModifier(new VF.Accidental(p.alt), i);
            });
          }
          if (d.puntata) VF.Dot.buildAndAttach([sn], { all: true });
          return sn;
        });

        /* Le terzine si costruiscono qui, prima della voce: `VF.Tuplet`
           corregge i tick delle note, e la voce deve contarle già
           corrette. */
        const terzine = costruisciTerzine(VF, dati, note);

        const totale = dati.reduce((s, d) => s + d.battiti, 0);
        const voce = new VF.Voice({ numBeats: Math.max(1, Math.ceil(totale)), beatValue: 4 });
        voce.setMode(VF.VoiceMode.SOFT);
        voce.addTickables(note);

        /* le travature non attraversano una stanghetta, e i gruppi si
           formano dentro ciascuna battuta separatamente */
        /* COME SI RAGGRUPPANO LE CROME.

           `generateBeams` senza opzioni raggruppa **sempre a due**: è
           l'impostazione di VexFlow e va benissimo per la suddivisione
           binaria, che è il caso più frequente. Ma un esempio di
           suddivisione ternaria disegnato così mostra gruppi di due sotto
           una didascalia che dice «tre», cioè insegna il contrario di quello
           che afferma — ed è successo davvero, nella lezione 3, alla slide
           che serviva proprio a far vedere la differenza. Se n'è accorto
           Andrea guardando, non un controllo: nessuno dei controlli
           automatici legge le didascalie.

           Con `travatura="3"` i gruppi si formano a tre. Il numero è quanti
           ottavi stanno sotto una travatura sola. */
        const perGruppo = parseInt(this.getAttribute('travatura') || '', 10);
        this._perGruppo = perGruppo > 0 ? perGruppo : 0;
        const modoTravatura = perGruppo > 0
          ? { groups: [new VF.Fraction(perGruppo, 8)] } : undefined;
        const travature = [];
        let gruppo = [];
        dati.forEach((d, i) => {
          if (d.stanghetta) {
            travature.push(...VF.Beam.generateBeams(gruppo, modoTravatura));
            gruppo = []; return;
          }
          if (!d.pausa) gruppo.push(note[i]);
        });
        travature.push(...VF.Beam.generateBeams(gruppo, modoTravatura));
        /* e il soprano riprende il gambo in su, per la stessa ragione */
        if (quattro) rimettiGambi(note, dati, VF.Stem.UP);
        /* UN SOLO FORMATTER PER TUTTE LE VOCI DEL SISTEMA. È quello che
           incolonna le simultanee: il formattatore guarda tutte le voci
           insieme, trova gli istanti in cui qualcosa accade e dà a
           ciascuno la stessa ascissa su tutti i righi. Con un formattatore
           per rigo ognuno faceva bene il suo lavoro e le colonne non
           tornavano. */
        const giu = this._vociGiu;
        /* Le voci che condividono un rigo si uniscono **fra loro** — è
           `joinVoices` che le fa cadere sulla stessa colonna — e poi tutto
           il sistema si formatta in una volta sola. */
        const suRigo = (r) => vociInterne.filter(v => v.rigo === r).map(v => v.voce);
        const F = new VF.Formatter();
        F.joinVoices([voce].concat(suRigo(stave)));
        if (giu) F.joinVoices([giu.voce].concat(suRigo(staveB)));
        const tutte = [voce].concat(giu ? [giu.voce] : [])
                            .concat(vociInterne.map(v => v.voce));
        F.format(tutte, larghezza - 90);
        voce.draw(ctx, stave);
        travature.forEach(b => b.setContext(ctx).draw());
        /* La parentesi col « 3 » si disegna dopo la voce: come le
           legature, chiede alle note dove sono finite sul rigo. */
        terzine.forEach(t => t.setContext(ctx).draw());
        disegnaLegature(VF, ctx, dati, note);
        if (giu) {
          giu.voce.draw(ctx, staveB);
          giu.trav.forEach(b => b.setContext(ctx).draw());
        }
        vociInterne.forEach(v => {
          v.voce.draw(ctx, v.rigo);
          disegnaLegature(VF, ctx, v.dati, v.note);
        });

        this._note = note;

        /* ══ E ADESSO I SEGNI ══
           Si disegnano per ultimi, dopo che tutto il resto è sul rigo:
           un segno chiede alle note dove sono finite, e prima della
           formattazione nessuna nota lo sa. */
        this._segni = leggiSegni(this.getAttribute('segna'));
        if (this._segni.length) {
          this.disegnaSegni(tela, stave, dati, note);
        }
      } else if (this._vociGiu) {
        /* rigo acuto vuoto e grave pieno: caso raro ma possibile, e senza
           questo il grave non verrebbe disegnato affatto — la formattazione
           adesso vive nel ramo dell'acuto. */
        const g = this._vociGiu;
        new VF.Formatter().joinVoices([g.voce]).format([g.voce], larghezza - 90);
        g.voce.draw(ctx, staveB);
        g.trav.forEach(b => b.setContext(ctx).draw());
      }

      /* L'SVG nasce alto 150 pixel — 260 col doppio rigo — qualunque cosa
         contenga: e' l'altezza del caso peggiore, note molto acute o molto
         gravi con i tagli addizionali. Un rigo di ritmo su una riga sola ne
         usa meno della meta', e gli ottanta pixel che restano sono bianco,
         anche stampato. Su un foglio con sei righi fanno quasi mezza pagina,
         ed e' la ragione per cui il Workbook «sembra pieno di spazi vuoti e
         cose molto grandi».

         Si misura quello che e' stato disegnato davvero e si ritaglia
         l'altezza su quello. `getBBox` su un elemento non visibile risponde
         zero: in quel caso non si tocca niente e resta l'altezza di prima,
         che e' il caso dei pentagrammi dentro le slide non attive. */
      const disegno = tela.querySelector('svg');
      if (disegno) {
        /* Non si puo' chiedere la misura all'SVG intero: dentro c'e' un
           elemento grande quanto la tela, e la risposta e' sempre l'altezza
           di partenza. Misurato cosi' il ritaglio non ritagliava niente, e
           il difetto restava intatto pur essendo «corretto». Si guardano
           invece i pezzi disegnati uno per uno, scartando quelli alti quanto
           la tela, e si prende l'inviluppo. */
        const tesa = doppio ? 260 : 150;
        let su = Infinity, giu = -Infinity;
        disegno.querySelectorAll('path, rect, text, line, polygon, ellipse, circle')
          .forEach(function (el) {
            let b = null;
            try { b = el.getBBox(); } catch (e) { return; }
            if (!b || !b.height || b.height >= tesa - 2) return;
            if (b.y < su) su = b.y;
            if (b.y + b.height > giu) giu = b.y + b.height;
          });
        if (giu > su && giu - su > 10) {
          const cima = Math.max(0, Math.floor(su - 6));
          const alta = Math.min(tesa, Math.ceil(giu + 8)) - cima;
          disegno.setAttribute('viewBox', '0 ' + cima + ' ' + larghezza + ' ' + alta);
          disegno.setAttribute('height', alta);
          disegno.style.height = 'auto';
        }
      }

      if (this.hasAttribute('play') && dati.some(d => !d.pausa && !d.stanghetta)) {
        const barra = document.createElement('div');
        barra.className = 'tac-barra no-stampa';
        const bt = document.createElement('button');
        bt.className = 'btn';
        bt.innerHTML = '&#9654; Ascolta';
        bt.onclick = () => this.suona(bt);
        barra.appendChild(bt);

        if (this.hasAttribute('slow')) {
          const bl = document.createElement('button');
          bl.className = 'btn secondario';
          bl.innerHTML = '&#9654; Lento';
          bl.onclick = () => this.suona(bl, 0.55);
          barra.appendChild(bl);
        }
        this.appendChild(barra);
      }
    }

    /* ══ DISEGNA I SEGNI SOPRA IL RIGO ═══════════════════════════════
       Un segno su UNA nota è un cerchietto con la freccia che lo indica.
       Un segno su PIÙ note è una fascia con la parentesi quadra sopra.
       La forma non si sceglie a mano: la decide quante note copre, che è
       l'unica cosa che conta davvero — «questa nota» e «questo tratto»
       sono due gesti diversi e vanno disegnati diversi.

       ⚠ LE FRECCE SI DISEGNANO, NON SI INCOLLANO. Andrea aveva proposto
       di prenderle dalle immagini di Adobe Stock. Non si può, e la
       ragione è pratica prima che estetica: una freccia raster ha una
       misura sua e non sa dov'è la nota, quindi andrebbe posizionata a
       mano su ogni rigo e si scollerebbe al primo cambio di larghezza.
       Disegnata in SVG parte dalla coordinata che VexFlow ha dato alla
       nota, e resta puntata anche se il rigo si stringe. In più si
       stampa nera e nitida, che è come il Workbook va in fotocopia. */
    disegnaSegni(tela, stave, dati, note) {
      const svg = tela.querySelector('svg');
      if (!svg) return;
      const NS = 'http://www.w3.org/2000/svg';

      /* L'ascissa di una nota, chiedendola a VexFlow in tre modi.
         Le versioni cambiano nome ai metodi, e un segno che non si
         disegna è meglio di un errore che ferma tutta la slide. */
      function ics(n) {
        if (!n) return null;
        try { if (typeof n.getAbsoluteX === 'function') {
                const v = n.getAbsoluteX(); if (isFinite(v)) return v; } } catch (e) {}
        try { const b = n.getBoundingBox();
              if (b && isFinite(b.x)) return b.x + (b.w || 0) / 2; } catch (e) {}
        try { const b = n.getBoundingBox();
              if (b && isFinite(b.getX && b.getX())) return b.getX() + b.getW() / 2; } catch (e) {}
        return null;
      }

      let cima = 30, fondo = 100;
      try { cima = stave.getYForLine(0); fondo = stave.getYForLine(4); } catch (e) {}

      const gruppi = [];
      const etichette = [];
      this._segni.forEach((s, k) => {
        const a = indiciDelSegno(dati, s.da);
        const b = s.a ? indiciDelSegno(dati, s.a) : a;
        if (!a.length || !b.length) return;
        const primo = a[0], ultimo = b[b.length - 1];
        const x1 = ics(note[primo]), x2 = ics(note[ultimo]);
        if (x1 === null || x2 === null) return;
        const solaNota = (primo === ultimo);

        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'tac-segno');
        g.setAttribute('data-segno', String(k + 1));

        const sx = Math.min(x1, x2) - (solaNota ? 11 : 9);
        const dx = Math.max(x1, x2) + (solaNota ? 11 : 16);
        const su = cima - 10, giu = fondo + 10;

        if (solaNota) {
          /* ⚠ IL CERCHIETTO STA INTORNO ALLA TESTA, NON INTORNO AL RIGO.
             Nella prima versione lo centravo a metà del pentagramma: su
             una nota che sta in mezzo funzionava, su una acuta o grave
             diventava un ovale lungo che la nota la conteneva per caso.
             Trovato misurando le coordinate sul sito, non guardando —
             tutti e cinque i cerchi uscivano a `cy` 82, cioè sempre alla
             stessa altezza su cinque musiche diverse.
             Adesso l'altezza la chiede alla nota disegnata. */
          /* ⚠ L'ALTEZZA SI CHIEDE A VexFlow, NON AL LAYOUT.
             Il primo tentativo usava `getBBox()` sull'elemento SVG della
             nota. Non funzionava mai, e la ragione sta scritta cento
             righe più sotto, nel commento del ritaglio: **`getBBox` su un
             elemento non visibile risponde zero**, e una slide che non è
             quella attiva è `display:none`. Quindi il `try` finiva sempre
             nel `catch` e restava il centro del rigo — cioè il difetto
             che stavo correggendo, corretto solo in apparenza.
             Misurato di nuovo sul sito: tutti e cinque i cerchi ancora a
             `cy` 82, con il file nuovo già caricato. Il rimedio era
             sbagliato, non la diagnosi.

             `getYs()` invece è calcolato da VexFlow quando disegna, e non
             dipende da che cosa è visibile. Restituisce una y per ogni
             testa dell'accordo: si prende la media, così su un accordo il
             cerchio le comprende tutte. */
          let cy = (su + giu) / 2, ry = (giu - su) / 2;
          try {
            const n = note[primo];
            let ys = (typeof n.getYs === 'function') ? n.getYs() : null;
            if ((!ys || !ys.length) && typeof n.getYForTopText === 'function') {
              ys = null;
            }
            if (ys && ys.length) {
              cy = ys.reduce((a, y) => a + y, 0) / ys.length;
              /* il raggio verticale copre tutte le teste, più un margine;
                 su una nota sola diventa un cerchietto di 13. */
              const alto = Math.max.apply(null, ys);
              const basso = Math.min.apply(null, ys);
              ry = Math.max(13, (alto - basso) / 2 + 10);
            }
          } catch (e) { /* resta il centro del rigo, come prima */ }
          const c = document.createElementNS(NS, 'ellipse');
          c.setAttribute('cx', (sx + dx) / 2);
          c.setAttribute('cy', cy);
          c.setAttribute('rx', (dx - sx) / 2);
          c.setAttribute('ry', ry);
          c.setAttribute('fill', 'none');
          c.setAttribute('stroke', 'var(--segno, #b45309)');
          c.setAttribute('stroke-width', '2');
          g.appendChild(c);
          /* e la freccia che lo indica, da sopra.
             Si ferma appena sopra il cerchietto, non sopra il rigo: su
             una nota grave, una freccia che si ferma in cima al
             pentagramma indica il pentagramma, non la nota. */
          const f = document.createElementNS(NS, 'path');
          const cx = (sx + dx) / 2;
          const punta = Math.max(su - 5, cy - ry - 4);
          const coda = Math.min(punta - 20, su - 24);
          f.setAttribute('d', 'M ' + cx + ' ' + coda +
                              ' L ' + cx + ' ' + (punta - 1) +
                              ' M ' + (cx - 5) + ' ' + (punta - 7) +
                              ' L ' + cx + ' ' + punta +
                              ' L ' + (cx + 5) + ' ' + (punta - 7));
          f.setAttribute('fill', 'none');
          f.setAttribute('stroke', 'var(--segno, #b45309)');
          f.setAttribute('stroke-width', '2');
          f.setAttribute('stroke-linecap', 'round');
          g.appendChild(f);
        } else {
          /* la fascia sotto, chiara, e la parentesi quadra sopra */
          const r = document.createElementNS(NS, 'rect');
          r.setAttribute('x', sx); r.setAttribute('y', su);
          r.setAttribute('width', dx - sx); r.setAttribute('height', giu - su);
          r.setAttribute('rx', '4');
          r.setAttribute('fill', 'var(--segno-fondo, rgba(180,83,9,.13))');
          g.appendChild(r);
          const p = document.createElementNS(NS, 'path');
          p.setAttribute('d', 'M ' + sx + ' ' + (su - 12) +
                              ' L ' + sx + ' ' + (su - 20) +
                              ' L ' + dx + ' ' + (su - 20) +
                              ' L ' + dx + ' ' + (su - 12));
          p.setAttribute('fill', 'none');
          p.setAttribute('stroke', 'var(--segno, #b45309)');
          p.setAttribute('stroke-width', '2');
          g.appendChild(p);
        }

        if (s.testo) {
          const t = document.createElementNS(NS, 'text');
          t.setAttribute('x', (sx + dx) / 2);
          t.setAttribute('y', su - (solaNota ? 30 : 25));
          t.setAttribute('text-anchor', 'middle');
          t.setAttribute('font-size', '13');
          t.setAttribute('font-weight', '600');
          t.setAttribute('fill', 'var(--segno, #b45309)');
          t.textContent = s.testo;
          g.appendChild(t);
        }

        svg.appendChild(g);
        gruppi.push(g);
        etichette.push(s.testo || ('segno ' + (k + 1)));
        /* gli indici servono all'ascolto del solo tratto segnato */
        g._da = primo; g._a = ultimo;
      });

      this._gruppiSegni = gruppi;
      if (!gruppi.length) return;

      /* ══ A PASSI ══
         Senza `a-passi` i segni ci sono tutti e la slide è una tavola
         già commentata: va bene per il Workbook, dove non c'è nessuno
         che parla. In aula serve il contrario, e lo dice Andrea:
         «mentre se ne parla». Quindi si nascondono e si accendono a uno
         a uno, e sotto compare la frase del segno acceso. */
      if (!this.hasAttribute('a-passi')) return;
      gruppi.forEach(g => { g.style.display = 'none'; });

      const barra = document.createElement('div');
      barra.className = 'tac-barra no-stampa';
      const avanti = document.createElement('button');
      avanti.className = 'btn';
      avanti.innerHTML = '&#9654; Segna';
      const tutti = document.createElement('button');
      tutti.className = 'btn secondario';
      tutti.textContent = 'Tutti';
      const dice = document.createElement('div');
      dice.className = 'tac-didascalia tac-segno-detto';
      dice.setAttribute('aria-live', 'polite');

      let quanti = 0;
      const aggiorna = () => {
        gruppi.forEach((g, i) => { g.style.display = i < quanti ? '' : 'none'; });
        dice.textContent = quanti ? etichette[quanti - 1] : '';
        avanti.innerHTML = quanti >= gruppi.length
          ? '&#8635; Da capo'
          : '&#9654; Segna (' + (quanti + 1) + ' di ' + gruppi.length + ')';
      };
      avanti.onclick = () => {
        quanti = quanti >= gruppi.length ? 0 : quanti + 1;
        aggiorna();
        /* e se il rigo suona, si sente SOLO il tratto appena segnato:
           è la differenza fra dire «guarda qui» e farlo sentire. */
        if (this.hasAttribute('play') && quanti) {
          const g = gruppi[quanti - 1];
          this.suona(null, 1, g._da, g._a);
        }
      };
      tutti.onclick = () => { quanti = gruppi.length; aggiorna(); };
      barra.appendChild(avanti);
      barra.appendChild(tutti);
      this.appendChild(barra);
      this.appendChild(dice);
      aggiorna();
    }

    /* Riproduce la sequenza evidenziando le note.

       `da` e `a` limitano l'ascolto a un tratto: servono ai segni a
       passi, dove ogni clic fa sentire solo quello che ha appena
       segnato. Senza, si sente tutto, ed è il comportamento di sempre. */
    async suona(bottone, fattore = 1, da = null, a = null) {
      if (this._inCorso) return;
      this._inCorso = true;
      if (bottone) bottone.disabled = true;

      await Audio.avvia();
      if (!Audio.pronto) { this._inCorso = false; if (bottone) bottone.disabled = false; return; }

      /* Il pianoforte, non il sintetizzatore.

         Gli esempi suonavano con `Audio.synth`, un dente di sega con
         riverbero: un timbro che nessuno strumento fa, aspro sulle note
         ribattute e insopportabile su una sequenza di sei quarti uguali,
         che è esattamente la forma di ogni esempio ritmico. Segnalato da
         Andrea sulla slide «Diamo un nome al raggruppamento»: «il suono
         dell'esempio è terribile».

         Il pianoforte campionato c'era già ed era usato altrove: qui non
         era mai stato collegato. Si aspetta il caricamento, e se la rete
         manca o è lenta si torna al sintetizzatore, perché un esempio
         brutto è sempre meglio di un esempio muto in mezzo a una lezione.

         Vale per ogni <tac-stave> con `play`: gli esempi del corso devono
         suonare tutti allo stesso modo, come i battiti. */
      /* La regola: **dove ci sono le altezze suona il pianoforte, dove
         c'è solo la durata suonano i colpi.** Un rigo in chiave di
         percussione non ha altezze — le note stanno tutte sulla stessa
         riga perché la riga non vuol dire niente — e farlo suonare con uno
         strumento intonato aggiunge un'informazione che l'esempio non
         contiene, e che lo studente potrebbe prendere per buona. */
      const soloRitmo = (this.getAttribute('clef') || 'treble') === 'percussion';
      let voce = Audio.synth;
      if (!soloRitmo) {
        try {
          const piano = await Audio.strumento('salamander');
          if (piano) voce = piano;
        } catch (e) { /* resta il ripiego sintetico */ }
      }

      const durBattito = (60 / (this._tempo * fattore));

      /* ══ ASCOLTARE SOLO IL TRATTO SEGNATO ══
         `da` e `a` sono indici dentro `_dati`. Da lì si ricava una
         FINESTRA DI TEMPO — da quando comincia la nota `da` a quando
         finisce la nota `a` — e la finestra vale per **tutte le voci**,
         non solo per quella su cui sta il segno.

         Il tempo, e non gli indici: perché su un esempio a due righi il
         basso ha figure diverse dall'acuto, e l'indice 7 dell'uno non è
         l'indice 7 dell'altro. Con la finestra di tempo il basso suona
         quello che davvero sta sotto le battute segnate, che è l'unica
         cosa che serve a chi ascolta un'analisi.

         E la finestra si sposta all'inizio: si sente subito, non dopo
         sei battute di silenzio. */
      let inizio = 0, fine = Infinity;
      if (da !== null && this._dati) {
        let q = 0;
        this._dati.forEach((d, i) => {
          if (d.stanghetta) return;
          if (i === da) inizio = q;
          q += d.battiti;
          if (i === (a === null ? da : a)) fine = q;
        });
      }
      /* ⚠ IL SEGNO DI MAGGIORE, E NON È UN DETTAGLIO.
         Una nota che finisce ESATTAMENTE dove comincia il tratto segnato
         è fuori, non dentro: il suo `q1` vale quanto `inizio`. Con la
         tolleranza dalla parte sbagliata (`> inizio - 1e-9`) entrava, e
         siccome il tempo si conta dall'inizio del tratto le veniva
         assegnato un istante NEGATIVO — cioè partiva prima del clic.
         Trovato simulando i tempi fuori dal browser, non guardando. */
      const dentro = (q0, q1) => q1 > inizio + 1e-9 && q0 < fine - 1e-9;
      const quando = (q0) => Tone.now() + 0.15 + (q0 - inizio) * durBattito;
      let t = quando(inizio);

      /* LA LEGATURA DI VALORE NON È DUE SUONI: È UN SUONO SOLO, PIÙ LUNGO.

         Se la seconda nota riattaccasse, l'esempio farebbe sentire
         esattamente il contrario di quello che la slide afferma — e la
         slide che lo afferma è quella su cui la lezione 4 si regge. È lo
         stesso guasto della travatura a due sotto la didascalia «tre»:
         nessun controllo automatico lo vede, perché il codice gira e il
         rigo è disegnato bene.

         Quindi: la durata delle note legate si somma sulla prima, e le
         altre tacciono. Si percorre l'elenco **all'indietro** perché una
         catena di tre — « q~ q~ q » — sia già sommata quando si arriva al
         primo anello; in avanti la somma si fermerebbe al secondo. La
         linea del tempo invece avanza sempre con la durata scritta della
         figura, non con quella suonata, altrimenti le note dopo la
         legatura arriverebbero in ritardo di tutto il valore legato. */
      const durate = this._dati.map(d => d.battiti);
      const muta = this._dati.map(() => false);
      const catena = this._dati.map((_, i) => [i]);
      for (let i = this._dati.length - 1; i >= 0; i--) {
        const d = this._dati[i];
        if (!d.legata || d.stanghetta || d.pausa) continue;
        const j = legataA(this._dati, i);
        if (j < 0 || this._dati[j].pausa) continue;
        durate[i] += durate[j];
        muta[j] = true;
        catena[i] = [i].concat(catena[j]);
      }
      /* LA NOTA LEGATA SI ILLUMINA LO STESSO.
         Non riattacca — è un suono solo — ma se restasse spenta sembrerebbe
         che la legatura non ci sia, e la slide che la insegna direbbe il
         contrario di sé. Quindi il suono è uno e la luce è su tutte le teste
         della catena, per tutta la durata sommata: si vede esattamente
         quello che si sente, cioè un suono che attraversa due figure. */

      /* LE ALTRE VOCI SUONANO ANCHE LORO, e ciascuna sulla propria linea
         del tempo: una voce può avere figure di durata diversa dalle
         altre, quindi non basta accodare le note a quelle dell'acuta —
         va percorsa ognuna dal suo inizio.

         Prima qui c'era solo `this._dati`. Ogni esempio a due righi
         faceva sentire il rigo acuto e basta: il basso, che è quello che
         regge l'armonia, era muto. L'esempio suonava, quindi sembrava
         funzionare. */
      const altre = []
        .concat(this._datiB ? [this._datiB] : [])
        .concat((this._vociInterne || []).map(v => v.dati));
      if (!soloRitmo) altre.forEach(serie => {
        let qa = 0;   /* posizione in quarti dall'inizio di QUESTA voce */
        /* le legature valgono voce per voce, con lo stesso conto di sopra */
        const dur2 = serie.map(d => d.battiti);
        const muta2 = serie.map(() => false);
        for (let i = serie.length - 1; i >= 0; i--) {
          const d = serie[i];
          if (!d.legata || d.stanghetta || d.pausa) continue;
          const j = legataA(serie, i);
          if (j < 0 || serie[j].pausa) continue;
          dur2[i] += dur2[j]; muta2[j] = true;
        }
        serie.forEach((d, i) => {
          if (d.stanghetta) return;
          const q0 = qa;
          qa += d.battiti;
          if (!dentro(q0, qa)) return;   /* fuori dal tratto segnato */
          if (!d.pausa && !muta2[i]) {
            voce.triggerAttackRelease(
              d.keys.map(k => N.aTone(N.conArmatura(k, this._armatura))),
              Math.min(dur2[i], fine - q0) * durBattito * 0.92, quando(q0));
          }
        });
      });

      let dentroBattuta = 0;   /* posizione nella battuta, in quarti */
      let q = 0;               /* posizione dall'inizio, in quarti */
      let ultimo = quando(inizio);
      this._dati.forEach((d, i) => {
        if (d.stanghetta) { dentroBattuta = 0; return; }  /* non dura e non suona */
        const q0 = q;
        /* ⚠ `prima` è la posizione della nota DENTRO LA SUA BATTUTA, cioè
           quella che decide l'accento. Va letta prima di avanzare i due
           contatori: leggendola dopo, ogni colpo prenderebbe l'accento
           del colpo successivo — e su un rigo ritmico l'accento è
           l'unica cosa che si valuta. */
        const prima = dentroBattuta;
        q += d.battiti;
        dentroBattuta += d.battiti;
        if (!dentro(q0, q)) return;      /* fuori dal tratto segnato */
        t = quando(q0);
        ultimo = Math.max(ultimo, quando(Math.min(q, fine)));
        const suonati = Math.min(durate[i], fine - q0) * durBattito;
        if (!d.pausa && !muta[i]) {
          if (soloRitmo) {
            /* L'ACCENTO CADE DOVE CADE LA TRAVATURA.

               Prima ogni colpo aveva la stessa forza, e allora due righi
               con le **stesse sei crome** travate a due e a tre suonavano
               identici. La slide dell'unità 3 lezione 4 dice che fra sei
               battiti uguali e due battiti di tre «se ne accorge solo
               l'orecchio»: era vero in aula e falso nell'esempio, che è il
               modo peggiore di sbagliare — l'esempio suonava, quindi
               sembrava funzionare.

               Il conto si azzera a ogni stanghetta e va in quarti:
               `perGruppo` crome fanno perGruppo/2 di quarto. Senza
               `travatura` non si accenta niente, come prima. */
            const capo = this._perGruppo &&
                         Math.abs(prima % (this._perGruppo / 2)) < 1e-6;
            const liv = capo ? Audio.LIVELLI.metro : Audio.LIVELLI.ritmo;
            Audio.tick.triggerAttackRelease(liv.altezza, '64n', t, liv.forza);
          } else {
            voce.triggerAttackRelease(
              d.keys.map(k => N.aTone(N.conArmatura(k, this._armatura))),
              suonati * 0.92, t
            );
          }
          const teste = catena[i]
            .map(k => this._note && this._note[k] && this._note[k].getSVGElement())
            .filter(Boolean);
          if (teste.length) {
            const ms = (t - Tone.now()) * 1000;
            setTimeout(() => teste.forEach(el => {
              el.style.fill = '#f59e0b'; el.style.stroke = '#f59e0b';
            }), ms);
            setTimeout(() => teste.forEach(el => {
              el.style.fill = ''; el.style.stroke = '';
            }), ms + suonati * 1000);
          }
        }
      });

      const attesa = (ultimo - Tone.now()) * 1000 + 200;
      setTimeout(() => {
        this._inCorso = false;
        if (bottone) bottone.disabled = false;
      }, attesa);
    }
  }
  customElements.define('tac-stave', TacStave);

  /* ==========================================================
     5. <tac-piano> — TASTIERA

     <tac-piano from="c/4" to="c/6" labels highlight="c/4 e/4 g/4"></tac-piano>
     ========================================================== */

  const BIANCHI = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
  const NERO_DOPO = { c: 'c#', d: 'd#', f: 'f#', g: 'g#', a: 'a#' };

  class TacPiano extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;

      const da = N.scomponi(this.getAttribute('from') || 'c/4');
      const a  = N.scomponi(this.getAttribute('to')   || 'c/6');
      const etichette = this.hasAttribute('labels');
      this._tasti = {};

      const tast = document.createElement('div');
      tast.className = 'tac-tastiera';
      this.appendChild(tast);

      let ott = da.ottava;
      let idx = BIANCHI.indexOf(da.lettera);
      const fine = a.lettera + '/' + a.ottava;
      let sicurezza = 0;

      while (sicurezza++ < 90) {
        const lettera = BIANCHI[idx];
        const key = lettera + '/' + ott;

        const tb = document.createElement('div');
        tb.className = 'tac-tasto-b';
        tb.dataset.key = key;
        if (etichette) tb.textContent = NOMI_IT[lettera] + (lettera === 'c' ? ott : '');
        tb.onclick = () => this.premi(key);
        tast.appendChild(tb);
        this._tasti[key] = tb;

        const nero = NERO_DOPO[lettera];
        if (nero && key !== fine) {
          const kn = nero + '/' + ott;
          const tn = document.createElement('div');
          tn.className = 'tac-tasto-n';
          tn.dataset.key = kn;
          tn.onclick = e => { e.stopPropagation(); this.premi(kn); };
          tb.appendChild(tn);
          tn.style.left = 'calc(100% - 15px)';
          tn.style.top = '0';
          this._tasti[kn] = tn;
        }

        if (key === fine) break;
        idx++;
        if (idx > 6) { idx = 0; ott++; }
      }

      const ev = this.getAttribute('highlight');
      if (ev) this.evidenzia(ev.split(/[\s,]+/));
    }

    async premi(key) {
      const t = this._tasti[key];
      if (t) {
        t.classList.add('suona');
        setTimeout(() => t.classList.remove('suona'), 380);
      }
      await Audio.nota(N.aTone(key), '4n');
      this.dispatchEvent(new CustomEvent('tac:nota', { detail: { key }, bubbles: true }));
    }

    evidenzia(keys) {
      Object.values(this._tasti).forEach(t => t.classList.remove('evid'));
      (keys || []).forEach(k => {
        const t = this._tasti[String(k).trim().toLowerCase()];
        if (t) t.classList.add('evid');
      });
    }
  }
  customElements.define('tac-piano', TacPiano);

  /* ==========================================================
     6. <tac-quiz> — DOMANDE AUTOCORRETTIVE

     <tac-quiz titolo="Verifica al volo">
       [{"d":"Quante linee ha il pentagramma?",
         "o":["4","5","6","7"], "c":1,
         "spiega":"Cinque linee e quattro spazi."}]
     </tac-quiz>
     ========================================================== */

  const LETTERE = 'ABCDEFGH';

  /* Il tasto che azzera il conteggio, uguale per tutti i componenti.

     Un punteggio che non si può azzerare non serve a niente in classe: la
     prima ora lo si usa per provare, si sbaglia apposta, e da quel momento
     il conteggio resta sporco per tutta la lezione e nessuno se ne fida
     più. Sta nella testata, piccolo e a destra, e chiede conferma solo
     quando c'è davvero qualcosa da perdere.

     Ogni componente passa la propria funzione di azzeramento: la testata è
     uguale per tutti, quello che va rimesso a zero no. */
  function tastoAzzera(testata, azzera, quante) {
    if (!testata) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tac-azzera';
    b.title = 'Ricomincia da capo, punteggio a zero';
    b.setAttribute('aria-label', 'Azzera il punteggio');
    b.innerHTML = '&#8635; azzera';
    b.onclick = () => {
      const n = typeof quante === 'function' ? quante() : 0;
      if (n > 0 && !confirm('Azzero il punteggio e ricomincio da capo?')) return;
      azzera();
    };
    testata.appendChild(b);
    return b;
  }
  TAC.tastoAzzera = tastoAzzera;

  /* Quante colonne per le risposte, dato quante sono.

     Non lo può decidere il CSS da solo: `auto-fit` con un minimo in rem dà
     un numero diverso a seconda dello zoom del browser, e infatti lo stesso
     esercizio si vedeva su quattro colonne su un monitor e tutto incolonnato
     su un portatile. Qui il numero è fisso e dipende solo dal contenuto.

     Due risposte stanno affiancate — vero e falso vanno visti insieme.
     Tre stanno in fila. Quattro fanno due righe da due, che è meglio di
     una fila di quattro strette. Da cinque in su, tre per riga. */
  function colonne(n) {
    if (n <= 3) return n;
    if (n === 4) return 2;
    return 3;
  }

  /* ==========================================================
     IL BLOCCO DEL CODICE D'ESITO

     Un esercizio che si corregge da sé sa il punteggio, ma il sito è
     statico e non c'è nessun server a cui mandarlo: il codice è il
     punteggio reso trasportabile a mano. Lo studente lo copia e lo incolla
     su Classroom; l'insegnante lo incolla nella pagina di decodifica.

     Sta qui e non dentro i singoli esercizi perché lo useranno tutti, e la
     regola del tentativo — quella che fa scendere il valore — deve essere
     una sola. Scritta due volte, prima o poi le due copie conterebbero
     diversamente, e nessuno se ne accorgerebbe finché un voto non risulta
     sbagliato.
     ========================================================== */

  const CHIAVE_NOME = 'tac-nome';

  /* Il nome si chiede una volta e resta. Chiederlo a ogni esercizio
     sarebbe sei volte per lezione, e alla terza si scrive «asd». */
  function nomeSalvato() {
    try { return localStorage.getItem(CHIAVE_NOME) || ''; } catch (e) { return ''; }
  }
  function salvaNome(n) {
    try { localStorage.setItem(CHIAVE_NOME, n); } catch (e) { /* niente */ }
  }

  /* Un tentativo per scheda, contato qui. Cancellare i dati del browser lo
     azzera: è un limite vero e non c'è modo di chiuderlo senza un server.
     Serve a misurare l'onestà normale, non a resistere a chi vuole barare. */
  function contaTentativo(scheda) {
    var n = 1;
    try {
      n = (parseInt(localStorage.getItem('tac-tent-' + scheda), 10) || 0) + 1;
      localStorage.setItem('tac-tent-' + scheda, n);
    } catch (e) { /* niente */ }
    return n;
  }

  /* Dove finisce il risultato di un esercizio.

     Fuori da una verifica, un esercizio e' una cosa a se' e il suo
     risultato diventa subito un codice. Dentro una verifica no: il codice
     e' uno solo, alla fine, per tutta la prova. Il singolo esercizio non
     deve sapere in quale dei due mondi si trova -- lo chiede qui, e questo
     e' l'unico punto in cui la differenza esiste. */
  function segnalaEsito(ospite, dati) {
    var prova = ospite.closest && ospite.closest('tac-verifica');
    if (prova && prova.registra) {
      prova.registra(ospite, dati.risposte);
      return null;
    }
    return bloccoCodice(ospite, dati);
  }

  /* Un esercizio sta dentro una verifica? Allora non corregge.
     Lo chiedono in tre punti — il quiz, il trascinamento e la
     testata — e chiederlo con una funzione sola evita che uno dei
     tre un giorno lo chieda in modo leggermente diverso. */
  function dentroVerifica(el) {
    return !!(el.closest && el.closest('tac-verifica'));
  }

  /* Il codice gia' fatto, messo davanti allo studente perche' lo copi.

     Diverso da `bloccoCodice` in una cosa sola, ed e' quella che conta: non
     chiede il nome. Nel codice della verifica il nome non c'e' — sul sito
     non finiscono dati di minori, e l'identita' su Classroom la da' gia'
     la consegna. Chiederlo per poi non usarlo sarebbe raccogliere un dato
     per abitudine.

     Il tentativo non si conta piu' qui. Contarlo serviva a far valere meno
     la ripetizione, ma il conto stava in `localStorage` e si azzerava
     svuotando i dati del browser: misurava l'onesta' di chi era gia'
     onesto. Adesso ogni giro ha un seme diverso e il docente vede due
     codici distinti: e' la stessa informazione, presa da un fatto invece
     che da una promessa. */
  function bloccoCodiceEsito(ospite, codice, sigla) {
    var box = document.createElement('div');
    box.className = 'tac-codice no-stampa';
    box.innerHTML =
      '<p class="tac-codice-invito">Copia questo codice e incollalo su ' +
      'Classroom insieme al compito.</p>' +
      '<div class="tac-codice-riga">' +
        '<code class="tac-codice-valore">' + codice + '</code>' +
        '<button type="button" class="btn secondario tac-codice-copia">Copia</button>' +
      '</div>' +
      '<p class="tac-codice-nota">' + (sigla || '') + '</p>';
    ospite.appendChild(box);

    box.querySelector('.tac-codice-copia').onclick = function () {
      var b = this;
      navigator.clipboard.writeText(codice).then(function () {
        b.textContent = 'Copiato';
        setTimeout(function () { b.textContent = 'Copia'; }, 1800);
      }).catch(function () {
        var r = document.createRange();
        r.selectNodeContents(box.querySelector('.tac-codice-valore'));
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        b.textContent = 'Copia a mano';
      });
    };
    return box;
  }

  function bloccoCodice(ospite, dati) {
    if (!dati.scheda || !window.TACCodice) return null;

    var box = document.createElement('div');
    box.className = 'tac-codice no-stampa';
    ospite.appendChild(box);

    function mostraCodice(nome) {
      var tent = ospite._tentativo ||
                 (ospite._tentativo = contaTentativo(dati.scheda));
      var codice = window.TACCodice.genera({
        scheda: dati.scheda, nome: nome,
        punti: dati.punti, massimo: dati.massimo, tentativo: tent
      });
      box.innerHTML =
        '<p class="tac-codice-invito">Copia questo codice e incollalo su ' +
        'Classroom insieme al compito.</p>' +
        '<div class="tac-codice-riga">' +
          '<code class="tac-codice-valore">' + codice + '</code>' +
          '<button type="button" class="btn secondario tac-codice-copia">Copia</button>' +
        '</div>' +
        '<p class="tac-codice-nota">' + nome +
          (tent > 1 ? ' &middot; tentativo ' + tent : '') +
          ' &middot; <a href="#" class="tac-codice-cambia">non sei tu?</a></p>';

      box.querySelector('.tac-codice-copia').onclick = function () {
        var b = this;
        navigator.clipboard.writeText(codice).then(function () {
          b.textContent = 'Copiato';
          setTimeout(function () { b.textContent = 'Copia'; }, 1800);
        }).catch(function () {
          /* Se la copia automatica non è permessa — succede su alcune
             configurazioni — si seleziona il testo, così resta il gesto
             manuale invece di un pulsante che non fa niente e non lo dice. */
          var r = document.createRange();
          r.selectNodeContents(box.querySelector('.tac-codice-valore'));
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          b.textContent = 'Copia a mano';
        });
      };
      box.querySelector('.tac-codice-cambia').onclick = function (ev) {
        ev.preventDefault(); chiediNome();
      };
    }

    function chiediNome() {
      box.innerHTML =
        '<p class="tac-codice-invito">Scrivi <strong>nome e cognome</strong>: ' +
        'servono per il codice da consegnare.</p>' +
        '<div class="tac-codice-riga">' +
          '<input type="text" class="tac-codice-nome" placeholder="Nome e cognome" ' +
          'autocomplete="name">' +
          '<button type="button" class="btn tac-codice-ok">Genera il codice</button>' +
        '</div>';
      var campo = box.querySelector('.tac-codice-nome');
      campo.value = nomeSalvato();
      function conferma() {
        var n = campo.value.trim();
        /* Due parole almeno: un solo nome non basta a distinguere due
           studenti, ed è proprio quello che il codice deve fare. */
        if (n.split(/\s+/).filter(Boolean).length < 2) {
          campo.classList.add('sbagliata'); campo.focus(); return;
        }
        salvaNome(n); mostraCodice(n);
      }
      box.querySelector('.tac-codice-ok').onclick = conferma;
      campo.onkeydown = function (e) { if (e.key === 'Enter') conferma(); };
      campo.oninput = function () { campo.classList.remove('sbagliata'); };
    }

    if (nomeSalvato()) mostraCodice(nomeSalvato());
    else chiediNome();
    return box;
  }

  /* ==========================================================
     <tac-verifica> — LA PROVA VALUTATA

     <tac-verifica sigla="C1U1V" titolo="Verifica di fine unità 1">
       <tac-drag peso="2"> … </tac-drag>
       <tac-quiz peso="3"> … </tac-quiz>
     </tac-verifica>

     PERCHÉ ESISTE. Un esercizio solo non fa una valutazione. Un
     trascinamento da nove buche misura una cosa sola, e chi sbaglia due
     parole prende sette: come voto non dice niente di utile, perché la
     differenza fra sette e nove sta tutta dentro l'errore di misura di una
     prova cosí corta. Andrea, 14 agosto: «non basta un solo esercizio di
     completamento per fare una verifica vera a casa valutabile».

     Quattro o cinque esercizi diversi — riconoscere, completare, scrivere —
     danno un punteggio che regge il peso di un voto, e toccano aspetti che
     un esercizio solo non tocca.

     UNO PER VOLTA, SENZA TORNARE INDIETRO. Dentro una verifica i pulsanti
     «Ricomincia» e «azzera» dei singoli esercizi spariscono. Se restassero,
     si rifarebbe ogni esercizio finché non viene giusto e il punteggio
     misurerebbe soltanto la pazienza. Il tentativo si conta sulla prova
     intera, non sui pezzi.

     IL PESO. Ogni esercizio porta il proprio: quanto è rappresentativo
     dell'obiettivo. Uno da 3 conta il triplo di uno da 1. Senza attributo
     vale 1, cosí una verifica scritta di fretta funziona lo stesso.

     ── LA VERIFICA RACCOGLIE, NON CORREGGE ──────────────────────

     Andrea, 18 agosto: «gli esercizi non possono avere la risposta sul
     workbook, diventano inutili».

     Aveva ragione, e il problema era piu' profondo di come sembrava. Il
     sito e' statico: non c'e' nessun server che corregga. Un esercizio che
     si autocorregge nel browser **deve** avere la risposta giusta nella
     pagina, e nasconderla — codificarla, girarla, spezzarla — non e'
     protezione, e' un minuto in piu' per chi guarda il sorgente. Quindi o
     l'esercizio si autocorregge, o la risposta non e' pubblicata: le due
     cose insieme non stanno.

     Per gli esercizi di allenamento la scelta e' facile: si autocorreggono,
     perche' e' tutto il loro scopo e non fanno voto. Per la verifica no.

     Allora la verifica **non corregge**. Raccoglie le risposte e le mette
     dentro il codice; il punteggio lo calcola la pagina di decodifica, che
     sta sul computer del docente insieme ai pesi e alla soglia. Nella
     pagina pubblicata le risposte giuste non ci sono affatto — non
     nascoste: assenti.

     Torna anche didatticamente, ed e' il segno che la strada e' giusta: la
     consegna diceva gia' «non si torna indietro: prima di rispondere
     pensaci». Una verifica che dopo ogni domanda ti dice se hai indovinato
     contraddiceva quella riga da sempre.

     IL SEME. Gli esercizi pescano da un serbatoio — cinque domande su
     diciotto — e il docente deve sapere **quali cinque** sono uscite,
     altrimenti le risposte raccolte non si sanno a che cosa riferire. La
     pesca passa da `TAC.caso`, che con un seme e' ricostruibile: il seme
     nasce qui, vale per tutta la prova, e viaggia dentro il codice. Stesso
     seme, stesse domande, stesso ordine.
     ========================================================== */

  class TacVerifica extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;

      this._seme = TAC.caso.nuovo();

      this._prove = [...this.children].filter(
        e => /^TAC-/.test(e.tagName) && e.tagName !== 'TAC-STAVE');
      if (!this._prove.length) return;

      this._risposte = [];
      this._i = 0;

      this._testa = document.createElement('div');
      this._testa.className = 'tac-verifica-testa no-stampa';
      this.insertBefore(this._testa, this.firstChild);

      this._piede = document.createElement('div');
      this._piede.className = 'tac-verifica-piede no-stampa';
      this.appendChild(this._piede);

      this._prove.forEach((p, k) => {
        p.classList.add('tac-prova-passo');
        if (k) p.hidden = true;
      });
      this.aggiornaTesta();

      /* LA PESCA SI RIFA' QUI, E NON SI LASCIA FARE AI FIGLI.

         Ogni esercizio pesca da solo appena viene aggiornato, e finche' si
         tratta di allenamento va benissimo. Dentro una verifica no, perche'
         la pesca dev'essere **ricostruibile**: il docente rimette lo stesso
         seme e deve ritrovare le stesse domande, sennò le risposte lette
         nel codice sono numeri riferiti a domande che non si sanno.

         E l'ordine in cui i figli pescano da soli non e' quello che sembra.
         Il browser aggiorna gli elementi personalizzati **nell'ordine in
         cui le classi vengono definite**, non nell'ordine del documento:
         `tac-quiz` e' definito prima di `tac-drag`, quindi pescano prima
         tutti i quiz e poi tutti i trascinamenti, anche se nella pagina
         sono alternati. Chi ricostruisce percorrendo i figli in ordine di
         documento — che e' l'ordine ovvio, e quello che avevo scritto —
         ottiene una sequenza diversa e domande diverse.

         Su sei verifiche su sette non si vedeva: hanno due esercizi, un
         quiz e un trascinamento, e i due ordini coincidono. Si vedeva solo
         sulla verifica dell'unita' 1 della prima, che ne ha sette
         alternati, e la prova in bianco l'ha presa li'.

         Quindi si rimanda di un giro — a quel punto tutte le classi sono
         definite e tutti i figli aggiornati — e si ridisegna in ordine di
         documento, che e' l'ordine che il docente puo' ripercorrere
         guardando la pagina. */
      Promise.resolve().then(() => this.rifaiConSeme(this._seme));
    }

    aggiornaTesta() {
      const t = this.getAttribute('titolo') || 'Verifica';
      this._testa.innerHTML =
        '<span class="tac-verifica-nome">' + t + '</span>' +
        '<span class="tac-verifica-conta">Esercizio ' + (this._i + 1) +
        ' di ' + this._prove.length + '</span>';
    }

    /* Chiamata dal singolo esercizio quando ha finito.

       Arrivano le **risposte date**, non un punteggio: l'esercizio non sa
       quali siano quelle giuste e non deve saperlo. Le risposte si mettono
       in fila nell'ordine in cui gli esercizi compaiono, ed e' quest'ordine
       che la scheda di correzione ripercorre — per questo il peso resta
       qui, sull'esercizio dentro la verifica, e non nell'archivio: lo
       stesso esercizio riusato in due prove porterebbe il peso della prima.

       Il peso non entra nel codice. Il codice porta i fatti — chi ha
       risposto che cosa — e i pesi sono una scelta di valutazione che puo'
       cambiare anche dopo che la prova e' stata consegnata. Tenerli fuori
       vuol dire poter correggere un peso sbagliato senza chiedere alla
       classe di rifare la verifica. */
    registra(chi, risposte) {
      if (chi._registrato) return;
      chi._registrato = true;
      (risposte || []).forEach(r => this._risposte.push(r));

      const avanti = document.createElement('button');
      avanti.className = 'btn';
      avanti.textContent = (this._i < this._prove.length - 1)
        ? 'Esercizio successivo' : 'Consegna la verifica';
      avanti.onclick = () => {
        this._piede.innerHTML = '';
        if (this._i < this._prove.length - 1) {
          this._prove[this._i].hidden = true;
          this._i++;
          this._prove[this._i].hidden = false;
          this.aggiornaTesta();
          this._testa.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          this.chiudi();
        }
      };
      this._piede.innerHTML = '';
      this._piede.appendChild(avanti);
    }

    /* Il numero della prova, per il codice: dieci bit, cioe' fino a 1023.
       `C3U11` diventa 311 — classe per cento piu' unita. Regge fino alla
       classe 10 e all'unita 99, che e' abbastanza per un liceo. Se la
       sigla non ha questa forma il codice non si puo' fare, e conviene
       dirlo forte adesso invece di produrre codici che la decodifica
       attribuira' alla prova sbagliata. */
    numeroProva() {
      const s = this.getAttribute('sigla') || '';
      const m = /^C(\d+)U(\d+)/.exec(s);
      if (!m) return null;
      return +m[1] * 100 + +m[2];
    }

    chiudi() {
      this._prove.forEach(p => { p.hidden = true; });
      this._testa.innerHTML = '<span class="tac-verifica-nome">' +
        (this.getAttribute('titolo') || 'Verifica') + '</span>' +
        '<span class="tac-verifica-conta">consegnata</span>';

      const prova = this.numeroProva();
      let codice = null;
      if (prova !== null && TAC.esito) {
        try {
          codice = TAC.esito.codifica({
            prova: prova, seme: this._seme, risposte: this._risposte
          });
        } catch (e) {
          codice = null;
          if (window.console) console.error('codice non generato:', e.message);
        }
      }

      const esito = document.createElement('div');
      esito.className = 'tac-verifica-esito';
      if (codice) {
        /* NIENTE PUNTEGGIO, E VA DETTO ALLO STUDENTE PERCHE'.
           Senza una riga che lo spieghi, una prova che finisce senza voto
           sembra rotta: si preme «consegna», non succede niente di
           riconoscibile, e la reazione naturale e' rifarla. */
        esito.innerHTML =
          '<p class="tac-verifica-fatta"><strong>Verifica consegnata.</strong> ' +
          'Le tue risposte sono dentro questo codice. La correzione la fa ' +
          'l&rsquo;insegnante: qui il punteggio non compare.</p>';
      } else {
        esito.innerHTML =
          '<p class="tac-verifica-fatta">Le risposte sono state raccolte, ' +
          'ma il codice non si &egrave; potuto generare. Avvisa ' +
          'l&rsquo;insegnante invece di rifare la prova.</p>';
      }
      this._piede.appendChild(esito);
      if (codice) bloccoCodiceEsito(this._piede, codice, this.getAttribute('sigla'));

      const ri = document.createElement('button');
      ri.className = 'btn secondario';
      ri.style.marginTop = '1rem';
      ri.textContent = 'Rifai la verifica';
      /* Rifare resta permesso, e adesso costa piu' di prima: il seme
         cambia, quindi cambiano le domande. Non si rifa' la stessa prova
         sapendo dove si era incerti -- se ne fa un'altra. Il docente vede
         due codici con due semi diversi e sa che ci sono stati due giri.
         Vietarlo sarebbe una promessa che non si puo' mantenere: basta
         ricaricare la pagina. */
      ri.onclick = () => this.ricomincia();
      this._piede.appendChild(ri);
    }

    /* Rimette la prova da capo, con un seme nuovo.

       RIMONTARE I FIGLI NON SI PUO' FARE COSI'. Qui c'era scritto
       `p.innerHTML = ''; p._fatto = false; p.connectedCallback()`, ed era
       sbagliato in un modo che non si vedeva provando il pezzo giusto: un
       esercizio legge i propri dati da `this.textContent`, e li **consuma**
       — la prima cosa che fa dopo averli letti e' svuotare l'elemento, per
       non lasciare il JSON in mezzo alla pagina. Svuotare e richiamare
       `connectedCallback` vuol dire quindi rileggere una stringa vuota:
       `JSON.parse('')` solleva, il quiz mostra «JSON non valido», e la
       verifica e' finita li'.

       Il tasto «Rifai la verifica» non ha mai funzionato. Nessuno se n'era
       accorto perche' bisogna arrivare in fondo a una prova per vederlo, e
       le prove in fondo ci si arriva una volta sola.

       La configurazione ce l'hanno gia' in casa — `_tutte` nel quiz,
       `_cfg` nel trascinamento — e ridisegnare da li' e' anche piu' onesto:
       si rifa' il disegno, non si rinasce. */
    ricomincia() {
      this._piede.innerHTML = '';
      this._risposte = [];
      this._i = 0;
      this._seme = TAC.caso.nuovo();
      TAC.caso.semina(this._seme);
      this._prove.forEach((p, k) => {
        p._registrato = false;
        p.hidden = !!k;
        if (p.rifai) p.rifai();
      });
      this.aggiornaTesta();
    }

    /* Rimonta la prova su un seme dato, senza toccare niente d'altro.
       La usa la scheda di correzione del docente: stesso seme, stesse
       domande, e da li' si sa a che cosa si riferiscono le risposte
       lette nel codice. */
    rifaiConSeme(seme) {
      this._seme = seme >>> 0;
      TAC.caso.semina(this._seme);
      this._risposte = [];
      this._i = 0;
      this._prove.forEach((p, k) => {
        p._registrato = false;
        p.hidden = !!k;
        if (p.rifai) p.rifai();
      });
      this.aggiornaTesta();
    }
  }
  customElements.define('tac-verifica', TacVerifica);

  class TacQuiz extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;

      let dom;
      try {
        dom = JSON.parse(this.textContent.trim());
      } catch (e) {
        this.innerHTML = '<p style="color:#ef4444">Quiz: JSON non valido.</p>';
        return;
      }
      this._tutte = dom;
      this._quante = parseInt(this.getAttribute('quante') || '0', 10);
      /* Si chiede una volta sola, alla nascita. Chiederlo a ogni domanda
         funzionerebbe uguale, ma vorrebbe dire che il quiz puo' cambiare
         natura a meta' prova, e non deve poterlo fare. */
      this.raccoglie = dentroVerifica(this);
      this.pesca();
      this.textContent = '';

      this._box = document.createElement('div');
      this._box.className = 'tac-quiz-box';
      this.appendChild(this._box);
      this.appendChild(this.versioneStampa());
      this.mostra();
    }

    /* Pesca dal serbatoio le domande di questa volta.

       Con l'attributo `quante` il componente non mostra più tutte le
       domande che ha, ma ne estrae quel numero da un serbatoio più grande.
       Cambia la natura dell'esercizio: con sei domande fisse, alla terza
       volta la classe ricorda le risposte invece di ricostruirle, e quello
       che si misura non è più il ragionamento ma la memoria di ieri. Con
       sedici in serbatoio e sei estratte, ogni giro è una prova diversa.

       L'estrazione passa da `TAC.caso`, quindi senza seme è imprevedibile —
       com'è giusto in classe — e con un seme è ricostruibile, che è quello
       che serve alle schede assegnate: stesso seme, stesse sei domande.

       Le domande escono anche in ordine sparso: se uscissero sempre nella
       sequenza in cui sono scritte, l'ordine stesso diventerebbe un
       indizio. */
    pesca() {
      const tutte = this._tutte.slice();
      if (this._quante > 0 && this._quante < tutte.length) {
        for (let i = tutte.length - 1; i > 0; i--) {
          const j = TAC.caso.intero(i + 1);
          [tutte[i], tutte[j]] = [tutte[j], tutte[i]];
        }
        this._dom = tutte.slice(0, this._quante);
      } else {
        this._dom = tutte;
      }
      this._i = 0;
      this._punti = 0;
      this._date = [];
    }

    /* Ridisegna da capo: ripesca dal serbatoio che ha gia' in casa e
       riparte dalla prima domanda. Non rilegge `textContent`, che a
       questo punto e' vuoto. */
    rifai() {
      this._tentativo = 0;
      this.pesca();
      this.mostra();
    }

    /* Elenco statico di tutte le domande, visibile solo in stampa */
    versioneStampa() {
      const d = document.createElement('div');
      d.className = 'tac-quiz-stampa';
      const ol = document.createElement('ol');
      ol.className = 'spaziato';
      // sulla carta esce il serbatoio intero: un foglio non ripesca
      (this._tutte || this._dom).forEach(q => {
        const li = document.createElement('li');
        li.innerHTML = '<strong>' + q.d + '</strong>';
        const ul = document.createElement('ul');
        q.o.forEach((t, k) => {
          const it = document.createElement('li');
          it.innerHTML = '<em>' + LETTERE[k] + '.</em> ' + t;
          ul.appendChild(it);
        });
        li.appendChild(ul);
        ol.appendChild(li);
      });
      d.appendChild(ol);
      /* LA CHIAVE DELLE RISPOSTE, SULLA CARTA, SOLO SE C'E' DA STAMPARLA.

         Questa riga stampava «Risposte: 1b · 2a · 3b…» in fondo a ogni
         quiz. Sul foglio dell'allenamento ci sta — si fa l'esercizio e poi
         si controlla. In fondo alla verifica no, ed era li' anche li':
         chiunque stampasse il Workbook si portava a casa le soluzioni
         della prova che fa voto.

         Adesso, dentro una verifica, i dati non hanno nemmeno il campo
         `c`: la riga non si puo' scrivere perche' non c'e' niente da
         scrivere. Il controllo su `raccoglie` la toglie comunque, cosi' se
         un giorno arrivasse in pagina una verifica coi dati completi non
         se la ritroverebbe stampata sotto. */
      if (!this.raccoglie && (this._tutte || this._dom).every(q => q.c != null)) {
        const sol = document.createElement('p');
        sol.className = 'tac-quiz-chiavi';
        sol.innerHTML = '<strong>Risposte:</strong> ' +
          (this._tutte || this._dom).map((q, i) => (i + 1) + LETTERE[q.c].toLowerCase()).join(' · ');
        d.appendChild(sol);
      }
      return d;
    }

    mostra() {
      const q = this._dom[this._i];
      this._box.innerHTML = '';

      const testa = document.createElement('div');
      testa.className = 'tac-quiz-testa';
      testa.innerHTML =
        '<span class="tac-quiz-conta">Domanda ' + (this._i + 1) + ' di ' +
          this._dom.length + '</span>' +
        (this.raccoglie ? ''
          : '<span class="tac-quiz-conta">Punteggio ' + this._punti + '</span>');
      /* Niente «azzera» dentro una verifica. Ripescare a meta' prova vuol
         dire cambiare le domande difficili con altre, e il tasto era li'
         per l'allenamento, dove rifare da capo e' esattamente la cosa
         giusta. Il punteggio, per lo stesso motivo, non compare: non
         esiste finche' non corregge il docente. */
      if (!this.raccoglie) {
        tastoAzzera(testa, () => { this.pesca(); this.mostra(); },
                    () => this._i + this._punti);
      }
      this._box.appendChild(testa);

      const d = document.createElement('p');
      d.className = 'tac-quiz-dom';
      d.innerHTML = q.d;
      this._box.appendChild(d);

      if (q.stave) {
        const s = document.createElement('tac-stave');
        Object.entries(q.stave).forEach(([k, v]) => s.setAttribute(k, v === true ? '' : v));
        this._box.appendChild(s);
      }

      /* Una domanda può portarsi dietro un ascolto: «questo brano è binario
         o ternario?». Si usa l'incisione nuda, non il <tac-brano> delle
         lezioni, e non è una scorciatoia — è la cosa giusta. Il lettore
         delle lezioni mostra le pulsazioni che battono e le stanghette
         della partitura: su una domanda di percezione regalerebbe la
         risposta prima ancora che il brano cominci.

         L'ascolto si può ripetere quante volte si vuole. Contare le volte
         misurerebbe la memoria, non l'orecchio, e chi ha una cuffia
         scadente verrebbe punito per il suo apparecchio. */
      if (q.audio) {
        const zona = document.createElement('div');
        zona.className = 'tac-quiz-ascolto no-stampa';
        const suono = new Audio(q.audio.file);
        const da = +(q.audio.da || 0), a = +(q.audio.a || 0);
        const bt = document.createElement('button');
        bt.className = 'btn';
        bt.innerHTML = '&#9654; Ascolta';
        let ferma = null;
        bt.onclick = () => {
          clearTimeout(ferma);
          suono.currentTime = da;
          suono.play();
          if (a > da) ferma = setTimeout(() => suono.pause(), (a - da) * 1000);
        };
        zona.appendChild(bt);
        if (q.audio.nota) {
          const n = document.createElement('span');
          n.className = 'tac-quiz-conta';
          n.textContent = q.audio.nota;
          zona.appendChild(n);
        }
        this._box.appendChild(zona);
        /* Il suono non deve sopravvivere alla domanda: passando alla
           successiva si fermerebbe a metà sopra la prossima. */
        this._fermaSuono = () => { clearTimeout(ferma); suono.pause(); };
      } else {
        this._fermaSuono = null;
      }

      const opz = document.createElement('div');
      opz.className = 'tac-quiz-opz';
      opz.style.setProperty('--colonne', colonne(q.o.length));
      q.o.forEach((testo, k) => {
        const b = document.createElement('button');
        b.className = 'tac-opz';
        b.innerHTML = '<span class="lettera">' + LETTERE[k] + '</span><span>' + testo + '</span>';
        b.onclick = () => this.rispondi(k, opz);
        opz.appendChild(b);
      });
      this._box.appendChild(opz);

      const fb = document.createElement('div');
      fb.className = 'tac-feedback';
      this._box.appendChild(fb);
      this._fb = fb;
    }

    rispondi(scelta, contenitore) {
      const q = this._dom[this._i];
      /* La risposta si annota sempre, giusta o sbagliata che sia: dentro
         una verifica e' l'unica cosa che serve, e fuori non fa male a
         nessuno. Si somma uno perche' nel codice lo zero e' riservato a
         «non data». */
      this._date.push(scelta + 1);

      if (this.raccoglie) {
        /* Nessun colore, nessuna spiegazione, nessun punteggio: qui la
           risposta giusta non e' nella pagina e non c'e' niente da dire.
           I pulsanti si disattivano lo stesso — la scelta e' fatta e non
           si torna indietro, com'e' scritto nella consegna — e quello
           scelto resta segnato, altrimenti non si vede piu' che cosa si e'
           risposto. */
        [...contenitore.children].forEach((b, k) => {
          b.disabled = true;
          if (k === scelta) b.classList.add('scelta');
        });
        this._fb.className = 'tac-feedback mostra';
        this._fb.innerHTML = 'Risposta registrata.';
      } else {
        const giusto = scelta === q.c;
        if (giusto) this._punti++;

        [...contenitore.children].forEach((b, k) => {
          b.disabled = true;
          if (k === q.c) b.classList.add('giusta');
          else if (k === scelta) b.classList.add('sbagliata');
        });

        this._fb.className = 'tac-feedback mostra ' + (giusto ? 'ok' : 'no');
        this._fb.innerHTML =
          '<strong>' + (giusto ? 'Esatto. ' : 'Non ci siamo. ') + '</strong>' +
          (q.spiega || ('La risposta corretta è ' + LETTERE[q.c] + '.'));
      }

      const avanti = document.createElement('button');
      avanti.className = 'btn';
      avanti.style.marginTop = '1.1rem';
      avanti.textContent = (this._i < this._dom.length - 1) ? 'Domanda successiva'
                         : (this.raccoglie ? 'Ho finito' : 'Vedi il risultato');
      avanti.onclick = () => {
        if (this._fermaSuono) this._fermaSuono();
        if (this._i < this._dom.length - 1) { this._i++; this.mostra(); }
        else this.risultato();
      };
      this._box.appendChild(avanti);
    }

    risultato() {
      if (this.raccoglie) {
        this._box.innerHTML =
          '<div class="tac-punteggio mostra">' +
            '<div class="valore">' + this._date.length + ' risposte</div>' +
            '<p style="margin:.6rem 0 0">Registrate. Il punteggio lo fa ' +
            'l&rsquo;insegnante.</p>' +
          '</div>';
        segnalaEsito(this._box, { risposte: this._date });
        return;
      }

      const perc = Math.round(this._punti / this._dom.length * 100);
      const commento =
        perc === 100 ? 'Perfetto. Puoi andare avanti.' :
        perc >= 70   ? 'Buon lavoro. Rivedi solo i punti sbagliati.' :
        perc >= 50   ? 'Ci siamo quasi: rileggi la lezione e riprova.' :
                       'Riprendi la spiegazione dall\'inizio e riprova.';

      this._box.innerHTML =
        '<div class="tac-punteggio mostra">' +
          '<div class="valore">' + this._punti + ' / ' + this._dom.length + '</div>' +
          '<p style="margin:.6rem 0 0">' + commento + '</p>' +
        '</div>';

      segnalaEsito(this._box, {
        scheda: this.getAttribute('scheda'),
        punti: this._punti, massimo: this._dom.length
      });

      /* Dentro una verifica non si ricomincia il singolo esercizio: si
         ricomincia la prova intera, e il tentativo si conta li'. Un tasto
         «Ricomincia» qui dentro renderebbe il punteggio una misura della
         pazienza invece che della preparazione. */
      if (this.closest('tac-verifica')) return;

      const ri = document.createElement('button');
      ri.className = 'btn secondario';
      ri.style.marginTop = '1rem';
      ri.textContent = 'Ricomincia';
      /* Ricominciare azzera anche il tentativo registrato per questo giro,
         cosi' il prossimo risultato ne conta uno nuovo: rifare l'esercizio
         e' un tentativo in piu', ed e' esattamente quello che il codice
         deve dire. */
      /* Anche qui: ricominciare ripesca. Il tasto «azzera» in testata lo
         faceva già, questo no — due strade per la stessa cosa, e una sola
         delle due dava domande nuove. Chi rifaceva l'esercizio da qui
         ritrovava le stesse cinque. */
      ri.onclick = () => { this._i = 0; this._punti = 0; this._tentativo = 0;
                           this.pesca(); this.mostra(); };
      this._box.appendChild(ri);

      this.dispatchEvent(new CustomEvent('tac:quiz-finito', {
        detail: { punti: this._punti, totale: this._dom.length }, bubbles: true
      }));
    }
  }
  customElements.define('tac-quiz', TacQuiz);

  /* ==========================================================
     7. <tac-drag> — TRASCINA L'ETICHETTA

     <tac-drag>
       {"gettoni":["semibreve","minima","semiminima"],
        "frasi":[["Vale 4 movimenti: ","semibreve"],
                 ["Vale 2 movimenti: ","minima"]]}
     </tac-drag>
     ========================================================== */

  class TacDrag extends HTMLElement {
    /* RIFARE L'ESERCIZIO DEVE RIPESCARE.

       Il serbatoio c'era e funzionava, ma l'estrazione avveniva una volta
       sola, qui dentro, e non c'era modo di rifarla senza ricaricare la
       pagina: chi rifaceva l'esercizio in classe ritrovava le stesse
       quattro frasi, e la varietà — che sulla carta c'era, sedici frasi per
       quattro — non arrivava mai in aula. Andrea, 15 agosto: «l'esercizio è
       sempre uguale».

       È il difetto più insidioso di tutti quelli visti finora sugli
       esercizi, perché ogni controllo dice che va bene: il serbatoio è
       grande, il rapporto è tre a uno, `quante` arriva nella pagina. Quello
       che mancava non era un dato ma un **gesto**: ripescare.

       Adesso il disegno sta in `disegna()`, la configurazione resta
       nell'elemento, e il tasto «azzera» rifà l'estrazione da capo. */
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      let cfg;
      try { cfg = JSON.parse(this.textContent.trim()); }
      catch (e) { this.innerHTML = '<p style="color:#ef4444">Trascina: JSON non valido.</p>'; return; }
      this.textContent = '';
      this._cfg = cfg;
      this.disegna(cfg);
    }

    /* LE FRASI ARRIVANO IN DUE FORME, E VANNO ACCETTATE TUTTE E DUE.

       Le prime schede scrivevano una frase come coppia — `["testo",
       "parola giusta"]` — e questo componente la apriva destrutturando.
       Le schede scritte dopo (C1U2, C1U3, C3U1, C4U1, C5U1) usano invece
       la forma del quiz, `{"d": "testo", "c": "parola giusta"}`, che si
       legge meglio nell'archivio e dice come si chiamano i campi.

       Nessuno aveva convertito il componente, e destrutturare un oggetto
       come se fosse una lista non restituisce valori vuoti: **solleva
       un'eccezione**. Otto esercizi di trascinamento su diciassette non
       disegnavano nulla, e cinque erano dentro verifiche che fanno voto.

       Perche' non se n'era accorto nessuno: il componente moriva dentro
       `connectedCallback`, cioe' dentro il costruttore di un elemento
       personalizzato, e li' un'eccezione non ferma la pagina e non
       compare da nessuna parte se non nella console. Sullo schermo
       restava la consegna, il titolo, la casella del codice: una scheda
       completa, con un buco al centro. Tutti i controlli passavano —
       nessuno di essi disegnava.

       Si accettano entrambe le forme invece di riscrivere l'archivio:
       convertire i dati lascerebbe il componente pronto a rompersi di
       nuovo alla prossima scheda scritta nell'altro modo. */
    static frase(f) {
      if (Array.isArray(f)) return { testo: f[0], giusta: f[1] };
      if (f && typeof f === 'object') return { testo: f.d, giusta: f.c };
      return { testo: String(f), giusta: '' };
    }

    /* Ridisegna dalla configurazione tenuta da parte, non da
       `textContent`, che dopo il primo giro e' vuoto. */
    rifai() {
      this._tentativo = 0;
      this._codice = null;
      this.disegna(this._cfg);
    }

    disegna(cfg) {
      this.innerHTML = '';

      /* Anche qui si pesca da un serbatoio.

         Stessa ragione del quiz: con quattro frasi fisse, al terzo giro la
         classe ricorda dove va ogni parola invece di ricostruirlo. Con
         `quante` si estraggono N frasi da un elenco più lungo, in ordine
         sparso — l'ordine stesso, se fosse sempre quello, sarebbe un
         indizio.

         I gettoni non sono più una lista fissa: si costruiscono dalle frasi
         estratte, più un paio di parole prese fra quelle rimaste fuori. Se
         fossero solo le parole giuste, l'ultima frase si risolverebbe per
         esclusione senza leggerla; se fossero tutte le parole del serbatoio,
         la maggior parte non servirebbe a niente e sarebbe solo rumore. */
      const quante = parseInt(this.getAttribute('quante') || '0', 10);
      // Normalizzate una volta sola, qui: da questo punto in giu' il
      // componente conosce una forma sola e non deve piu' chiederselo.
      let frasi = cfg.frasi.map(TacDrag.frase);
      let gettoni;
      this.raccoglie = dentroVerifica(this);

      if (this.raccoglie) {
        /* DENTRO UNA VERIFICA I GETTONI SONO TUTTI.

           Fuori, in gioco ce ne sono sette: le cinque parole giuste delle
           frasi estratte, piu' due prese fra quelle rimaste fuori. E' una
           buona misura per l'allenamento — abbastanza distrattori da non
           risolvere per esclusione, abbastanza pochi da non fare confusione.

           Ma quel calcolo **parte dalle risposte giuste**, e in una verifica
           le risposte giuste nella pagina non ci sono. Non e' un dettaglio
           da aggirare: e' la stessa impossibilita' di sempre, che qui si
           presenta sotto un'altra forma. Un pool costruito nel browser
           dice quali sono le parole giuste anche se non dice a quale frase
           vanno — bastano cinque buche e cinque parole per capirlo.

           Quindi restano in gioco tutti i gettoni del serbatoio. La prova
           diventa un po' piu' dura, e nella direzione giusta: non si
           risolve piu' niente per esclusione, e l'ultima buca vale quanto
           la prima. */
        for (let i = frasi.length - 1; i > 0; i--) {
          const j = TAC.caso.intero(i + 1);
          [frasi[i], frasi[j]] = [frasi[j], frasi[i]];
        }
        if (quante > 0 && quante < frasi.length) frasi = frasi.slice(0, quante);
        gettoni = cfg.gettoni.slice();
      } else if (quante > 0 && quante < frasi.length) {
        for (let i = frasi.length - 1; i > 0; i--) {
          const j = TAC.caso.intero(i + 1);
          [frasi[i], frasi[j]] = [frasi[j], frasi[i]];
        }
        const scelte = frasi.slice(0, quante);
        const giuste = scelte.map(f => f.giusta);
        const altre = frasi.slice(quante).map(f => f.giusta)
                           .filter(x => giuste.indexOf(x) < 0);
        const distrattori = [];
        while (distrattori.length < 2 && altre.length) {
          distrattori.push(altre.splice(TAC.caso.intero(altre.length), 1)[0]);
        }
        gettoni = giuste.concat(distrattori);
        frasi = scelte;
      } else {
        gettoni = cfg.gettoni.slice();
      }
      this._frasi = frasi;

      const pool = document.createElement('div');
      pool.className = 'tac-drag-pool';
      const mescolati = gettoni.slice();
      for (let i = mescolati.length - 1; i > 0; i--) {
        const j = TAC.caso.intero(i + 1);
        [mescolati[i], mescolati[j]] = [mescolati[j], mescolati[i]];
      }
      /* L'ordine mescolato si tiene da parte: dentro una verifica la
         risposta che finisce nel codice e' **la posizione** del gettone in
         questa fila, non la parola. Una posizione e' un numero da 1 a 15 e
         ci sta in quattro bit; la parola no. Con lo stesso seme la fila si
         ricostruisce identica dalla parte del docente. */
      this._mescolati = mescolati;
      mescolati.forEach(t => {
        const g = document.createElement('div');
        g.className = 'tac-gettone';
        g.draggable = true;
        g.textContent = t;
        g.ondragstart = e => e.dataTransfer.setData('text/plain', t);
        pool.appendChild(g);
      });
      this.appendChild(pool);

      const lista = document.createElement('div');
      frasi.forEach(({ testo, giusta }) => {
        const r = document.createElement('p');
        r.className = 'tac-frase';
        r.innerHTML = testo + ' ';
        const buca = document.createElement('span');
        buca.className = 'tac-buca';
        /* In una verifica la parola giusta non si scrive nel DOM. Non
           perche' `undefined` darebbe fastidio — non lo darebbe — ma
           perche' il giorno in cui questi dati tornassero completi
           l'attributo si riempirebbe da solo, e la risposta sarebbe lì
           nell'ispettore senza che nessuno abbia deciso di metterla. */
        if (!this.raccoglie) buca.dataset.giusta = giusta;
        buca.ondragover = e => { e.preventDefault(); buca.classList.add('sopra'); };
        buca.ondragleave = () => buca.classList.remove('sopra');
        buca.ondrop = e => {
          e.preventDefault();
          buca.classList.remove('sopra');
          buca.textContent = e.dataTransfer.getData('text/plain');
        };
        r.appendChild(buca);
        lista.appendChild(r);
      });
      this.appendChild(lista);

      const stampa = document.createElement('div');
      stampa.className = 'tac-drag-stampa';
      const olS = document.createElement('ol');
      olS.className = 'spaziato';
      cfg.frasi.forEach(f => {
        const li = document.createElement('li');
        li.innerHTML = TacDrag.frase(f).testo + ' <span class="puntini"></span>';
        olS.appendChild(li);
      });
      stampa.innerHTML = '<p><strong>Etichette disponibili:</strong> ' +
        cfg.gettoni.join(' &middot; ') + '</p>';
      stampa.appendChild(olS);
      this.appendChild(stampa);

      const barra = document.createElement('div');
      barra.className = 'tac-barra no-stampa';
      const esito = document.createElement('span');
      esito.className = 'tac-quiz-conta';

      const bt = document.createElement('button');
      bt.className = 'btn';
      bt.textContent = this.raccoglie ? 'Conferma' : 'Controlla';
      bt.onclick = () => {
        const buche = [...lista.querySelectorAll('.tac-buca')];

        if (this.raccoglie) {
          /* Si consegna solo a buche piene. Con una buca vuota il codice
             porterebbe uno zero, che il docente leggerebbe come «non ha
             risposto» — e potrebbe invece essere una parola dimenticata
             per fretta. Meglio fermarsi qui e dirlo. */
          const vuote = buche.filter(b => !b.textContent.trim()).length;
          if (vuote) {
            esito.textContent = vuote === 1 ? 'manca una parola'
                                            : 'mancano ' + vuote + ' parole';
            return;
          }
          const date = buche.map(b =>
            this._mescolati.indexOf(b.textContent.trim()) + 1);
          buche.forEach(b => { b.classList.add('scelta'); });
          bt.disabled = true;
          esito.textContent = 'consegnato';
          segnalaEsito(this, { risposte: date });
          return;
        }

        let giuste = 0, messe = 0;
        buche.forEach(b => {
          b.classList.remove('giusta', 'sbagliata');
          if (!b.textContent.trim()) return;
          messe++;
          const ok = b.textContent.trim() === b.dataset.giusta;
          if (ok) giuste++;
          b.classList.add(ok ? 'giusta' : 'sbagliata');
        });
        esito.textContent = messe
          ? giuste + ' su ' + frasi.length
          : 'nessuna parola trascinata';

        /* Il codice esce solo a esercizio completo. Premere «Controlla»
           con meta' buche vuote e' provare, non consegnare: contarlo come
           tentativo punirebbe chi verifica mentre lavora, che e' la cosa
           giusta da fare. Ogni verifica completa invece e' un tentativo, e
           il primo vale piu' del secondo. */
        if (messe === frasi.length) {
          this._tentativo = 0;
          if (this._codice) this._codice.remove();
          this._codice = segnalaEsito(this, {
            scheda: this.getAttribute('scheda'),
            punti: giuste, massimo: frasi.length
          });
        }
      };

      /* Svuotare le buche non basta: i gettoni già usati devono tornare
         disponibili, altrimenti al secondo giro la classe ha davanti un
         esercizio dimezzato e non se ne accorge. */
      /* Rifare vuol dire ripescare, non ripulire.
         Prima questo svuotava le buche e rimetteva i gettoni: le frasi
         restavano le stesse, e al secondo giro si trascinava a memoria.
         Adesso ridisegna dall'inizio, e l'estrazione riparte dal serbatoio. */
      const rifai = () => this.disegna(this._cfg);
      barra.appendChild(bt);
      /* Niente «azzera» dentro una verifica: ridisegnare ripesca, e
         ripescare a meta' prova vuol dire scambiare le frasi difficili con
         altre. Fuori resta, perche' li' rifare da capo e' lo scopo. */
      if (!this.raccoglie) {
        tastoAzzera(barra, rifai,
                    () => lista.querySelectorAll('.tac-buca').length &&
                          [...lista.querySelectorAll('.tac-buca')]
                            .filter(b => b.textContent.trim()).length);
      }
      barra.appendChild(esito);
      this.appendChild(barra);
    }
  }
  customElements.define('tac-drag', TacDrag);

  /* ==========================================================
     8. <tac-ear> — ASCOLTA E RICONOSCI

     <tac-ear tipo="intervallo"
              scelte="2M,3M,5G,8G"
              base="c/4"
              titolo="Riconosci l'intervallo"></tac-ear>
     ========================================================== */

  const INTERVALLI = {
    '1G': [0, 'unisono'], '2m': [1, 'seconda minore'], '2M': [2, 'seconda maggiore'],
    '3m': [3, 'terza minore'], '3M': [4, 'terza maggiore'], '4G': [5, 'quarta giusta'],
    '4A': [6, 'quarta aumentata'], '5G': [7, 'quinta giusta'], '6m': [8, 'sesta minore'],
    '6M': [9, 'sesta maggiore'], '7m': [10, 'settima minore'], '7M': [11, 'settima maggiore'],
    '8G': [12, 'ottava giusta']
  };

  class TacEar extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      this._scelte = (this.getAttribute('scelte') || '2M,3M,5G,8G').split(',').map(s => s.trim());
      this._base = this.getAttribute('base') || 'c/4';
      this._giuste = 0; this._tot = 0;

      const box = document.createElement('div');
      box.className = 'tac-quiz-box';
      box.innerHTML =
        '<div class="tac-quiz-testa">' +
          '<span class="tac-quiz-conta">' + (this.getAttribute('titolo') || 'Ascolta e riconosci') + '</span>' +
          '<span class="tac-quiz-conta punteggio">0 / 0</span>' +
        '</div>';
      this.appendChild(box);
      this._box = box;
      tastoAzzera(box.querySelector('.tac-quiz-testa'), () => {
        this._giuste = 0; this._tot = 0;
        box.querySelector('.punteggio').textContent = '0 / 0';
        this.nuovo(false);
      }, () => this._tot);

      const barra = document.createElement('div');
      barra.className = 'tac-barra';
      barra.style.marginBottom = '1.1rem';

      const bt = document.createElement('button');
      bt.className = 'btn';
      bt.innerHTML = '&#9654; Ascolta';
      bt.onclick = () => this.riproduci();
      barra.appendChild(bt);

      const nuovo = document.createElement('button');
      nuovo.className = 'btn secondario';
      nuovo.textContent = 'Nuovo esempio';
      nuovo.onclick = () => this.nuovo();
      barra.appendChild(nuovo);
      box.appendChild(barra);

      const opz = document.createElement('div');
      opz.className = 'tac-quiz-opz';
      opz.style.setProperty('--colonne', colonne(this._scelte.length));
      box.appendChild(opz);
      this._opz = opz;

      const fb = document.createElement('div');
      fb.className = 'tac-feedback';
      box.appendChild(fb);
      this._fb = fb;

      /* Non si riproduce nulla al caricamento: il browser richiede
         comunque un gesto dell'utente prima di attivare l'audio. */
      this.nuovo(false);
    }

    nuovo(suona = true) {
      this._corrente = TAC.caso.scegli(this._scelte);
      this._fb.className = 'tac-feedback';
      this._opz.innerHTML = '';
      this._opz.style.setProperty('--colonne', colonne(this._scelte.length));
      this._scelte.forEach((s, k) => {
        const b = document.createElement('button');
        b.className = 'tac-opz';
        const nome = INTERVALLI[s] ? INTERVALLI[s][1] : s;
        b.innerHTML = '<span class="lettera">' + LETTERE[k] + '</span><span>' + nome + ' <em>(' + s + ')</em></span>';
        b.onclick = () => this.rispondi(s);
        this._opz.appendChild(b);
      });
      if (suona) this.riproduci();
    }

    async riproduci() {
      const semi = INTERVALLI[this._corrente] ? INTERVALLI[this._corrente][0] : 0;
      const b = N.aTone(this._base);
      const a = N.aTone(N.trasporta(this._base, semi));
      await Audio.avvia();
      if (!Audio.pronto) return;
      /* Al pianoforte come tutti gli altri esempi: riconoscere un
         intervallo su un dente di sega è più difficile che su un timbro
         vero, e la difficoltà in più non insegna niente. */
      let voce = Audio.synth;
      try { voce = (await Audio.strumento('salamander')) || voce; } catch (e) { }
      const t = Tone.now() + 0.1;
      voce.triggerAttackRelease(b, '4n', t);
      voce.triggerAttackRelease(a, '4n', t + 0.65);
      voce.triggerAttackRelease([b, a], '2n', t + 1.5);
    }

    rispondi(s) {
      this._tot++;
      const ok = s === this._corrente;
      if (ok) this._giuste++;
      [...this._opz.children].forEach((b, k) => {
        b.disabled = true;
        if (this._scelte[k] === this._corrente) b.classList.add('giusta');
        else if (this._scelte[k] === s) b.classList.add('sbagliata');
      });
      const nome = INTERVALLI[this._corrente][1];
      this._fb.className = 'tac-feedback mostra ' + (ok ? 'ok' : 'no');
      this._fb.innerHTML = ok
        ? '<strong>Esatto.</strong> Era una ' + nome + '.'
        : '<strong>No.</strong> Era una ' + nome + ' (' + this._corrente + '). Riascolta e prova a memorizzarne il colore.';
      this._box.querySelector('.punteggio').textContent = this._giuste + ' / ' + this._tot;
    }
  }
  customElements.define('tac-ear', TacEar);

  /* ==========================================================
     9. <tac-rhythm> — CELLULA RITMICA CON METRONOMO

     <tac-rhythm pattern="q q 8 8 q" battuti="4" tempo="90"></tac-rhythm>
     ========================================================== */

  class TacRhythm extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      this._batt = parseInt(this.getAttribute('battuti') || '4', 10);
      this._tempo = parseInt(this.getAttribute('tempo') || '90', 10);
      this._dati = leggiNote(this.getAttribute('pattern') || 'q q q q');
      this._eventi = [];

      const barra = document.createElement('div');
      barra.className = 'tac-barra no-stampa';

      const bt = document.createElement('button');
      bt.className = 'btn';
      bt.innerHTML = '&#9654; Avvia';
      bt.onclick = () => this.avvia(bt);
      barra.appendChild(bt);

      const stop = document.createElement('button');
      stop.className = 'btn secondario';
      stop.innerHTML = '&#9632; Ferma';
      stop.onclick = () => this.ferma(bt);
      barra.appendChild(stop);
      this.appendChild(barra);

      const m = document.createElement('div');
      m.className = 'tac-metro no-stampa';
      m.innerHTML = '<label>Tempo <input type="range" min="40" max="180" value="' + this._tempo +
                    '"> <strong class="bpm">' + this._tempo + '</strong> bpm</label>';
      const pul = document.createElement('div');
      pul.className = 'tac-pulsazioni';
      for (let i = 0; i < this._batt; i++) {
        const p = document.createElement('div');
        p.className = 'tac-puls';
        pul.appendChild(p);
      }
      m.appendChild(pul);
      this.appendChild(m);
      this._pul = pul;

      const range = m.querySelector('input');
      range.oninput = () => {
        this._tempo = parseInt(range.value, 10);
        m.querySelector('.bpm').textContent = this._tempo;
        Tone.Transport.bpm.value = this._tempo;
      };
    }

    async avvia(bt) {
      await Audio.avvia();
      if (!Audio.pronto) return;
      this.ferma();

      Tone.Transport.bpm.value = this._tempo;
      Tone.Transport.timeSignature = this._batt;

      /* Niente pianoforte qui: questo è un esempio **ritmico**, e un
         esempio ritmico si sente come si sente nella lezione 1, con i
         colpi. Il pianoforte era stato collegato a tutti gli esempi
         insieme, ed era troppo: serve dove ci sono le altezze, non dove
         c'è solo la durata. Segnalato da Andrea: «è un esempio ritmico,
         soltanto ritmica come nella lezione 1». */

      /* Metronomo: un click per movimento, accento sul primo */
      let b = 0;
      this._loop = new Tone.Loop(tempo => {
        const i = b % this._batt;
        Audio.metronomo(i === 0, tempo);
        Tone.Draw.schedule(() => {
          [...this._pul.children].forEach((p, k) => p.classList.toggle('on', k === i));
        }, tempo);
        b++;
      }, '4n').start(0);

      /* Cellula ritmica: si ripete ogni battuta, note ai rispettivi movimenti.

         QUI C'ERA LO SFASAMENTO. Prima l'intervallo era scritto
         `durataBattuta + '*4n'`, cioè «2*4n», e l'inizio `quando + '*4n'`.
         È la trappola già annotata dentro <tac-livelli>: a Tone una
         scrittura del genere non dice due movimenti, dice **due secondi**.
         La figura viene ignorata del tutto.

         Il risultato è che il metronomo andava a tempo — a 80 una battuta
         di due movimenti dura un secondo e mezzo — mentre il ritmo tornava
         ogni due secondi netti, qualunque fosse il tempo. Mezzo secondo di
         scarto a ogni battuta: dopo tre battute il ritmo è indietro di un
         movimento intero, e l'esempio che dovrebbe mostrare dove cade
         l'accento mostra il contrario.

         Adesso l'intervallo è `1m`, una battuta vera, che segue la
         divisione dichiarata poco sopra; e l'inizio è calcolato in secondi
         a partire dalla durata reale del movimento, così regge anche le
         posizioni non intere — un ritmo che comincia su un ottavo.

         Il difetto era stato trovato e scritto in un altro componente e
         non applicato qui. Vale la pena ricordarlo: una trappola annotata
         in un posto solo continua a mordere in tutti gli altri. */
      const unMovimento = Tone.Time('4n').toSeconds();
      let off = 0;
      this._dati.forEach(d => {
        if (!d.pausa) {
          this._eventi.push(
            Tone.Transport.scheduleRepeat(t => {
              Audio.tick.triggerAttackRelease(Audio.LIVELLI.ritmo.altezza,
                                             '64n', t,
                                             Audio.LIVELLI.ritmo.forza);
            }, '1m', unMovimento * off)
          );
        }
        off += d.battiti;
      });

      Tone.Transport.start();
      if (bt) bt.disabled = true;
    }

    ferma(bt) {
      if (this._loop) { this._loop.stop(); this._loop.dispose(); this._loop = null; }
      (this._eventi || []).forEach(id => Tone.Transport.clear(id));
      this._eventi = [];
      Tone.Transport.stop();
      Tone.Transport.cancel();
      [...this._pul.children].forEach(p => p.classList.remove('on'));
      if (bt) bt.disabled = false;
      this.querySelectorAll('.btn').forEach(b => b.disabled = false);
    }
  }
  customElements.define('tac-rhythm', TacRhythm);

  /* ==========================================================
     9-ter. I TRE LIVELLI
     ----------------------------------------------------------
     Metro, pulsazione e suddivisione uno sopra l'altro, ciascuno
     con il suo interruttore. È l'unico modo di far sentire che
     non sono tre cose diverse ma lo stesso battito guardato da tre
     distanze: si accende la pulsazione, poi ci si mette sopra la
     suddivisione, e si sente che ci sta dentro esatta.

     Il cursore muove la pulsazione. Gli altri due la seguono,
     perché sono definiti come rapporti: il metro è una pulsazione
     ogni due, tre o quattro; la suddivisione è due o tre colpi per
     pulsazione. Cambiando velocità i rapporti restano.

     Le tre altezze sono distinte apposta. Colpi uguali sovrapposti
     si impastano e la dimostrazione non dimostra niente.
     ========================================================== */
  class TacLivelli extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      this._bpm = parseInt(this.getAttribute('bpm') || '80', 10);
      this._perBattuta = parseInt(this.getAttribute('battuta') || '4', 10);
      this._sudd = parseInt(this.getAttribute('suddivisione') || '2', 10);
      this._on = { metro: false, puls: true, sudd: false };

      const box = document.createElement('div');
      box.className = 'tac-livelli';

      const barra = document.createElement('div');
      barra.className = 'tac-barra no-stampa';
      this._avvio = document.createElement('button');
      this._avvio.className = 'btn';
      this._avvio.innerHTML = '&#9654; Avvia';
      this._avvio.onclick = () => this._corre ? this.ferma() : this.avvia();
      barra.appendChild(this._avvio);

      const ETICHETTE = { metro: 'Metro', puls: 'Pulsazione', sudd: 'Suddivisione' };
      this._tasti = {};
      Object.keys(ETICHETTE).forEach(k => {
        const b = document.createElement('button');
        b.className = 'btn secondario liv-' + k;
        b.textContent = ETICHETTE[k];
        b.classList.toggle('acceso', this._on[k]);
        b.setAttribute('aria-pressed', String(this._on[k]));
        b.onclick = () => {
          this._on[k] = !this._on[k];
          b.classList.toggle('acceso', this._on[k]);
          b.setAttribute('aria-pressed', String(this._on[k]));
          box.classList.toggle('senza-' + k, !this._on[k]);
        };
        this._tasti[k] = b;
        barra.appendChild(b);
      });

      /* Semplice o composto, e quante pulsazioni per battuta. Insieme
         danno i sei metri che servono in prima: 2/4, 3/4, 4/4 da una
         parte, 6/8, 9/8, 12/8 dall'altra. Senza questi due comandi
         l'esempio mostrerebbe un caso solo, ed è la ragione per cui
         non serviva a niente. */
      const due = document.createElement('button');
      due.className = 'btn secondario';
      due.title = 'Passa da due a tre parti per pulsazione';
      due.onclick = () => {
        this._sudd = this._sudd === 2 ? 3 : 2;
        this.aggiornaScritte(); this.disegna();
        if (this._corre) { this.ferma(); this.avvia(); }
      };
      barra.appendChild(due);
      this._tastoSudd = due;

      const grup = document.createElement('button');
      grup.className = 'btn secondario';
      grup.title = 'Quante pulsazioni in ogni battuta';
      grup.onclick = () => {
        this._perBattuta = this._perBattuta >= 4 ? 2 : this._perBattuta + 1;
        this.aggiornaScritte(); this.disegna();
        if (this._corre) { this.ferma(); this.avvia(); }
      };
      barra.appendChild(grup);
      this._tastoGrup = grup;

      this._segno = document.createElement('span');
      this._segno.className = 'liv-segno';
      barra.appendChild(this._segno);
      box.appendChild(barra);

      const vel = document.createElement('div');
      vel.className = 'tac-metro no-stampa';
      vel.innerHTML = '<label>Velocità della pulsazione ' +
        '<input type="range" min="40" max="160" value="' + this._bpm + '"> ' +
        '<strong class="bpm">' + this._bpm + '</strong> bpm</label>';
      const cur = vel.querySelector('input');
      cur.oninput = () => {
        this._bpm = parseInt(cur.value, 10);
        vel.querySelector('.bpm').textContent = this._bpm;
        if (typeof Tone !== 'undefined' && Tone.Transport) Tone.Transport.bpm.value = this._bpm;
      };
      box.appendChild(vel);

      this._griglia = document.createElement('div');
      this._griglia.className = 'tac-griglia-livelli';
      box.appendChild(this._griglia);
      this.appendChild(box);
      this._box = box;
      box.classList.add('senza-metro', 'senza-sudd');
      this.aggiornaScritte();
      this.disegna();
    }

    /* Il metro che risulta dalle due scelte. Serve a legare quello che si
       sente al segno che si scrive: chi ascolta tre colpi per pulsazione
       raggruppati a quattro sta ascoltando un 12/8, e vale la pena che lo
       veda scritto mentre lo sente. */
    aggiornaScritte() {
      const semplice = this._sudd === 2;
      this._tastoSudd.textContent = semplice ? 'Semplice: divide in due'
                                             : 'Composto: divide in tre';
      this._tastoSudd.classList.toggle('ambra', !semplice);
      const NOMI = { 2: 'binario', 3: 'ternario', 4: 'quaternario' };
      this._tastoGrup.textContent = NOMI[this._perBattuta] + ' · ' + this._perBattuta + ' pulsazioni';
      const sopra = semplice ? this._perBattuta : this._perBattuta * 3;
      const sotto = semplice ? 4 : 8;
      this._segno.innerHTML = '<span class="mus">' + sopra + '/' + sotto + '</span>';
      this._segno.title = NOMI[this._perBattuta] + ' ' + (semplice ? 'semplice' : 'composto');
    }

    /* Tre righe di pallini: uno per battuta, uno per pulsazione, e
       quanti ne chiede la suddivisione. */
    disegna() {
      const N = this._perBattuta;
      const righe = [
        ['metro', 'Metro', N, k => k === 0 ? '1' : ''],
        ['puls', 'Pulsazione', N, k => String(k + 1)],
        ['sudd', 'Suddivisione', N * this._sudd, () => '']
      ];
      this._griglia.innerHTML = '';
      this._celle = {};
      righe.forEach(([k, nome, quanti, testo]) => {
        const r = document.createElement('div');
        r.className = 'liv-riga liv-' + k;
        r.innerHTML = '<span class="liv-nome">' + nome + '</span>';
        const p = document.createElement('div');
        p.className = 'liv-pallini';
        for (let i = 0; i < quanti; i++) {
          const c = document.createElement('span');
          c.className = 'liv-p';
          c.textContent = testo(i);
          p.appendChild(c);
        }
        r.appendChild(p);
        this._griglia.appendChild(r);
        this._celle[k] = [...p.children];
      });
    }

    async avvia() {
      if (typeof Tone === 'undefined') return;
      await Audio.avvia();
      if (!Audio.pronto || !Audio.tick) return;
      this.ferma();

      /* Due trappole, entrambe costate un esempio muto.

         La prima: a Tone un intervallo scritto «0.5*4n» non dice mezzo
         movimento, dice mezzo secondo. La figura viene ignorata e il ciclo
         smette di seguire il metronomo. I tempi si scrivono con le figure:
         4n il movimento, 8n la sua metà, 8t il suo terzo.

         La seconda: Audio.colpo è asincrona, e chiamata dentro il ciclo
         suonerebbe dopo l'istante che le è stato passato. Nel ciclo si
         parla direttamente allo strumento, che a questo punto c'è di
         sicuro perché Audio.avvia è già stata attesa qui sopra. */
      Tone.Transport.bpm.value = this._bpm;
      Tone.Transport.timeSignature = this._perBattuta;

      const batti = (altezza, forza, quando) => {
        try { Audio.tick.triggerAttackRelease(altezza, '64n', quando, forza); }
        catch (e) { /* due colpi nello stesso istante: se ne perde uno */ }
      };
      const acc = (riga, i) => {
        const a = this._celle[riga];
        if (a) a.forEach((c, k) => c.classList.toggle('on', k === i));
      };

      this._eventi = [];
      const s = this._sudd;

      /* Le tre forze: 0,45 · 0,70 · 1,00, e prima erano 0,25 · 0,55 · 0,95.

         Non è solo «più forte»: è più stretta la scala. Fra suddivisione e
         battere c'era un rapporto di quasi quattro a uno in ampiezza, che
         per un metronomo è troppo — l'accento non si sentiva come accento,
         si sentiva come l'unico colpo udibile, e i tre livelli sovrapposti
         diventavano due. Due a uno basta e avanza per far capire dove
         cade il battere.

         Il rapporto va tenuto quando si aggiungono livelli: chi lo allarga
         per «far risaltare il battere» ottiene il contrario, perché sotto
         una certa soglia il livello più debole sparisce del tutto e
         l'esercizio perde proprio la cosa che vuole insegnare. */

      /* la suddivisione: metà movimento se semplice, un terzo se composto */
      let iS = 0;
      this._eventi.push(Tone.Transport.scheduleRepeat(tempo => {
        const k = iS % (this._perBattuta * s);
        if (this._on.sudd && k % s !== 0)
          batti(Audio.LIVELLI.sudd.altezza, Audio.LIVELLI.sudd.forza, tempo);
        Tone.Draw.schedule(() => acc('sudd', k), tempo);
        iS++;
      }, s === 2 ? '8n' : '8t', 0));

      /* la pulsazione: un movimento */
      let iP = 0;
      this._eventi.push(Tone.Transport.scheduleRepeat(tempo => {
        const k = iP % this._perBattuta;
        if (this._on.puls)
          batti(Audio.LIVELLI.puls.altezza, Audio.LIVELLI.puls.forza, tempo);
        Tone.Draw.schedule(() => acc('puls', k), tempo);
        iP++;
      }, '4n', 0));

      /* il metro: una battuta intera, presa dalla divisione dichiarata */
      let iM = 0;
      this._eventi.push(Tone.Transport.scheduleRepeat(tempo => {
        if (this._on.metro)
          batti(Audio.LIVELLI.metro.altezza, Audio.LIVELLI.metro.forza, tempo);
        Tone.Draw.schedule(() => acc('metro', 0), tempo);
        iM++;
      }, '1m', 0));

      Tone.Transport.start();
      this._corre = true;
      this._avvio.innerHTML = '&#9632; Ferma';
    }

    ferma() {
      if (typeof Tone !== 'undefined' && Tone.Transport) {
        (this._eventi || []).forEach(id => Tone.Transport.clear(id));
        Tone.Transport.stop();
      }
      this._eventi = [];
      Object.values(this._celle || {}).forEach(a => a.forEach(c => c.classList.remove('on')));
      this._corre = false;
      if (this._avvio) this._avvio.innerHTML = '&#9654; Avvia';
    }

    disconnectedCallback() { this.ferma(); }
  }
  customElements.define('tac-livelli', TacLivelli);


  /* ==========================================================
     9-bis. <tac-metro> — RICONOSCI IL METRO ALL'ASCOLTO

     <tac-metro scelte="2/4,3/4,6/8,9/8" tempo="92"></tac-metro>
     Genera una battuta ritmica nel metro scelto a caso e chiede
     allo studente di riconoscerlo. Autocorrettivo.
     ========================================================== */

  /* Due modi di dire lo stesso metro, e servono tutti e due.

     `come` descrive quello che si sente: quante pulsazioni, in quanto si
     dividono. `nome` è l'etichetta tecnica. Sui pulsanti va `come`, nella
     risposta va `nome` — perché questo esercizio si fa prima di aver
     spiegato i metri, ed è giusto così: la classe deve poter scegliere
     contando quello che sente, non riconoscendo una parola che nessuno le
     ha ancora detto. Il nome arriva subito dopo, attaccato all'esperienza
     che lo ha appena reso necessario, che è l'ordine dichiarato del corso —
     prima si fa, poi si nomina. */
  const METRI = {
    '2/4':  { puls: 2, sudd: 2, nome: 'binario semplice',
              come: 'due pulsazioni, divise in due' },
    '3/4':  { puls: 3, sudd: 2, nome: 'ternario semplice',
              come: 'tre pulsazioni, divise in due' },
    '4/4':  { puls: 4, sudd: 2, nome: 'quaternario semplice',
              come: 'quattro pulsazioni, divise in due' },
    '6/8':  { puls: 2, sudd: 3, nome: 'binario composto',
              come: 'due pulsazioni, divise in tre' },
    '9/8':  { puls: 3, sudd: 3, nome: 'ternario composto',
              come: 'tre pulsazioni, divise in tre' },
    '12/8': { puls: 4, sudd: 3, nome: 'quaternario composto',
              come: 'quattro pulsazioni, divise in tre' },

    /* I metri irregolari non servono in prima, ma il componente è lo
       stesso e tanto vale che li sappia già suonare. Qui la pulsazione
       non è uniforme: «gruppi» dice quante suddivisioni entrano in
       ciascun movimento, ed è la sola cosa che li distingue all'ascolto. */
    '5/4':  { gruppi: [2, 3], sudd: 2, nome: 'quinario, 2+3' },
    '7/8':  { gruppi: [2, 2, 3], sudd: 1, nome: 'settenario, 2+2+3' }
  };

  class TacMetro extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      this._scelte = (this.getAttribute('scelte') || '2/4,3/4,6/8,9/8').split(',').map(s => s.trim());
      this._tempo = parseInt(this.getAttribute('tempo') || '92', 10);
      this._giuste = 0; this._tot = 0;

      const box = document.createElement('div');
      box.className = 'tac-quiz-box';
      box.innerHTML =
        '<div class="tac-quiz-testa">' +
          '<span class="tac-quiz-conta">' + (this.getAttribute('titolo') || 'Riconosci il metro') + '</span>' +
          '<span class="tac-quiz-conta punteggio">0 / 0</span>' +
        '</div>';
      this.appendChild(box);
      this._box = box;
      tastoAzzera(box.querySelector('.tac-quiz-testa'), () => {
        this._giuste = 0; this._tot = 0;
        box.querySelector('.punteggio').textContent = '0 / 0';
        this.nuovo(false);
      }, () => this._tot);

      const barra = document.createElement('div');
      barra.className = 'tac-barra';
      barra.style.marginBottom = '1.1rem';
      /* Un pulsante solo che fa e disfa. Due — «Ascolta» e «Ferma» — sono
         uno di troppo su una slide: chi conduce guarda la classe, non la
         barra, e il pulsante che serve dev'essere sempre quello sotto il
         dito. Qui l'etichetta dice sempre che cosa succede se lo premi. */
      const asc = document.createElement('button');
      asc.className = 'btn';
      this._asc = asc;
      this.aggiornaTasto(false);
      asc.onclick = () => this._suona ? this.ferma() : this.riproduci();
      const nuo = document.createElement('button');
      nuo.className = 'btn secondario'; nuo.textContent = 'Nuovo esempio';
      nuo.onclick = () => this.nuovo(true);
      barra.appendChild(asc); barra.appendChild(nuo);
      box.appendChild(barra);

      const opz = document.createElement('div');
      opz.className = 'tac-quiz-opz';
      opz.style.setProperty('--colonne', colonne(this._scelte.length));
      box.appendChild(opz);
      this._opz = opz;

      const fb = document.createElement('div');
      fb.className = 'tac-feedback';
      box.appendChild(fb);
      this._fb = fb;

      this.nuovo(false);
    }

    nuovo(suona) {
      this.ferma();            // via quello di prima, altrimenti si accavallano

      /* Mai lo stesso metro due volte di fila.

         Con quattro scelte, il caso puro ripete una volta su quattro: in
         un giro da sei esempi capita quasi sempre, e in classe si legge
         male. Chi ha appena risposto «6/8» e risente lo stesso ritmo non
         pensa «è ancora 6/8»: pensa che il pulsante non abbia funzionato,
         o che l'esercizio sia rotto. È il caso che sembra un guasto, lo
         stesso disegno di errore già visto altrove.

         Si risorteggia finché non cambia, non si toglie il metro
         precedente dall'elenco: le probabilità degli altri devono restare
         uguali fra loro. E il ciclo ha un'uscita, perché con una sola
         scelta un metro diverso non esiste e il sorteggio non ha nulla da
         fare. */
      const prima = this._corrente;
      let m = TAC.caso.scegli(this._scelte);
      if (this._scelte.length > 1) {
        for (let i = 0; i < 24 && m === prima; i++) m = TAC.caso.scegli(this._scelte);
      }
      this._corrente = m;

      this._fb.className = 'tac-feedback';
      this._opz.innerHTML = '';
      this._opz.style.setProperty('--colonne', colonne(this._scelte.length));
      this._scelte.forEach((s, k) => {
        const b = document.createElement('button');
        b.className = 'tac-opz';
        const m = METRI[s];
        b.innerHTML = '<span class="lettera">' + LETTERE[k] + '</span><span><strong>' + s +
                      '</strong> &mdash; ' + (m ? (m.come || m.nome) : '') + '</span>';
        b.onclick = () => this.rispondi(s);
        this._opz.appendChild(b);
      });
      if (suona) this.riproduci();
    }

    /* L'etichetta del tasto dice sempre che cosa succede se lo premi:
       «Ascolta» da fermo, «Ferma» mentre suona. */
    aggiornaTasto(suona) {
      if (!this._asc) return;
      this._asc.innerHTML = suona ? '&#9632; Ferma' : '&#9654; Ascolta';
      this._asc.classList.toggle('ambra', !!suona);
    }

    /* Quattro battute con lo stesso colpo degli altri esercizi.

       Due correzioni, tutte e due nate da quello che si sentiva in aula.

       La prima: il suono. Avevo costruito tre woodblock apposta per questo
       componente, ed era sbagliato di principio prima che di risultato —
       lo stesso livello, la pulsazione, suonava in un modo qui e in un
       altro nei tre livelli sovrapposti, e uno studente non ha modo di
       sapere che sono la stessa cosa. Ora si usa `Audio.tick` con le stesse
       tre altezze di `tac-livelli`: re4 per il metro, la5 per la
       pulsazione, re6 per la suddivisione.

       La seconda: il ritmo torna regolare. Avevo introdotto delle
       suddivisioni mancanti a caso, per evitare che la classe imparasse la
       sequenza a memoria invece di contarla. L'effetto in aula però era un
       altro: un buco dentro una griglia regolare non si sente come
       variazione, si sente come un colpo perso — e infatti è stato
       segnalato come difetto dell'audio due volte. Su un esercizio che
       chiede di riconoscere il metro la griglia dev'essere impeccabile: è
       il metro stesso l'oggetto della domanda. La varietà resta dove non fa
       danno, cioè nel metro estratto, che cambia a ogni esempio. */
    async riproduci() {
      await Audio.avvia();
      if (!Audio.pronto || !Audio.tick) return;
      const m = METRI[this._corrente];
      if (!m) return;
      this.ferma();

      const gruppi = m.gruppi || new Array(m.puls).fill(m.sudd);
      const durSudd = (60 / this._tempo) / Math.max(...gruppi);
      const colpi = [];
      let quando = 0;
      for (let bat = 0; bat < 4; bat++) {
        gruppi.forEach((quante, p) => {
          for (let s = 0; s < quante; s++) {
            colpi.push({ t: quando, liv: (p === 0 && s === 0) ? 0 : (s === 0 ? 1 : 2) });
            quando += durSudd;
          }
        });
      }

      /* Tutto consegnato in una volta all'orologio dell'audio, che non si
         ferma mai: nessun colpo può arrivare in ritardo. Prima si
         consegnava un po' per volta con un timer di JavaScript, e quando
         la pagina si ingolfava — rimisura trentaquattro slide — i colpi
         finivano programmati in un istante già passato, cioè sparivano. */
      const inizio = Tone.now() + 0.12;
      /* Le stesse tre forze dell'esercizio a tre livelli, e devono restare
         le stesse: sono due esercizi che si fanno di fila nella stessa ora,
         e se il colpo cambia volume passando dall'uno all'altro la classe
         sente un difetto dove non c'è. La scala è 0,45 · 0,70 · 1,00 —
         vedi il commento più sopra, dove si spiega perché non va allargata. */
      const L = Audio.LIVELLI;
      const ALTEZZA = [L.metro.altezza, L.puls.altezza, L.sudd.altezza],
            FORZA   = [L.metro.forza,   L.puls.forza,   L.sudd.forza];
      this._suona = true;
      this.aggiornaTasto(true);
      colpi.forEach(c => {
        try {
          Audio.tick.triggerAttackRelease(ALTEZZA[c.liv], '64n',
                                          inizio + c.t, FORZA[c.liv]);
        } catch (e) { /* due colpi nello stesso istante: se ne perde uno */ }
      });

      clearTimeout(this._pulizia);
      this._pulizia = setTimeout(() => { this._suona = false; this.aggiornaTasto(false); },
                                 (quando + 0.4) * 1000);
    }

    ferma() {
      clearTimeout(this._pulizia);
      this._suona = false;
      /* Il tick è condiviso: non si può buttare. E soprattutto i colpi sono
         già stati consegnati tutti insieme all'orologio dell'audio, quindi
         non basta zittire il sintetizzatore: gli attacchi futuri sono già
         scritti sul suo inviluppo, ed è lì che vanno disdetti.

         Qui prima si azzeravano i valori programmati del *volume*, dove
         però non era mai stato programmato niente: la chiamata riusciva,
         non toccava nulla, e l'esercizio continuava a battere fino in
         fondo mentre il tasto era già tornato «Ascolta». Misurato sul
         sito: dopo il Ferma l'uscita batteva ancora nove volte in due
         secondi e mezzo. Con la disdetta sull'inviluppo resta solo il
         colpo che stava già suonando, che dura trenta millesimi. */
      try {
        const ora = Tone.now();
        Audio.tick.envelope.cancel(ora);
        Audio.tick.triggerRelease(ora);
      } catch (e) {}
      this.aggiornaTasto(false);
    }

    disconnectedCallback() { this.ferma(); }

    rispondi(s) {
      this._tot++;
      const ok = s === this._corrente;
      if (ok) this._giuste++;
      [...this._opz.children].forEach((b, k) => {
        b.disabled = true;
        if (this._scelte[k] === this._corrente) b.classList.add('giusta');
        else if (this._scelte[k] === s) b.classList.add('sbagliata');
      });
      const m = METRI[this._corrente];
      this._fb.className = 'tac-feedback mostra ' + (ok ? 'ok' : 'no');
      this._fb.innerHTML = ok
        ? '<strong>Esatto.</strong> Era ' + this._corrente + ': ' + (m.come || m.nome) +
          '. Si chiama <strong>metro ' + m.nome + '</strong>.'
        : '<strong>No.</strong> Era <strong>' + this._corrente + '</strong>, metro ' + m.nome +
          '. Riascolta contando gli accenti forti: ' + (m.gruppi
            ? 'i movimenti non sono tutti uguali, si raggruppano ' + m.gruppi.join('+') + '.'
            : 'ne senti uno ogni ' + m.puls + ' pulsazioni, e ciascuna si divide in ' +
              m.sudd + '.');
      this._box.querySelector('.punteggio').textContent = this._giuste + ' / ' + this._tot;
    }
  }
  customElements.define('tac-metro', TacMetro);

  /* ==========================================================
     <tac-gesto> — LO SCHEMA DELLA MANO

     <tac-gesto metro="4/4" suddivisione="2" tempo="60"
                caption="Il gesto in quattro" play></tac-gesto>

     PERCHÉ ESISTE. Il gesto era descritto a parole — «giù sul battito, su
     nello spazio fra un battito e l'altro» — e a parole non si impara.
     Andrea, 16 agosto: «dobbiamo essere molto più chiari su come funziona
     il gesto, come dividere e suddividere i vari tempi diversi. Troviamo
     degli schemi visivi o facciamoli noi attraverso frecce e disegni della
     mano». Non ne esistevano di riusabili in casa, e li disegniamo qui.

     GLI SCHEMI, come Andrea li dirige:

        in due     battere · levare
        in quattro battere · sinistra · destra · levare
        in tre     battere · destra · levare

     Le parole sono due, **battere** e **levare**, e sono le sole del
     vocabolario: il primo movimento e l'ultimo. Quelli in mezzo si dicono
     con la direzione, che è una descrizione e non un termine da imparare.

     È UN GIRO CHIUSO, percorso senza fermarsi. I punti numerati sono gli
     **ictus**: dove il battito cade. Non sono estremi di tratti separati —
     la mano ci passa sopra e prosegue, che è come la musica va.

     LA SUDDIVISIONE si disegna come pallini lungo il tratto: uno per la
     suddivisione binaria, due per la ternaria. Fanno vedere che la
     suddivisione **sta dentro il movimento**, non accanto — il nodo della
     lezione 4, dove metro e suddivisione si confondono. I pallini restano
     senza nome: il disegno dice già tutto, e il vocabolario resta di due
     parole.

     Il 6/8 si dirige in due, non in sei: `metro="6/8"` disegna quindi due
     movimenti con tre pallini ciascuno. È la cosa che alla lezione 6 va
     vista prima di essere spiegata.
     ========================================================== */

  /* I quattro punti dello schema, in un riquadro 240×170. Stanno qui e non
     dentro la classe perché li usa anche la prova. */
  /* I punti laterali stanno PIÙ IN BASSO della metà, e non è una scelta di
     gusto. Tenendoli a mezza altezza, nello schema in quattro il battere —
     che scende dritto — incrociava il movimento sinistra-destra esattamente
     nel suo punto di mezzo: i due pallini della suddivisione finivano uno
     sull'altro e le parole «su» e «centro» si sovrapponevano. Abbassandoli
     l'incrocio resta (c'è anche nel gesto vero) ma cade lontano dai due
     pallini. È anche più fedele al gesto: il terzo movimento passa raso al
     battere, non a mezz'aria. */
  const GESTO_PUNTI = {
    alto:     [120, 26],
    basso:    [120, 140],
    sinistra: [46, 112],
    destra:   [194, 112]
  };

  /* Ogni movimento è un ARCO, non un segmento, e la ragione è pratica: in
     due, andata e ritorno stanno fra gli stessi due punti, e disegnati
     dritti si sovrappongono in una riga sola — lo schema non direbbe
     niente.

     Gli schemi veri e propri stanno in `GESTO_CICLI`, più sotto. */

  /* LE FRECCE CURVANO SEMPRE VERSO L'INTERNO. Andrea, 16 agosto: «le frecce
     di movimento vanno sempre verso l'interno, non verso l'esterno». È il
     modo in cui il gesto si tiene raccolto davanti al corpo: una mano che
     curva in fuori si allarga a ogni giro e da fuori non si legge più dove
     cade il battito.

     Scritto a mano, un punto di controllo per arco, la regola si rompe alla
     prima aggiunta: basta sbagliare un segno e quell'arco solo va per conto
     suo — ed è già successo. Qui il punto si calcola: si prende il centro
     dello schema, si tira la perpendicolare alla corda e la si piega da
     quella parte. Lo sbaglio non è più possibile, e vale anche per gli
     schemi che non abbiamo ancora disegnato.

     Se il centro cade SULLA corda l'arco resta dritto, e non è un caso
     limite da tollerare: è il battere degli schemi in due e in quattro, che
     scende dritto per terra ed è giusto così. */
  function controlloVerso(p0, p1, centro, max) {
    const M  = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const d  = [p1[0] - p0[0], p1[1] - p0[1]];
    const L  = Math.hypot(d[0], d[1]) || 1;
    const n  = [-d[1] / L, d[0] / L];              // perpendicolare alla corda
    const s  = (centro[0] - M[0]) * n[0] + (centro[1] - M[1]) * n[1];
    /* CENTRO SULLA CORDA: si curva lo stesso, e da una parte fissa.
       Prima l'arco restava dritto, e nello schema in due — dove i due
       ictus e il centro stanno per forza in fila — andata e ritorno
       cadevano l'una sopra l'altra: si vedeva una linea sola con due
       punte, invece di due movimenti. Piegando sempre dallo stesso lato
       **rispetto al verso di marcia**, l'andata curva di qua e il ritorno
       di là, e si aprono in una lente: due movimenti, che è quello che
       sono. */
    if (Math.abs(s) < 4) {
      const off0 = Math.min(max || 16, L * 0.22);
      return [M[0] - n[0] * off0, M[1] - n[1] * off0];
    }
    const off = Math.max(8, Math.min(max || 16, Math.abs(s) * 0.5));
    const v   = s < 0 ? -off : off;
    return [M[0] + n[0] * v, M[1] + n[1] * v];
  }

  /* IL GESTO È UN GIRO, NON UNA CATENA DI TRATTI.

     Andrea, 16 agosto: «i punti di arrivo sono statici, invece la musica è
     fluida, le frecce dovrebbero indicare con movimenti fluidi che non ci si
     ferma, ma si prosegue. Ad esempio il due, si batte uno, poi la mano
     prosegue, fa un movimento interno verso sinistra e va verso destra,
     batte il due a destra, fa il movimento di rientro verso il centro e
     ritorna verso il basso per riprendere l'uno».

     Disegnato a tratti separati, il gesto diceva la cosa sbagliata: che sul
     battito la mano si ferma e poi riparte. Qui il percorso è UNO SOLO e
     chiuso, e gli ictus sono punti che stanno **sulla** curva — la mano ci
     passa sopra senza smettere di andare.

     Ogni voce del ciclo è un ictus (`i`, col suo nome) oppure un passaggio
     (`via`). I passaggi sono i punti dove la mano transita fra un battito e
     l'altro: `via: null` li fa calcolare piegando verso il centro, come le
     frecce; scritti a mano solo dove il gesto vero fa un'ansa che il calcolo
     non indovina — l'uscita a sinistra dopo il battere, in due. */
  const GESTO_CICLI = {
    /* IL DUE HA PUNTI SUOI, e non è un capriccio. Non avendo un ictus in
       alto, ha spazio sopra che gli altri non hanno: usando i punti comuni
       il giro si schiacciava in basso a destra e l'ansa, il numero e il nome
       si contendevano lo stesso angolo. Alzato e allargato, ci sta tutto.

       L'ansa sta a sinistra e SOTTO il battere, non sopra: sopra, la mano
       doveva invertire la marcia, e un'inversione disegnata liscia è per
       forza un occhiello — se ne chiudeva uno dietro il numero 1. Passando
       sotto, la mano prosegue senza mai tornare indietro. */
    /* L'OCCHIELLO È IL GESTO, non un difetto del disegno. Andrea, 16
       agosto: «le linee si possono attraversare, si tende sempre a fare
       degli occhielli fra un movimento e l'altro. Ad esempio dopo l'uno si
       fa un cerchio orario e si ritorna verso destra».

       Ci ho perso mezz'ora a combatterlo: avevo scritto una prova che lo
       bocciava e un cercatore che setacciava le posizioni per evitarlo, e
       ogni volta che spariva il gesto diventava più povero — alla fine una
       lente piatta. Era la cosa giusta, presa per un errore.

       Dopo il battere servono DUE passaggi, non uno: la mano scende a
       sinistra, risale, e riparte verso destra chiudendo il cerchietto. Con
       un passaggio solo la curva mediava i due movimenti in una diagonale e
       l'occhiello non si formava. Lo stesso dopo il levare, dove la mano
       prosegue ancora un poco a destra prima di risalire. */
    /* IL DUE NON HA PIÙ PASSAGGI SCRITTI A MANO. Ne aveva quattro,
       aggiunti uno alla volta per correggere spigoli e anse che non
       chiudevano — ed erano proprio loro a fare gli spigoli: punti
       ravvicinati costringono la curva a girare stretto. Con le tangenti
       imposte il due torna a essere quello che è, un ovale: la mano
       scende, rimbalza verso destra, sale al levare e rientra.

       I suoi punti restano suoi: non avendo un ictus in alto ha spazio
       sopra che gli altri non hanno, e schiacciarlo sui punti comuni gli
       faceva contendere l'angolo a numero e nome. */
    2: [{ i: 'basso',  n: 'battere', p: [120, 148] },
        { i: 'destra', n: 'levare',  p: [196, 100] }],
    /* Tre e quattro non hanno passaggi scritti: li genera `espandi`, che
       dopo OGNI ictus prolunga il movimento e poi raccorda. Scritti a mano
       erano sei e otto punti da azzeccare uno per uno, e il prolungamento
       era finito solo sul battere — gli altri movimenti si fermavano di
       colpo sul numero, che è l'errore che il gesto deve smentire. */
    3: [{ i: 'basso',  n: 'battere' },
        { i: 'destra', n: 'destra' },
        { i: 'alto',   n: 'levare' }],
    4: [{ i: 'basso',    n: 'battere' },
        { i: 'sinistra', n: 'sinistra' },
        { i: 'destra',   n: 'destra' },
        { i: 'alto',     n: 'levare' }]
  };

  /* DOPO OGNI ICTUS LA MANO PROSEGUE. Andrea, 16 agosto: «anche nel tre
     movimento la freccia deve andare oltre il due e poi salire, lo stesso
     sul tre; anche sul quattro, stesso concetto».

     È il principio del cerchietto esteso a tutti i movimenti: la mano non
     si ferma sul numero, tira dritto ancora un poco nella direzione con cui
     è arrivata, e solo dopo curva verso il battito seguente. Scritto a mano
     significava indovinare due punti per ogni ictus in ogni schema — otto
     nel quattro — e infatti il prolungamento era finito solo sul battere.
     Qui si ricava: il primo punto continua la direzione d'arrivo, il
     secondo raccorda piegando verso il centro. */
  function espandi(ciclo) {
    if (ciclo.some(v => v.via !== undefined)) return ciclo;   // scritto a mano

    /* DOVE SI CHIUDE E DOVE NO, e questa volta detta giusta.

       Andrea, 17 agosto: «sul due avevamo stabilito che non cercava di
       chiudere l'occhiello, ma che invece doveva ammorbidire il transito
       verso l'alto con un'ansa». Parla del **secondo movimento**, quello
       laterale, e la distinzione è precisa:

         · sui movimenti LATERALI — il due del tre, il due e il tre del
           quattro — la mano non gira: fa un'**ansa**, cioè una curva sola
           che addolcisce il cambio di direzione verso l'alto. Un cerchietto
           lì dice che la mano torna indietro, e la mano non torna indietro.
         · sul LEVARE, che rientra verso il battere, la curva può tagliare
           la strada da cui è venuta, e allora l'occhiello **si chiude**
           davvero. È il giro che riporta all'uno.

       Il difetto di prima era mettere lo stesso ricciolo dappertutto: tre
       punti per ogni ictus, calcolati con la stessa formula. Sui laterali
       veniva un mezzo giro interrotto — «cerca l'occhiello e non lo
       chiude», che è appunto quello che si vedeva.

       E l'ansa è AMPIA: stretta non si legge da lontano, ed è il primo
       difetto che avevamo corretto. */
    const R = 18;
    const C = centroDi(ciclo);
    const p = ciclo.map(v => v.p || GESTO_PUNTI[v.i]);
    const fuori = [];
    ciclo.forEach((v, k) => {
      const I = p[k], P = p[(k - 1 + p.length) % p.length], S = p[(k + 1) % p.length];

      /* la direzione con cui la mano ARRIVA sull'ictus */
      let dx = I[0] - P[0], dy = I[1] - P[1];
      const L = Math.hypot(dx, dy) || 1;
      dx /= L; dy /= L;

      /* si gira dal lato opposto a dove si andrà */
      let px = -dy, py = dx;
      if (px * (S[0] - I[0]) + py * (S[1] - I[1]) > 0) { px = -px; py = -py; }

      /* Il levare è l'unico che chiude: da lì la mano rientra sul battere,
         e il giro attraversa la traiettoria d'arrivo. Si riconosce dal
         fatto che il movimento seguente è il primo del ciclo. */
      const chiude = ((k + 1) % p.length) === 0;

      if (chiude) {
        const B = [I[0] + px * R * .6 - dx * R * 1.2,
                   I[1] + py * R * .6 - dy * R * 1.2];
        fuori.push(v,
          { via: [I[0] + px * R, I[1] + py * R] },
          { via: B },
          { via: controlloVerso(B, S, C, 9) });
      } else {
        /* L'ANSA: un punto solo, appena oltre l'ictus e spostato di lato.
           Un punto perché due fanno un giro; appena oltre perché la mano
           non si ferma sul numero; di lato perché è lo spostamento
           laterale che rende morbido il cambio di direzione invece di
           farne uno spigolo. */
        fuori.push(v,
          { via: [I[0] + dx * R * .5 + px * R * .85,
                  I[1] + dy * R * .5 + py * R * .85] },
          { via: controlloVerso([I[0] + px * R * .5, I[1] + py * R * .5],
                                S, C, 11) });
      }
    });
    return fuori;
  }


  /* Il centro di uno schema è la media dei suoi ictus, non il centro del
     riquadro: in due gli ictus stanno tutti a destra e in basso, e piegare
     verso il centro del disegno vorrebbe dire piegare in fuori. */
  function centroDi(ciclo) {
    const p = ciclo.filter(v => v.i).map(v => v.p || GESTO_PUNTI[v.i]);
    return [p.reduce((a, q) => a + q[0], 0) / p.length,
            p.reduce((a, q) => a + q[1], 0) / p.length];
  }

  function gestoDi(metro) {
    /* Quanti movimenti si dirigono, che non è il numero di sopra: il 6/8
       si dirige in due, il 9/8 in tre, il 12/8 in quattro. Il numero di
       sopra dice quante unità ci sono nella battuta, non quante ne batte
       la mano, e confondere le due cose è esattamente l'errore che la
       lezione 4 passa un'ora a smontare. */
    const m = String(metro || '4/4').trim();
    const [su, giu] = m.split('/').map(x => parseInt(x, 10));
    if (giu === 8 && su % 3 === 0 && su > 3) return { movimenti: su / 3, sudd: 3 };
    return { movimenti: (su >= 2 && su <= 4) ? su : 4, sudd: 2 };
  }

  class TacGesto extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      this.disegna();
    }

    disegna() {
      this.innerHTML = '';
      const NS = 'http://www.w3.org/2000/svg';
      const el = (nome, attr) => {
        const x = document.createElementNS(NS, nome);
        for (const k in attr) x.setAttribute(k, attr[k]);
        return x;
      };

      const metro = this.getAttribute('metro') || '4/4';
      const g = gestoDi(metro);
      const ciclo = espandi(GESTO_CICLI[g.movimenti] || GESTO_CICLI[4]);
      const sudd = parseInt(this.getAttribute('suddivisione') || '', 10) || g.sudd;
      this._tempo = parseFloat(this.getAttribute('tempo') || '60');

      const cap = this.getAttribute('caption');
      if (cap) {
        const d = document.createElement('div');
        d.className = 'tac-didascalia';
        d.textContent = cap;
        this.appendChild(d);
      }

      /* Il riquadro è più largo del disegno, e di proposito: le etichette
         «dentro» e «fuori» stanno FUORI dai punti laterali, e «su» sopra
         quello alto. Con un viewBox stretto sul disegno venivano tagliate
         a metà — «fuor», «ntro» — e nessun controllo se ne sarebbe accorto,
         perché l'SVG era valido e il testo c'era tutto. Si è visto
         guardando l'immagine. */
      /* IL RIQUADRO SI ADATTA ALLO SCHEMA. Era fisso, tarato sugli schemi
         che hanno un ictus a sinistra (x=46). Il due non ce l'ha — il suo
         punto più a sinistra è a 98 — e restava con un terzo di riquadro
         vuoto da quella parte: il gesto appariva piccolo e spinto in un
         angolo. Qui si prendono i punti effettivi del ciclo e si aggiunge
         il margine che le etichette vogliono. */
      const svg = el('svg', { class: 'tac-gesto-svg',
        role: 'img', 'aria-label': 'Schema del gesto in ' + g.movimenti +
        ' movimenti' + (sudd > 1 ? ', suddivisione in ' + sudd : '') });
      svg.style.maxWidth = '380px';
      svg.style.width = '100%';

      const centro = centroDi(ciclo);

      /* ---- IL GIRO: TANGENTI IMPOSTE, NON PUNTI DI PASSAGGIO --------

         Andrea, 17 agosto: «la freccia per il gesto non è morbida, non si
         riesce ad avere un movimento e delle curve morbide». Aveva ragione
         e il difetto era nel metodo, non nei numeri.

         COME ERA. Si mettevano dei punti di passaggio fra un ictus e
         l'altro — due, tre, calcolati o scritti a mano — e ci si passava
         una spline sperando che li smussasse. Ma una spline è morbida solo
         se i punti sono ben distanziati: infilandone due a diciotto pixel
         l'uno dall'altro, la curva deve girare stretto per starci sopra, e
         quello che si vede è uno spigolo. Ogni ritocco spostava il
         problema di un centimetro. Da qui i tre giri di correzioni.

         COME È ADESSO. Niente punti di passaggio: solo gli **ictus**, e per
         ciascuno una **tangente**, cioè la direzione in cui la mano si sta
         muovendo nell'istante in cui ci passa. Ogni tratto è una cubica di
         Bézier che parte da un ictus con la sua tangente e arriva al
         successivo con la sua. La continuità è garantita per costruzione —
         entra ed esce con la stessa pendenza — e **uno spigolo non può
         formarsi**, qualunque numero si scelga.

         LE TANGENTI, e sono la descrizione del gesto vero:

           · sul BATTERE la mano rimbalza: arriva scendendo e riparte di
             lato, quindi nel punto più basso il moto è **orizzontale**,
             verso il movimento seguente. È la U del rimbalzo.
           · sui LATERALI la mano sta già risalendo verso il movimento
             dopo, quindi il moto è **verticale, verso l'alto**. È qui che
             nasce l'ansa che ammorbidisce il transito, e nasce da sé: la
             curva esce in su e poi piega, senza che nessuno disegni un
             ricciolo.
           · sul LEVARE la mano è in cima e sta per rientrare, quindi il
             moto è **orizzontale, verso il battere**. Uscendo dalla parte
             opposta a dove deve andare, la curva torna indietro su sé
             stessa: è il cappio che chiude il giro, e anche questo viene
             dalla tangente, non da punti aggiunti.

         LE MANIGLIE sono lunghe (0,55 della corda): è quello che rende le
         curve ampie e tonde invece che tese. Accorciarle raddrizza il giro,
         allungarle lo gonfia. È l'unico numero da toccare se il disegno non
         piace, ed è un numero solo per tutti gli schemi. */
      const ictus = [];
      ciclo.forEach(v => {
        if (v.i) ictus.push({ dove: v.i, nome: v.n, p: v.p || GESTO_PUNTI[v.i] });
      });
      const N = ictus.length;

      /* ---- UN TRATTO PER MOVIMENTO, NON UN GIRO SOLO ----------------

         Andrea, 17 agosto: «il gesto e le frecce sono ancora un problema,
         adesso è un unico movimento lineare. Come possiamo fare» — e alla
         scelta fra tre strade ha preso questa: **tratti distinti, curvi ma
         staccati**.

         DUE ERRORI OPPOSTI, prima di arrivarci. Il primo: punti di
         passaggio infilati fra gli ictus, che a diciotto pixel l'uno
         dall'altro obbligano la curva a girare stretto — spigoli. Il
         secondo, correggendo: tangenti raccordate con continuità
         garantita, che tolgono gli spigoli e con essi anche i movimenti —
         un giro unico e indistinto, dove non si conta più quanti sono.

         La radice era la stessa: cercavo **una linea sola** che dicesse
         tutto il gesto. Ma il gesto non è una linea, sono tre movimenti
         (o due, o quattro), e in classe la prima cosa che si guarda è
         quanti sono e dove vanno. Separati, si contano a colpo d'occhio.

         COME SONO FATTI. Ogni movimento è un arco che va da un ictus al
         successivo, **curvo verso il centro** — la regola delle frecce di
         Andrea, 16 agosto: «le frecce di movimento vanno sempre verso
         l'interno, non verso l'esterno» — e **accorciato alle due punte**,
         così fra un movimento e l'altro resta uno stacco visibile e la
         freccia ha spazio per stare senza toccare il numero.

         Che il giro sia continuo lo dice l'animazione, che sul percorso
         intero non ha stacchi: la linea serve a contare i movimenti, il
         pallino a mostrare che non ci si ferma. */
      const centroG = centroDi(ciclo);
      const seg = [];
      for (let k = 0; k < N; k++) {
        const A = ictus[k].p, B = ictus[(k + 1) % N].p;
        /* quadratica: un solo punto di controllo, piegato verso il centro.
           La quadratica basta e avanza per un arco singolo, e ha il
           vantaggio di non poter fare flessi. */
        const Q = controlloVerso(A, B, centroG, 26);
        /* la si scrive come cubica, così il resto del codice — animazione,
           frecce, lunghezze — non deve sapere che tipo di curva è */
        seg.push({ b: [A,
                       [A[0] + 2 / 3 * (Q[0] - A[0]), A[1] + 2 / 3 * (Q[1] - A[1])],
                       [B[0] + 2 / 3 * (Q[0] - B[0]), B[1] + 2 / 3 * (Q[1] - B[1])],
                       B] });
      }

      ictus.forEach((ic, k) => { ic.giro = k; });

      /* IL RIQUADRO SI PRENDE DALLA CURVA, non dagli ictus, e va calcolato
         qui perché prima la curva non esiste. Guardando i soli punti
         numerati il giro veniva tagliato in basso e di lato: con le
         maniglie lunghe la curva sbanda ben oltre gli ictus, ed è proprio
         quello che la rende ampia.

         Il margine orizzontale resta generoso per le etichette laterali —
         «sinistra», «destra» sono parole lunghe e stanno fuori dai punti —
         mentre quello verticale è stretto: sopra e sotto ci vanno un
         numero e un nome, e l'altezza è la cosa che nelle slide scarseggia.
         A margine verticale largo la slide del gesto in tre sforava. */
      const px = [], py = [];
      seg.forEach(s => {
        const b = s.b;
        for (let q = 0; q <= 16; q++) {
          const u = 1 - q / 16, w = q / 16;
          px.push(u*u*u*b[0][0] + 3*u*u*w*b[1][0] + 3*u*w*w*b[2][0] + w*w*w*b[3][0]);
          py.push(u*u*u*b[0][1] + 3*u*u*w*b[1][1] + 3*u*w*w*b[2][1] + w*w*w*b[3][1]);
        }
      });
      const MX = 88, MY = 34;   // 26 tagliava «levare» e «battere»
      const x0 = Math.min.apply(null, px) - MX;
      const y0 = Math.min.apply(null, py) - MY;
      svg.setAttribute('viewBox', [x0, y0,
        Math.max.apply(null, px) + MX - x0,
        Math.max.apply(null, py) + MY - y0].join(' '));

      const cub = (b, t) => {
        const u = 1 - t;
        return [u*u*u*b[0][0] + 3*u*u*t*b[1][0] + 3*u*t*t*b[2][0] + t*t*t*b[3][0],
                u*u*u*b[0][1] + 3*u*u*t*b[1][1] + 3*u*t*t*b[2][1] + t*t*t*b[3][1]];
      };
      const cubTang = (b, t) => {
        const u = 1 - t;
        return Math.atan2(
          3*u*u*(b[1][1]-b[0][1]) + 6*u*t*(b[2][1]-b[1][1]) + 3*t*t*(b[3][1]-b[2][1]),
          3*u*u*(b[1][0]-b[0][0]) + 6*u*t*(b[2][0]-b[1][0]) + 3*t*t*(b[3][0]-b[2][0]));
      };
      /* la lunghezza serve a spartire il tempo: dentro una battuta i due
         pezzi non sono uguali, e dividerla a metà farebbe correre la mano
         sul pezzo corto e strisciare sul lungo */
      seg.forEach(s => {
        let L = 0, pr = cub(s.b, 0);
        for (let q = 1; q <= 24; q++) {
          const p = cub(s.b, q / 24);
          L += Math.hypot(p[0] - pr[0], p[1] - pr[1]); pr = p;
        }
        s.L = L;
      });

      /* ---- LE BATTUTE ---------------------------------------------------
         Una battuta va da un ictus al successivo, e per costruzione sono
         sempre due segmenti di spline. La prima è quella che ARRIVA sul
         battere, e non è un dettaglio: così il primo colpo che si sente è
         l'accento, e prima di quello la mano ha già un movimento di
         preparazione — il levare, che nel gesto vero c'è sempre. */
      /* Quanti pezzi ci sono in una battuta lo dice il ciclo, non una
         regola fissa. Bloccato a due, il due restava schiacciato: fra il
         levare e il battere serve un passaggio per proseguire a destra e un
         altro per risalire, e con uno solo la curva li mediava in una
         diagonale, appiattendo il giro in una lente. */
      /* Una battuta è ora UN segmento solo: quello che ARRIVA sull'ictus.
         Prima erano due o tre, perché fra un ictus e l'altro c'erano dei
         punti di passaggio; tolti quelli, la corrispondenza è esatta e la
         mano non può più correre su un pezzo e strisciare sull'altro. */
      this._battute = ictus.map((ic, b) => {
        const pezzi = [seg[(b - 1 + N) % N]];
        return { pezzi, pesi: [1], accento: b === 0 };
      });
      /* posizione dentro la battuta `b`, con f da 0 (partenza) a 1 (ictus) */
      const dentroBattuta = (b, f) => {
        const B = this._battute[b];
        let acc = 0;
        for (let k = 0; k < B.pezzi.length; k++) {
          if (f < acc + B.pesi[k] || k === B.pezzi.length - 1)
            return [B.pezzi[k].b, Math.max(0, Math.min(1, (f - acc) / B.pesi[k]))];
          acc += B.pesi[k];
        }
      };
      const suBattuta   = (b, f) => { const [bz, t] = dentroBattuta(b, f); return cub(bz, t); };
      const tangBattuta = (b, f) => { const [bz, t] = dentroBattuta(b, f); return cubTang(bz, t); };
      this._suBattuta = suBattuta;

      /* ---- IL TRATTO ----------------------------------------------------
         Un path solo, chiuso: è il giro che la mano fa e rifà. Disegnarlo
         spezzato in un tratto per movimento raccontava una bugia — che
         all'ictus il gesto finisca e ne cominci un altro. */

      /* I DISCHI BIANCHI VANNO SOTTO IL TRATTO. Disegnati sopra, coprivano
         la curva dove le passa vicino e il giro sembrava interrotto: nel due
         la mano rientra rasente al battere e spariva per un pezzo. Cercare
         una strada che schivasse i cerchi non è servito — non esiste, se la
         mano deve andare a sinistra e poi tornare. Ed è giusto che passi
         sopra: dice che sull'ictus non ci si ferma, ci si passa. */
      ictus.forEach(ic => {
        svg.appendChild(el('circle', { cx: ic.p[0], cy: ic.p[1], r: 15,
          fill: 'var(--carta, #fff)' }));
      });

      /* OGNI MOVIMENTO È UN TRATTO SUO, e fra uno e l'altro c'è aria.
         Il tratto si disegna dal 12% all'82% dell'arco: davanti lascia
         libero il numero da cui parte, dietro lascia il posto alla freccia
         e lo stacco prima del numero d'arrivo. Le due percentuali sono
         l'unica cosa da toccare se lo stacco sembra troppo o troppo poco. */
      const DA = 0.12, A_ = 0.82;
      const taglia = (b, t0, t1) => {
        /* de Casteljau due volte: la sottocurva di una cubica è una cubica,
           quindi il tratto accorciato resta esattamente la stessa curva —
           non un'approssimazione che si vedrebbe come una piega. */
        const spez = (p, t) => {
          const l = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const p01 = l(p[0], p[1]), p12 = l(p[1], p[2]), p23 = l(p[2], p[3]);
          const p012 = l(p01, p12), p123 = l(p12, p23), q = l(p012, p123);
          return { sx: [p[0], p01, p012, q], dx: [q, p123, p23, p[3]] };
        };
        const primo = spez(b, t1).sx;
        return spez(primo, t0 / t1).dx;
      };
      seg.forEach(s => {
        const c = taglia(s.b, DA, A_);
        svg.appendChild(el('path', {
          d: 'M' + c[0][0] + ',' + c[0][1] +
             ' C' + c[1][0] + ',' + c[1][1] + ' ' + c[2][0] + ',' + c[2][1] +
             ' ' + c[3][0] + ',' + c[3][1],
          fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5,
          'stroke-linecap': 'round', opacity: .45 }));
      });

      /* ---- LE FRECCE ----------------------------------------------------
         Una per battuta, sulla curva, girata come la tangente: dice da che
         parte si va e che lì la mano sta ancora andando. */
      this._battute.forEach((B, b) => {
        /* LA FRECCIA STA IN PUNTA AL TRATTO, dove il tratto finisce e
           comincia lo stacco: è il posto in cui dice davvero «si va di
           qui», subito prima del numero d'arrivo. Stava a tre quarti
           quando il percorso era un giro unico e la punta cadeva in mezzo
           al nulla; adesso che i movimenti sono separati, la punta è la
           fine del movimento. */
        const q = suBattuta(b, A_), a = tangBattuta(b, A_);
        const L = 9, W = 5.5;
        const pta = (dx, dy) => (q[0] + dx * Math.cos(a) - dy * Math.sin(a)) + ',' +
                                (q[1] + dx * Math.sin(a) + dy * Math.cos(a));
        svg.appendChild(el('polygon', {
          points: [pta(L, 0), pta(-L * .55, W), pta(-L * .55, -W)].join(' '),
          fill: 'currentColor', opacity: .75 }));

        /* ---- LA SUDDIVISIONE, dentro la battuta ---------------------- */
        for (let k = 1; k < sudd; k++) {
          const p = suBattuta(b, k / sudd);
          svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: 3.6,
            fill: 'currentColor', opacity: .5 }));

          /* I PALLINI NON HANNO NOME, e non è una dimenticanza. Andrea, 16
             agosto: «non utilizziamo nessuna parola dentro, sono le
             suddivisioni. Le parole che usiamo sono battere e levare».
             Le avevo etichettate «su» e «centro»: due termini in più da
             imparare per dire una cosa che il disegno dice da sé — che la
             suddivisione sta dentro il movimento. Il vocabolario resta di
             due parole, e sono quelle degli ictus. */
        }
      });

      /* gli ictus: dove il battito cade. Il cerchio sta SOPRA il tratto e
         non lo interrompe — la mano ci passa, non ci si ferma. */
      ictus.forEach((ic, i) => {
        const [x, y] = ic.p;
        /* solo il bordo: il disco bianco è già stato messo sotto il tratto */
        svg.appendChild(el('circle', { cx: x, cy: y, r: 15,
          fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5 }));
        const t = el('text', { x, y: y + 5.5, 'text-anchor': 'middle',
          'font-size': 15, 'font-weight': 700, fill: 'currentColor' });
        t.textContent = String(i + 1);
        svg.appendChild(t);

        /* Il nome va dalla parte OPPOSTA al giro, come le etichette della
           suddivisione. Prima era agganciato al nome del punto — «sotto se è
           in basso, di lato se è di lato» — e bastava spostare un punto per
           ritrovarselo addosso alla curva. Così si sistema da sé. */
        let vx = x - centro[0], vy = y - centro[1];
        const L2 = Math.hypot(vx, vy) || 1;
        vx /= L2; vy /= L2;
        const n = el('text', { x: x + vx * 23, y: y + vy * 26 + 4,
          'text-anchor': vx < -.35 ? 'end' : (vx > .35 ? 'start' : 'middle'),
          'font-size': 11, fill: 'currentColor', opacity: .7 });
        n.textContent = ic.nome;
        svg.appendChild(n);
      });

      const avvio = suBattuta(0, 0);
      const mano = el('circle', { cx: avvio[0], cy: avvio[1],
        r: 7, fill: 'var(--ambra, #f59e0b)', opacity: 0, class: 'tac-gesto-mano' });
      svg.appendChild(mano);
      this._mano = mano;

      this.appendChild(svg);

      if (this.hasAttribute('play')) {
        const barra = document.createElement('div');
        barra.className = 'tac-barra no-stampa';
        const bt = document.createElement('button');
        bt.className = 'btn';
        bt.innerHTML = '&#9654; Guarda il gesto';
        bt.onclick = () => this.suona(bt);
        barra.appendChild(bt);
        this.appendChild(barra);
      }
    }

    /* La mano percorre un arco per movimento e arriva sull'ictus insieme al
       colpo. L'accento è il primo: le altezze vengono da Audio.LIVELLI e
       non si scrivono qui.

       GIRA FINCHÉ NON SI FERMA. Andrea, 16 agosto: «lo farei proseguire in
       loop fino a quando non si ferma, così i ragazzi si possono allenare
       mentre lo vedono». Un solo giro bastava per capire lo schema, non per
       farci pratica: la classe ha bisogno di ripeterlo, e riavviarlo a mano
       ogni due secondi avrebbe rotto proprio la pulsazione che il gesto deve
       insegnare a tenere. Il bottone diventa un interruttore: si preme per
       partire, si preme di nuovo per fermare. */
    async suona(bt) {
      if (this._inCorso) { this.ferma(); return; }
      this._inCorso = true;
      if (bt) bt.innerHTML = '&#9632; Ferma';
      await Audio.avvia();
      const battute = this._battute, suBattuta = this._suBattuta;
      const durata = 60 / (this._tempo || 60);
      this._mano.setAttribute('opacity', 1);

      /* UN OROLOGIO SOLO PER LA MANO E PER IL COLPO. Andrea, 16 agosto: «il
         battito acustico deve corrispondere con il numero».

         Prima ce n'erano due. La mano andava sull'orologio di sistema, il
         suono su quello della scheda audio, e i due scivolano: basta un
         fotogramma perso perché il colpo arrivi quando la mano ha già
         passato il numero. Peggio, il colpo era chiesto per «adesso più due
         centesimi» nel momento in cui il codice si accorgeva del passaggio —
         cioè sempre un po' in ritardo, di quanto era lungo il fotogramma.

         Adesso il tempo lo dà l'audio anche alla mano, e i colpi si
         prenotano in anticipo all'istante esatto in cui cadono, invece di
         essere sparati quando ce ne si accorge. Il numero e il suono cadono
         insieme perché sono la stessa cosa contata una volta sola. */
      const oraAudio = () => (Audio.pronto && window.Tone)
        ? Tone.now() : performance.now() / 1000;
      const t0 = oraAudio();
      let prenotato = 1;      // il colpo `k` cade a t0 + k*durata

      const passo = () => {
        if (!this._inCorso) return;
        const t = oraAudio() - t0;

        /* si prenotano i colpi che cadono entro un quarto di secondo: in
           anticipo, e all'istante giusto al centesimo */
        if (Audio.pronto) {
          while (prenotato * durata - t < 0.25) {
            const k = (prenotato - 1) % battute.length;
            const liv = battute[k].accento ? Audio.LIVELLI.metro : Audio.LIVELLI.puls;
            Audio.tick.triggerAttackRelease(liv.altezza, '64n',
                                            t0 + prenotato * durata, liv.forza);
            prenotato++;
          }
        }

        const n = Math.floor(t / durata);        // battuta assoluta, cresce sempre
        const i = ((n % battute.length) + battute.length) % battute.length;
        const f = (t - n * durata) / durata;     // a che punto siamo dentro
        const p = suBattuta(i, Math.max(0, Math.min(1, f)));
        this._mano.setAttribute('cx', p[0]);
        this._mano.setAttribute('cy', p[1]);
        this._raf = requestAnimationFrame(passo);
      };
      this._raf = requestAnimationFrame(passo);
    }

    /* Ferma il gesto: la chiama il bottone quando si preme di nuovo, e la
       chiama il palco quando si cambia slide (vedi Deck.vai, che spegne
       tutto quello che sta suonando dietro le quinte). */
    ferma() {
      this._inCorso = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._mano) this._mano.setAttribute('opacity', 0);
      const bt = this.querySelector('.tac-barra button');
      if (bt) bt.innerHTML = '&#9654; Guarda il gesto';
    }

    disconnectedCallback() { this.ferma(); }
  }
  customElements.define('tac-gesto', TacGesto);

  /* ==========================================================
     9-ter. <tac-griglia> — SISTEMI VUOTI PER LA SCRITTURA A MANO

     <tac-griglia sistemi="4" tipo="doppio" time="4/4" keysig="C"></tac-griglia>
     tipo: singolo | doppio | ritmico
     ========================================================== */

  class TacGriglia extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      const VF = window.VexFlow;
      const n      = parseInt(this.getAttribute('sistemi') || '4', 10);
      const tipo   = this.getAttribute('tipo') || 'singolo';
      const time   = this.getAttribute('time') || '';
      const keysig = this.getAttribute('keysig') || '';
      const numera = this.hasAttribute('numera');
      const larghezza = parseInt(this.getAttribute('width') || '0', 10) || 680;
      const clef = tipo === 'ritmico' ? 'percussion' : 'treble';
      const altezza = tipo === 'triplo' ? 320 : (tipo === 'doppio' ? 210 : 120);
      /* melodie date, una per sistema, separate da punto e virgola */
      const melodie = (this.getAttribute('melodia') || '').split(';').map(x => x.trim());

      if (this.getAttribute('caption')) {
        const d = document.createElement('div');
        d.className = 'tac-didascalia';
        d.textContent = this.getAttribute('caption');
        this.appendChild(d);
      }

      for (let i = 0; i < n; i++) {
        const riga = document.createElement('div');
        riga.className = 'tac-griglia-riga';
        if (numera) {
          const num = document.createElement('span');
          num.className = 'tac-griglia-num';
          num.textContent = (i + 1);
          riga.appendChild(num);
        }
        const tela = document.createElement('div');
        riga.appendChild(tela);
        this.appendChild(riga);

        const r = new VF.Renderer(tela, VF.Renderer.Backends.SVG);
        r.resize(larghezza, altezza);
        const ctx = r.getContext();
        const sup = new VF.Stave(10, 14, larghezza - 24);
        sup.addClef(clef);
        if (keysig && tipo !== 'ritmico') sup.addKeySignature(keysig);
        if (time) sup.addTimeSignature(time);
        sup.setContext(ctx).draw();

        /* Melodia data sul rigo superiore, se fornita per questo sistema */
        const mel = melodie[i];
        if (mel) {
          const dati = leggiNote(mel);
          const note = dati.map(d => {
            const sn = new VF.StaveNote({ keys: d.keys, duration: d.dur + (d.pausa ? 'r' : ''), clef: clef });
            if (!d.pausa) d.keys.forEach((k, j) => {
              const p = N.scomponi(k);
              if (p.alt) sn.addModifier(new VF.Accidental(p.alt), j);
            });
            if (d.puntata) VF.Dot.buildAndAttach([sn], { all: true });
            return sn;
          });
          const tot = dati.reduce((a, d) => a + d.battiti, 0);
          const voce = new VF.Voice({ numBeats: Math.max(1, Math.ceil(tot)), beatValue: 4 });
          voce.setMode(VF.VoiceMode.SOFT);
          voce.addTickables(note);
          const trav = VF.Beam.generateBeams(note.filter((n, j) => !dati[j].pausa));
          new VF.Formatter().joinVoices([voce]).format([voce], larghezza - 120);
          voce.draw(ctx, sup);
          trav.forEach(b => b.setContext(ctx).draw());
        }

        if (tipo === 'doppio') {
          const inf = new VF.Stave(10, 118, larghezza - 24);
          inf.addClef('bass');
          if (keysig) inf.addKeySignature(keysig);
          if (time) inf.addTimeSignature(time);
          inf.setContext(ctx).draw();
          new VF.StaveConnector(sup, inf).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
          new VF.StaveConnector(sup, inf).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
          new VF.StaveConnector(sup, inf).setType(VF.StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();
        }

        /* Triplo: melodia sopra, doppio pentagramma sotto per l'accompagnamento */
        if (tipo === 'triplo') {
          const acc1 = new VF.Stave(10, 128, larghezza - 24);
          acc1.addClef('treble');
          if (keysig) acc1.addKeySignature(keysig);
          if (time) acc1.addTimeSignature(time);
          acc1.setContext(ctx).draw();

          const acc2 = new VF.Stave(10, 232, larghezza - 24);
          acc2.addClef('bass');
          if (keysig) acc2.addKeySignature(keysig);
          if (time) acc2.addTimeSignature(time);
          acc2.setContext(ctx).draw();

          new VF.StaveConnector(acc1, acc2).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
          new VF.StaveConnector(acc1, acc2).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
          new VF.StaveConnector(sup, acc2).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
          new VF.StaveConnector(sup, acc2).setType(VF.StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();
        }
      }
    }
  }
  customElements.define('tac-griglia', TacGriglia);

  /* ==========================================================
     9-quater. <tac-brano> — ASCOLTO DI UN BRANO DI REPERTORIO

     <tac-brano src="audio/A01_mozart_k155.json"
                titolo="Mozart, Quartetto K155"
                metronomo></tac-brano>

     Riproduce un estratto di repertorio in pubblico dominio,
     con controllo di velocità, metronomo opzionale e conta-battute.
     ========================================================== */

  class TacBrano extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      this._src = this.getAttribute('src');
      const nodoDati = this.querySelector('script[type="application/json"]');
      this._grezzo = (nodoDati ? nodoDati.textContent : this.textContent).trim();
      /* le partiture arrivano incorporate: così si possono illuminare battuta
         per battuta, cosa impossibile con un'immagine esterna */
      this._parti = [...this.querySelectorAll('figure.tac-part')];
      this._parti.forEach(x => x.remove());
      this.textContent = '';
      this._dati = null;
      this._suona = false;

      const box = document.createElement('div');
      box.className = 'tac-brano-box';
      this.appendChild(box);
      this._box = box;

      const testa = document.createElement('div');
      testa.className = 'tac-brano-testa';
      testa.innerHTML = '<span class="tac-brano-titolo">' +
        (this.getAttribute('titolo') || 'Ascolto') + '</span>' +
        '<span class="tac-brano-metro"></span>' +
        '<span class="tac-brano-str"></span>';
      box.appendChild(testa);

      const barra = document.createElement('div');
      barra.className = 'tac-barra no-stampa';
      this._play = document.createElement('button');
      this._play.className = 'btn tac-play';
      this._play.innerHTML = '&#9654; Ascolta';
      this._play.onclick = () => this._suona ? this.ferma() : this.avvia();
      barra.appendChild(this._play);

      /* La registrazione incisa con MuseScore. Sta accanto alla lezione e
         non dipende da nessun sito esterno: se la rete della scuola è lenta
         questo parte lo stesso, mentre l'esecuzione dal vivo deve prima
         scaricare i campioni degli strumenti.

         Dove c'è la registrazione, l'esecuzione dal vivo sparisce insieme
         al metronomo e al cursore della velocità. Tre modi di far suonare
         lo stesso brano sulla stessa striscia sono tre modi di distrarsi:
         resta un pulsante solo, e la barra per spostarsi nel brano. */
      /* ══ L'ESECUZIONE VERA VIENE PRIMA DELL'INCISIONE ══
         Andrea, 30 agosto 2026: «magari si può utilizzare l'audio preso
         da un'esecuzione di youtube, farlo scorrere con la partitura e
         segnalare quello che succede analiticamente, con la possibilità
         di fermarsi».
         Dove c'è `youtube` suona quella, e l'incisione di MuseScore
         resta come riserva se la rete non c'è. */
      /* ⚠ IL VIDEO STA ACCANTO ALL'INCISIONE, NON AL POSTO.
         E la ragione è la mappa. La partitura scorre perché una mappa
         dice a che millisecondo comincia ogni battuta; quella
         dell'incisione la scrive MuseScore da sé, quella di
         un'esecuzione vera va **tarata a orecchio**.
         Se il video prendesse il posto dell'incisione, mettere un
         identificativo nel catalogo — un gesto di dieci secondi —
         spegnerebbe lo scorrimento su tutte le lezioni che usano quel
         brano, e non lo direbbe nessuno. Quindi: l'orologio che comanda
         la partitura resta l'incisione, finché il video non ha la
         **sua** mappa (`mappa-video`); il video si ascolta a parte, e
         quando la mappa arriva prende il comando. */
      const conMappaVideo = !!this.getAttribute('mappa-video');
      const eseguita = !!this.getAttribute('youtube') && conMappaVideo;
      const incisa = !eseguita && !!this.getAttribute('inciso');
      if (eseguita) this.preparaInciso(barra, this.orologioYouTube());
      else if (incisa) this.preparaInciso(barra);
      else if (this.getAttribute('youtube')) this.orologioYouTube();

      /* ══ I SEGNI CHE ARRIVANO MENTRE LA MUSICA VA ══
         «segnalare quello che succede analiticamente… con la possibilità
         di fermarsi». Gli indirizzi sono quelli di `tac-stave` — `b29`,
         `b29-b31` — ma qui contano le **battute della partitura**, e
         `da-battuta` dice quale numero porta la prima incisa.
         Senza `da-battuta` il conto parte da 1, che è il caso normale;
         il Bach dell'unità 2 di quinta comincia dalla 25 e senza quel
         numero `b29` cadrebbe quattro battute più in là. */
      this._segni = leggiSegni(this.getAttribute('segna'));
      this._daBattuta = parseInt(this.getAttribute('da-battuta') || '1', 10);
      if (this._segni.length) {
        const n = document.createElement('div');
        n.className = 'tac-brano-segno no-stampa';
        n.setAttribute('aria-live', 'polite');
        box.appendChild(n);
        this._strisciaSegno = n;
        this.diciSegno(-1);
      }

      if (!incisa && this.hasAttribute('metronomo')) {
        this._metro = document.createElement('button');
        this._metro.className = 'btn secondario';
        this._metro.textContent = 'Metronomo: no';
        this._metro.dataset.on = '0';
        this._metro.onclick = () => {
          const on = this._metro.dataset.on === '1' ? '0' : '1';
          this._metro.dataset.on = on;
          this._metro.textContent = 'Metronomo: ' + (on === '1' ? 'sì' : 'no');
          this._metro.classList.toggle('ambra', on === '1');
        };
        barra.appendChild(this._metro);
      }
      /* Esecuzione reale. Con l'attributo youtube si punta a un video preciso e,
         se servono, agli attributi da/a per isolare esattamente il passo che ci
         interessa: il video parte e si ferma dove diciamo noi, senza cercarlo
         davanti alla classe. Senza youtube si apre la ricerca sul titolo. */
      const yt = this.getAttribute('youtube');
      const cerca = this.getAttribute('cerca');

      /* accetta i secondi, oppure mm:ss, oppure h:mm:ss */
      const istante = v => {
        if (!v) return null;
        const p = String(v).trim().split(':').map(parseFloat);
        if (p.some(isNaN)) return null;
        return Math.round(p.reduce((t, x) => t * 60 + x, 0));
      };
      const da = istante(this.getAttribute('da'));
      const a  = istante(this.getAttribute('a'));

      if (yt) {
        /* Il video si apre dentro la slide, perché solo il lettore incorporato
           accetta un punto di fine: così si sente la sezione che interessa e
           non il brano intero. Alcuni canali vietano l'incorporamento e
           restituiscono l'errore 153: accanto c'è sempre il collegamento
           diretto, che funziona comunque. */
        const b = document.createElement('button');
        b.className = 'btn secondario tac-vero';
        b.innerHTML = '&#9673; Esecuzione reale';
        b.title = (location.protocol === 'file:')
          ? 'Da disco si apre in una scheda; dal sito pubblicato si apre qui dentro'
          : (da !== null ? 'Parte e si ferma sul passo che ci serve'
                         : 'Ascolta il brano suonato da strumenti veri');
        b.onclick = () => {
          if (this._tubo) {
            const p = this._tubo.parentNode;
            this._tubo.remove(); this._tubo = null;
            if (p) p.classList.remove('con-video');
            b.innerHTML = '&#9673; Esecuzione reale';
            return;
          }
          this.ferma();
          const q = ['rel=0', 'modestbranding=1', 'playsinline=1'];
          if (da !== null) q.push('start=' + da);
          if (a !== null) q.push('end=' + a);
          const c = document.createElement('div');
          c.className = 'tac-tubo no-stampa';
          c.innerHTML =
            '<iframe src="https://www.youtube-nocookie.com/embed/' +
            encodeURIComponent(yt) + '?' + q.join('&') + '" allowfullscreen ' +
            'referrerpolicy="strict-origin-when-cross-origin" title="Esecuzione reale"></iframe>' +
            '<a class="tac-fuori" target="_blank" rel="noopener" href="' +
            'https://www.youtube.com/watch?v=' + encodeURIComponent(yt) +
            (da !== null ? '&t=' + da : '') + '">' +
            '&#9654;&nbsp; Il video non parte? Aprilo su YouTube &#8599;</a>';
          const dove = this._schermo
            ? this._schermo.querySelector('.tac-schermo-corpo')
            : this._box;
          if (this._schermo) { dove.classList.add('con-video'); dove.appendChild(c); }
          else dove.insertBefore(c, this._box.querySelector('.tac-metro') || null);
          this._tubo = c;
          b.innerHTML = '&#10005; Chiudi il video';
        };
        barra.appendChild(b);

        /* Nessuna etichetta quando la sezione è già decisa: l'informazione
           serve a me che monto, non a chi guarda. Resta solo il promemoria
           ambra sui brani ancora da restringere. */
        if (da === null) {
          const e = document.createElement('span');
          e.className = 'tac-passo aperto';
          e.textContent = 'brano intero — da restringere';
          barra.appendChild(e);
        }
      } else if (cerca) {
        const b = document.createElement('a');
        b.className = 'btn secondario tac-vero';
        b.target = '_blank'; b.rel = 'noopener';
        b.href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(cerca);
        b.innerHTML = '&#9673; Cerca un\'esecuzione';
        b.title = 'Apre la ricerca: nessun video ancora fissato per questo brano';
        barra.appendChild(b);
      }

      /* Registrazione vera e propria, se ne abbiamo una di libera */
      const reg = this.getAttribute('registrazione');
      if (reg) {
        const a = document.createElement('audio');
        a.controls = true; a.preload = 'none'; a.src = reg;
        a.className = 'tac-brano-reg no-stampa';
        this._reg = a;
      }

      box.appendChild(barra);
      if (this._reg) box.appendChild(this._reg);

      /* Sulla slide non va nessuna partitura: non ci sta e non si legge.
         E non vanno nemmeno i comandi: proiettati sono minuti, e chi guarda
         non deve scegliere fra sei pulsanti. Sulla slide resta la scheda del
         brano, e la scheda intera è il pulsante che apre la pagina piena —
         dove ci sono la partitura completa e tutti i comandi d'ascolto. */
      if (this._parti.length) {
        const cont = document.createElement('div');
        cont.className = 'tac-brano-part';
        this._parti.forEach(x => { x.hidden = true; cont.appendChild(x); });
        box.appendChild(cont);

        box.classList.add('apribile');
        box.tabIndex = 0;
        box.setAttribute('role', 'button');
        box.title = 'Apre la partitura completa con i comandi d\'ascolto';
        /* Un clic su un comando non deve aprire la pagina piena. Ma il
           comando è il pulsante, non la striscia che lo contiene: la barra
           attraversa tutta la cornice, e prendendo per comando anche lei si
           rendeva morta una fascia larga quanto il lettore. Chi cliccava lì
           — che è il centro della cornice, cioè il punto più naturale dove
           cliccare — non otteneva niente, e doveva riprovare più in alto.
           Si guarda quindi solo agli elementi che reagiscono davvero. */
        const suComandi = e => !!(e.target.closest &&
          e.target.closest('button, a, input, select, label, audio, .tac-tubo'));
        box.addEventListener('click', e => {
          if (suComandi(e)) return;
          this.schermoIntero(box);
        });
        box.addEventListener('keydown', e => {
          if (suComandi(e)) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.schermoIntero(box); }
        });
      }

      /* Compatibilità: partitura come immagine esterna */
      const part = this._parti.length ? null : this.getAttribute('partitura');
      if (part) {
        const fig = document.createElement('figure');
        fig.className = 'tac-brano-part';
        const im = document.createElement('img');
        im.src = part; im.alt = 'Partitura di ' + (this.getAttribute('titolo') || 'questo brano');
        im.loading = 'lazy';
        fig.appendChild(im);
        box.appendChild(fig);
      }

      /* Il cursore della velocità serve solo all'esecuzione dal vivo. Dove
         c'è la registrazione incisa non compare: resta nel documento, con
         il suo valore al cento per cento, perché il resto del codice lo
         legge, ma non si vede e non distrae. */
      const ctrl = document.createElement('div');
      ctrl.className = 'tac-metro no-stampa';
      ctrl.innerHTML = '<label>Velocità <input type="range" min="40" max="100" value="100"> ' +
                       '<strong class="perc">100</strong>%</label>';
      /* Stesso motivo: non appeso affatto invece che nascosto. */
      if (!this.getAttribute('inciso')) box.appendChild(ctrl);
      this._range = ctrl.querySelector('input');
      this._range.oninput = () => ctrl.querySelector('.perc').textContent = this._range.value;

      const puls = document.createElement('div');
      puls.className = 'tac-pulsazioni';
      /* subito sotto il titolo: è la prima cosa che l'occhio cerca quando
         la musica parte, e in fondo al lettore non si vedeva */
      box.insertBefore(puls, testa.nextSibling);
      this._puls = puls;

      const prepara = d => {
        this._dati = d;
        testa.querySelector('.tac-brano-metro').textContent = d.metro + ' · ' + d.battute + ' battute';
        const n = parseInt(d.metro.split('/')[0], 10) || 4;
        this._perBattuta = (d.metro === '6/8') ? 2 : ((d.metro === '9/8') ? 3 : n);
        for (let i = 0; i < this._perBattuta; i++) {
          const p = document.createElement('div');
          p.className = 'tac-puls';
          puls.appendChild(p);
        }
      };

      /* I dati stanno dentro l'elemento: così la lezione funziona anche
         aperta da disco, dove il browser blocca il caricamento dei file. */
      if (this._grezzo) {
        try { prepara(JSON.parse(this._grezzo)); }
        catch (e) { testa.querySelector('.tac-brano-metro').textContent = 'dati non validi'; }
      } else if (this._src && typeof fetch === 'function') {
        fetch(this._src).then(r => r.json()).then(prepara)
          .catch(() => testa.querySelector('.tac-brano-metro').textContent = 'audio non trovato');
      } else {
        testa.querySelector('.tac-brano-metro').textContent = 'nessun dato';
      }
    }

    async avvia() {
      if (!this._dati) return;
      await Audio.avvia();
      if (!Audio.pronto) {
        const e = this._box.querySelector('.tac-brano-str');
        if (e) { e.textContent = 'audio bloccato dal browser — riclicca'; e.classList.remove('vero'); }
        return;
      }
      this.ferma();

      /* L'organico giusto per questo brano: gli archi per un quartetto, il
         coro per un corale. Si scarica alla prima esecuzione e poi resta. */
      const org = this.getAttribute('organico') || 'tastiera';
      const et = this._box.querySelector('.tac-brano-str');
      const spec = Audio.ORGANICI[org] || [];
      if (et && spec[0] && !Audio._strum[spec[0].f]) {
        et.textContent = 'carico gli strumenti…'; et.classList.remove('vero');
      }
      this._play.disabled = true;
      const strumenti = await Audio.preparaOrganico(org);
      this._play.disabled = false;

      /* L'etichetta dichiara l'organico solo quando i campioni sono arrivati.
         Se la rete manca si suona in sintetico e non si dice niente: è un
         ripiego, non un'informazione che serva a chi sta seguendo. */
      if (et) {
        const ok = strumenti.length > 0;
        et.textContent = ok ? Audio.nomeStrumento(org, true) : '';
        et.classList.toggle('vero', ok);
        /* L'icona dell'organico accanto al nome. Chi guarda da lontano vede
           un violino o un pianoforte prima di leggere la scritta. */
        if (ok) et.dataset.org = org; else delete et.dataset.org;
      }

      const d = this._dati;
      const fatt = parseInt(this._range.value, 10) / 100;
      const bpm = d.bpm * fatt;
      const secQuarto = 60 / bpm;
      /* Programmare le note direttamente sugli strumenti le rende
         inarrestabili: una volta in coda partono comunque. Sul Transport
         invece si cancellano tutte in un colpo, ed è quello che deve fare
         il pulsante Ferma. */
      Tone.Transport.stop();
      Tone.Transport.cancel();
      Tone.Transport.position = 0;
      const t0 = 0.15;
      this._suona = true;
      this._play.innerHTML = '&#9632; Ferma';

      /* le note del brano */
      this._id = [];
      d.voci.forEach((voce, iv) => {
        const str = Audio.voce(iv, strumenti);
        /* la parte superiore un poco più in luce delle interne */
        const forza = iv === 0 ? 0.8 : (iv === d.voci.length - 1 ? 0.6 : 0.42);
        voce.forEach(([off, dur, midi]) => {
          const q = Tone.Frequency(midi, 'midi').toNote();
          Tone.Transport.scheduleOnce(
            t => str.triggerAttackRelease(q, dur * secQuarto * 0.94, t, forza),
            t0 + off * secQuarto);
        });
      });

      /* Metronomo e conta-battute.

         Se il brano comincia in levare, il primo battere non cade
         all'inizio: cade dopo l'anacrusi. Contare da zero metterebbe
         l'accento forte sulla nota d'avvio — cioè esattamente
         sull'unica nota che forte non è, e in una lezione sul metro
         sarebbe l'errore peggiore possibile. Il conto parte quindi dal
         primo battere e torna indietro sul levare. */
      const quartiPerPuls = (d.metro === '6/8' || d.metro === '9/8') ? 1.5 : 1;
      const anac = parseFloat(d.anacrusi || 0) || 0;
      const durata = Math.max(...d.voci.flat().map(e => e[0] + e[1]));
      const jDa = -Math.floor(anac / quartiPerPuls + 1e-9);
      for (let j = jDa; ; j++) {
        const q = anac + j * quartiPerPuls;
        if (q > durata + 1e-9) break;
        if (q < -1e-9) continue;
        const k = ((j % this._perBattuta) + this._perBattuta) % this._perBattuta;
        Tone.Transport.scheduleOnce(t => {
          /* La domanda si fa qui, un battito per volta, e non una volta sola
             all'avvio: così il metronomo entra ed esce mentre la musica va,
             che è il modo in cui serve in classe — lo si accende quando la
             classe perde il passo e lo si toglie appena l'ha ritrovato. */
          if (this._metro && this._metro.dataset.on === '1')
            Audio.metronomo(k === 0, t, true);   // sopra la registrazione
          Tone.Draw.schedule(() => {
            [...this._puls.children].forEach((p, i) => p.classList.toggle('on', i === k));
          }, t);
        }, t0 + q * secQuarto);
      }
      /* la battuta in corso si accende: è il ponte fra ascolto e lettura.
         La battuta in levare esiste anche nella partitura incisa, ed è la
         prima: i due conti devono corrispondere. */
      const quartiPerBattuta = this._perBattuta * quartiPerPuls;
      const confini = anac > 0 ? [0] : [];
      for (let q = anac; q < durata - 1e-9; q += quartiPerBattuta) confini.push(q);
      confini.forEach((q, k) => Tone.Transport.scheduleOnce(
        t => Tone.Draw.schedule(() => this.illumina(k), t),
        t0 + q * secQuarto));

      Tone.Transport.scheduleOnce(
        t => Tone.Draw.schedule(() => this.ferma(), t),
        t0 + durata * secQuarto + 0.6);

      Tone.Transport.start();
    }

    /* La partitura intera a tutta pagina: sulla slide non si leggerebbe.
       Il brano si può avviare da dentro, così si segue mentre suona. */
    schermoIntero(bottone) {
      if (this._schermo) { this.chiudiSchermo(); return; }
      const fig = this._parti[this._parti.length - 1];   /* la partitura intera */

      const ov = document.createElement('div');
      ov.className = 'tac-schermo no-stampa';

      const testa = document.createElement('div');
      testa.className = 'tac-schermo-testa';
      const tit = document.createElement('strong');
      tit.textContent = this.getAttribute('titolo') || 'Partitura';
      testa.appendChild(tit);

      /* I comandi non si duplicano: si spostano qui e poi tornano al loro
         posto. Così il comportamento è identico e non c'è nulla da tenere
         allineato fra due copie. */
      const barra = this._box.querySelector('.tac-barra');
      const tempo = this._box.querySelector('.tac-metro');
      const puls  = this._box.querySelector('.tac-pulsazioni');
      this._tornano = [];
      [barra, tempo].forEach(el => {
        if (el) { this._tornano.push([el, el.parentNode]); testa.appendChild(el); }
      });

      /* I pallini stanno in alto, sotto la testata: durante l'esecuzione
         l'occhio è sulla partitura e il conta-battute deve restare nel
         campo visivo, non ai piedi della pagina. */
      const cima = document.createElement('div');
      cima.className = 'tac-schermo-conta';
      if (puls) { this._tornano.push([puls, puls.parentNode]); cima.appendChild(puls); }

      const corpo = document.createElement('div');
      corpo.className = 'tac-schermo-corpo';
      fig.hidden = false;
      corpo.appendChild(fig);

      const piede = document.createElement('div');
      piede.className = 'tac-schermo-piede';
      /* anche la registrazione libera, se c'è, sta qui: sulla slide non serve */
      if (this._reg && this._reg.parentNode === this._box) {
        this._tornano.push([this._reg, this._box]);
        piede.appendChild(this._reg);
      }
      const chiudi = document.createElement('button');
      chiudi.className = 'btn secondario';
      chiudi.innerHTML = '&#10005; Chiudi  (Esc)';
      chiudi.onclick = () => this.chiudiSchermo();
      piede.appendChild(chiudi);

      ov.appendChild(testa); ov.appendChild(cima);
      ov.appendChild(corpo); ov.appendChild(piede);
      document.body.appendChild(ov);
      document.body.classList.add('con-schermo');
      this._schermo = ov;
      this._tastoTutta = bottone;
      this._esc = e => { if (e.key === 'Escape') { e.stopPropagation(); this.chiudiSchermo(); } };
      document.addEventListener('keydown', this._esc, true);
    }

    /* Che cosa fa Esc mentre si ascolta.

       Prima Esc funzionava **solo** con la partitura a schermo intero
       aperta: era l'unico posto in cui l'ascoltatore del tasto veniva
       registrato. Chi stava semplicemente ascoltando un brano — col video
       aperto dentro la slide, o con la sola registrazione — premeva Esc e
       non succedeva niente, e in classe quel tasto lo si preme per fermare
       tutto quando serve parlare.

       L'ordine conta: prima si chiude quello che copre lo schermo, poi si
       ferma quello che suona. Chi preme Esc col video aperto vuole quasi
       sempre chiudere il video, non fermare l'audio che non sta suonando. */
    esci() {
      if (this._schermo) { this.chiudiSchermo(); return true; }
      let fatto = false;
      if (this._tubo) {
        const p = this._tubo.parentNode;
        this._tubo.remove(); this._tubo = null;
        if (p) p.classList.remove('con-video');
        const b = this.querySelector('.tac-vero');
        if (b) b.innerHTML = '&#9673; Esecuzione reale';
        fatto = true;
      }
      if (this._audio && !this._audio.paused) { this._audio.pause(); fatto = true; }
      if (this._suona) { this.ferma(); fatto = true; }
      return fatto;
    }

    chiudiSchermo() {
      if (!this._schermo) return;
      this.ferma();
      if (this._tubo) {
        const p = this._tubo.parentNode;
        this._tubo.remove(); this._tubo = null;
        if (p) p.classList.remove('con-video');
      }
      const fig = this._parti[this._parti.length - 1];
      fig.hidden = true;
      this._box.querySelector('.tac-brano-part').appendChild(fig);
      (this._tornano || []).forEach(([el, casa]) => { if (casa) casa.appendChild(el); });
      this._tornano = [];
      this._schermo.remove(); this._schermo = null;
      document.body.classList.remove('con-schermo');
      document.removeEventListener('keydown', this._esc, true);
    }

    /* ----------------------------------------------------------
       LA REGISTRAZIONE INCISA
       Un mp3 uscito da MuseScore più la mappa delle battute, che dice
       a quale millisecondo comincia ciascuna. Il cursore non si limita a
       saltare da una battuta all'altra: fra un attacco e il successivo
       avanza per interpolazione, così scorre invece di scattare.
       Con un ritornello la stessa battuta compare due volte nella mappa,
       ed è giusto: l'indice è la posizione nella partitura, non
       nell'esecuzione.
       ---------------------------------------------------------- */
    /* ----------------------------------------------------------
       L'ESECUZIONE VERA — UN PLAYER YOUTUBE CON LA FACCIA DI UN <audio>

       <tac-brano youtube="dQw4w9WgXcQ" da="72" a="99"
                  mappa='{"eventi":[[0,0],[1,2380],…],"durata":27000}'
                  segna="b29-b31=pedale di tonica">

       PERCHÉ YOUTUBE E NON UN FILE. Perché il file non si può avere: le
       incisioni buone sono protette, e scaricarle non si fa. Il player
       incorporato è il modo previsto per ascoltarle — l'esecutore resta
       accreditato, le visualizzazioni gli arrivano, e la scuola non
       ospita niente che non sia suo.

       ⚠ `da` e `a` DELIMITANO L'ESTRATTO, e i tempi della mappa sono
       **relativi a `da`**, non assoluti nel video. Così i numeri si
       leggono («la b. 29 comincia a 4,2 secondi dall'inizio») e la
       finestra si può spostare di mezzo secondo senza rifare la mappa.

       ⚠ E LA MAPPA VA MISURATA, NON CALCOLATA. Un'esecuzione vera ha il
       rubato: dividere la durata per il numero di battute dà una mappa
       che parte allineata e finisce mezza battuta più in là. Per
       misurarla c'è il modo taratura — `?taratura` nell'indirizzo — che
       registra un battito a ogni barra spaziatrice e stampa la stringa
       da incollare qui.
       ---------------------------------------------------------- */
    orologioYouTube() {
      const id = this.getAttribute('youtube');
      const da = parseFloat(this.getAttribute('da') || '0') || 0;
      const a = parseFloat(this.getAttribute('a') || '0') || 0;

      const cassa = document.createElement('div');
      cassa.className = 'tac-tubo no-stampa';
      const dove = document.createElement('div');
      dove.id = 'tubo-' + Math.random().toString(36).slice(2, 9);
      cassa.appendChild(dove);
      /* ⚠ CHI SUONA VA SCRITTO. Un'esecuzione è di qualcuno: mettere il
         video senza il nome sarebbe prendere il lavoro e lasciare fuori
         la persona. E in classe serve — «sentite come lo fa Suzuki» è
         una frase che si può dire solo se il nome c'è. */
      const chi = this.getAttribute('esecutore');
      if (chi) {
        const e = document.createElement('p');
        e.className = 'tac-tubo-chi';
        e.textContent = chi;
        cassa.appendChild(e);
      }
      this._box.appendChild(cassa);

      /* L'oggetto che il resto del codice crede un <audio>. I gestori
         sono proprietà assegnabili come su un elemento vero, e li chiama
         questo adattatore quando il player cambia stato. */
      const orol = {
        currentTime: 0,
        duration: a > da ? a - da : 0,
        paused: true,
        onplay: null, onpause: null, onended: null, ontimeupdate: null,
        play() {
          if (!orol._p || !orol._p.playVideo) return;
          orol._p.seekTo(da + orol.currentTime, true);
          orol._p.playVideo();
        },
        pause() { if (orol._p && orol._p.pauseVideo) orol._p.pauseVideo(); },
      };
      /* `currentTime` in scrittura serve alla barra di scorrimento: sul
         player si traduce in un salto. */
      Object.defineProperty(orol, 'currentTime', {
        get() { return orol._t || 0; },
        set(v) {
          orol._t = v;
          if (orol._p && orol._p.seekTo) orol._p.seekTo(da + v, true);
          if (orol.ontimeupdate) orol.ontimeupdate();
        },
      });

      /* L'orologio del player non emette eventi: si guarda a ogni
         fotogramma, come fa già `segui()` per la registrazione incisa.
         Qui però serve anche mentre il video va, perché è da qui che
         arrivano `paused` e la fine dell'estratto. */
      const guarda = () => {
        if (orol._p && orol._p.getCurrentTime) {
          orol._t = Math.max(0, orol._p.getCurrentTime() - da);
          /* ⚠ L'ESTRATTO FINISCE DOVE DICE `a`, NON DOVE FINISCE IL VIDEO.
             Senza questo controllo il brano continuava dentro il movimento
             successivo, e in classe nessuno se ne accorgeva subito — che è
             il modo peggiore di sbagliare un ascolto. */
          if (a > da && orol._t >= (a - da)) {
            orol.pause();
            orol.paused = true;
            if (orol.onended) orol.onended();
            return;
          }
          if (orol.ontimeupdate) orol.ontimeupdate();
        }
        orol._occhio = requestAnimationFrame(guarda);
      };

      const monta = () => {
        orol._p = new window.YT.Player(dove.id, {
          videoId: id,
          playerVars: { start: Math.floor(da), rel: 0, modestbranding: 1,
                        playsinline: 1 },
          events: {
            onReady: () => { orol._occhio = requestAnimationFrame(guarda); },
            onStateChange: (ev) => {
              const S = window.YT.PlayerState;
              if (ev.data === S.PLAYING) {
                orol.paused = false;
                if (orol.onplay) orol.onplay();
              } else if (ev.data === S.PAUSED) {
                orol.paused = true;
                if (orol.onpause) orol.onpause();
              } else if (ev.data === S.ENDED) {
                orol.paused = true;
                if (orol.onended) orol.onended();
              }
            },
          },
        });
      };

      /* L'API si carica una volta per pagina, non una per brano: sette
         ascolti in una lezione sono sette elementi ma un solo script. */
      if (window.YT && window.YT.Player) monta();
      else {
        (window.__tacTubo = window.__tacTubo || []).push(monta);
        if (!document.getElementById('tac-yt-api')) {
          const s = document.createElement('script');
          s.id = 'tac-yt-api';
          s.src = 'https://www.youtube.com/iframe_api';
          document.head.appendChild(s);
          window.onYouTubeIframeAPIReady = () => {
            (window.__tacTubo || []).forEach(f => f());
            window.__tacTubo = [];
          };
        }
      }
      return orol;
    }

    preparaInciso(barra, sorgente) {
      const url = this.getAttribute('inciso');
      /* Due mappe possibili, e sono di due orologi diversi: `mappa` è
         quella dell'incisione, `mappa-video` quella tarata a orecchio
         sull'esecuzione. Quando c'è la seconda comanda lei, perché
         allora la sorgente è il video. */
      let mappa = null;
      const quale = sorgente && this.getAttribute('mappa-video')
                    ? 'mappa-video' : 'mappa';
      try { mappa = JSON.parse(this.getAttribute(quale) || 'null'); } catch (e) {}

      /* ⚠ `sorgente` È ARRIVATA IL 31 AGOSTO 2026, E NON HA CAMBIATO NIENTE
         DI QUELLO CHE C'ERA.

         Serviva far scorrere la partitura sotto **un'esecuzione vera**
         invece che sotto l'incisione di MuseScore. La strada corta era
         scrivere una seconda funzione, gemella di questa, con dentro il
         player di YouTube: due copie dello stesso inseguimento, e fra un
         mese una delle due riparata e l'altra no.

         Invece il player si presenta con la faccia di un `<audio>` —
         `currentTime`, `duration`, `paused`, `play()`, `pause()`, i tre
         gestori — e questa funzione non sa e non deve sapere che dietro
         c'è un video. Tutto quello che segue, dal cursore ai pallini
         della pulsazione, funziona identico sulle due sorgenti perché è
         scritto una volta sola. */
      const au = sorgente || (() => {
        const a = document.createElement('audio');
        a.preload = 'none'; a.src = url;
        return a;
      })();
      this._audio = au;

      const b = document.createElement('button');
      b.className = 'btn tac-play';
      b.innerHTML = '&#9654; Ascolta';
      b.title = 'Registrazione incisa, non serve la rete';
      /* L'esecuzione dal vivo esce di scena dove c'è la registrazione.
         Va tolta dal documento, non nascosta con l'attributo hidden: i
         pulsanti hanno un display esplicito nel foglio di stile, e un
         display esplicito batte hidden. Restava lì, visibile, e in classe
         si vedevano due pulsanti Ascolta uguali. L'oggetto continua a
         esistere perché il resto del codice lo interroga. */
      this._play.remove();
      barra.appendChild(b);

      const riga = document.createElement('div');
      riga.className = 'tac-riga-tempo no-stampa';
      riga.innerHTML = '<input type="range" class="tac-scorri" min="0" max="1000" value="0" ' +
                       'aria-label="Punto del brano"><span class="tac-orologio">0:00</span>';
      this._scorri = riga.querySelector('.tac-scorri');
      this._orologio = riga.querySelector('.tac-orologio');

      const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
      const fermaAltro = () => { if (this._suona) this.ferma(); };

      b.onclick = () => {
        if (!au.paused) { au.pause(); return; }
        fermaAltro();
        /* play() restituisce una promessa nei browser, ma non ovunque:
           nell'ambiente di prova torna undefined e il .catch faceva
           fallire dodici verifiche su sessantanove. */
        const av = au.play();
        if (av && av.catch) av.catch(() => {});
      };
      /* Seguire la registrazione: dove siamo, quale battuta, che pulsazione.

         Perché non basta `ontimeupdate`, che sarebbe la scelta ovvia. Il
         browser lo chiama quando vuole, in pratica quattro volte al
         secondo. Per l'orologio e il cursore della barra va benissimo; per
         il metronomo no. Misurato sul sito, i pallini scattavano a 0,20 ·
         0,48 · 0,74 · 1,27 — passi da 0,26 a 0,53 secondi su una
         pulsazione che ne dura 0,45: il pallino poteva arrivare mezzo
         battito tardi, e a occhio si legge come un metronomo che va per
         conto suo. In una lezione sul battito è il difetto peggiore
         possibile, perché insegna la cosa sbagliata.

         Il tempo lo dà sempre `currentTime` — è l'unico orologio che non
         va alla deriva rispetto al suono. A cambiare è solo quante volte
         lo si guarda: `requestAnimationFrame` lo interroga a ogni
         fotogramma, cioè ogni 16 millesimi, e il fotogramma è anche il
         momento giusto per disegnare. */
      const segui = () => {
        const ms = au.currentTime * 1000;
        if (au.duration) this._scorri.value = Math.round(ms / (au.duration * 10));
        this._orologio.textContent = mmss(au.currentTime);
        if (!mappa || !mappa.eventi.length) return;
        const e = mappa.eventi;
        let i = 0;
        while (i + 1 < e.length && e[i + 1][1] <= ms) i++;
        if (i !== this._ultimaBattuta) { this.illumina(e[i][0]); this._ultimaBattuta = i; }
        const ini = e[i][1];
        const fin = (i + 1 < e.length) ? e[i + 1][1] : (mappa.durata || ms + 1);
        const quota = fin > ini ? (ms - ini) / (fin - ini) : 0;
        this.cursore(e[i][0], quota);
        this.battePulsazione(e[i][0], quota);
      };
      const passo = () => {
        if (au.paused || au.ended) { this._fotogramma = null; return; }
        segui();
        this._fotogramma = requestAnimationFrame(passo);
      };
      const fermaFotogrammi = () => {
        if (this._fotogramma) cancelAnimationFrame(this._fotogramma);
        this._fotogramma = null;
      };

      au.onplay  = () => {
        b.innerHTML = '&#9632; Ferma';
        this._box.classList.add('in-ascolto');
        fermaFotogrammi();
        this._fotogramma = requestAnimationFrame(passo);
      };
      au.onpause = () => {
        b.innerHTML = '&#9654; Ascolta';
        fermaFotogrammi();
        this.spegniPulsazioni();
      };
      au.onended = () => {
        b.innerHTML = '&#9654; Ascolta';
        this._box.classList.remove('in-ascolto');
        fermaFotogrammi();
        this.illumina(-1); this.cursore(null); this.spegniPulsazioni();
      };
      /* Resta appeso anche a `timeupdate`: serve da fermi, quando si
         trascina la barra e i fotogrammi non girano. */
      au.ontimeupdate = () => { if (au.paused) segui(); };
      this._scorri.oninput = () => {
        if (au.duration) au.currentTime = au.duration * this._scorri.value / 1000;
      };

      this._box.appendChild(riga);
      this.preparaTaratura(au, barra);
    }

    /* ----------------------------------------------------------
       LA TARATURA — IL RIGHELLO PER MISURARE LA MAPPA

       ⚠ QUESTO ESISTE PERCHÉ LA MAPPA NON SI PUÒ CALCOLARE.

       L'incisione di MuseScore la mappa ce l'ha già: la scrive lo stesso
       programma che suona. Un'esecuzione vera no — e non si può ricavare
       dividendo la durata per il numero di battute, perché un esecutore
       fa il rubato: una mappa calcolata parte allineata e finisce mezza
       battuta più in là, che è il modo più fastidioso di sbagliare
       perché all'inizio sembra giusta.

       Quindi si misura, e si misura ascoltando: si preme la barra
       spaziatrice a ogni stanghetta e questo registra l'orologio. Alla
       fine stampa la stringa da incollare nell'attributo `mappa`.

       È lo stesso principio di `pagine.py` per i libri — misurare invece
       di dedurre, ed è l'errore 66 — applicato al tempo invece che alle
       pagine.

       ⚠ NON SI VEDE IN CLASSE. Compare solo con `?taratura` nell'indirizzo:
       è uno strumento del docente, e un pulsante in più su una slide è
       un pulsante che qualcuno preme durante l'ascolto.
       ---------------------------------------------------------- */
    preparaTaratura(au, barra) {
      let acceso = false;
      try { acceso = /[?&]taratura\b/.test(location.search); } catch (e) {}
      if (!acceso) return;

      const b = document.createElement('button');
      b.className = 'btn secondario';
      b.textContent = 'Taratura';
      barra.appendChild(b);

      const cassa = document.createElement('div');
      cassa.className = 'tac-taratura no-stampa';
      cassa.hidden = true;
      cassa.innerHTML =
        '<p><strong>Barra spaziatrice</strong> a ogni stanghetta, mentre ' +
        'suona. <strong>Esc</strong> per chiudere.</p>' +
        '<p class="tac-tara-conto">0 battute segnate</p>' +
        '<textarea class="tac-tara-uscita" rows="3" readonly ' +
        'aria-label="La mappa da incollare"></textarea>';
      this._box.appendChild(cassa);
      const conto = cassa.querySelector('.tac-tara-conto');
      const uscita = cassa.querySelector('.tac-tara-uscita');

      let colpi = [];
      const stampa = () => {
        conto.textContent = colpi.length + ' battute segnate';
        /* `eventi` è [indice della battuta nella partitura, millisecondi].
           L'indice parte da 0 e cresce di uno: la mappa dice quando
           comincia ciascuna, non quale numero porta — quello lo dice
           `da-battuta`, e sono due cose diverse apposta. */
        uscita.value = JSON.stringify({
          eventi: colpi.map((ms, i) => [i, Math.round(ms)]),
          durata: Math.round(au.duration * 1000) || null,
        });
      };
      stampa();

      const tasto = (e) => {
        if (cassa.hidden) return;
        if (e.key === 'Escape') { chiudi(); return; }
        if (e.code !== 'Space' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        colpi.push(au.currentTime * 1000);
        stampa();
      };
      const chiudi = () => {
        cassa.hidden = true;
        b.classList.remove('ambra');
        document.removeEventListener('keydown', tasto, true);
      };
      b.onclick = () => {
        if (!cassa.hidden) { chiudi(); return; }
        colpi = [];
        stampa();
        cassa.hidden = false;
        b.classList.add('ambra');
        /* In cattura, perché la barra spaziatrice sulla slide fa altro:
           qui deve arrivare prima, e solo mentre la taratura è aperta. */
        document.addEventListener('keydown', tasto, true);
      };
    }

    /* I pallini della pulsazione sotto il titolo, mossi dalla registrazione
       incisa.

       Perché serve una funzione a parte. L'esecuzione sintetizzata accende
       i pallini da sé, perché conosce ogni battito: li programma tutti
       sull'orologio dell'audio. La registrazione no — di lei sappiamo solo
       dove cominciano le battute, dalla mappa di MuseScore — e quando ogni
       brano della lezione ha ricevuto la sua incisione i pallini sono
       rimasti accesi da nessuno. Restavano lì spenti mentre la musica
       andava, cioè esattamente il contrario di quello che devono fare:
       sono la prima cosa che l'occhio cerca quando il brano parte.

       Dentro la battuta si interpola: la mappa dà l'inizio, `quota` dice
       quanto se n'è consumato, e le pulsazioni sono equidistanti. Non è il
       battito misurato sull'esecuzione, è il battito scritto sulla
       partitura — che è quello che la slide vuole mostrare.

       Il levare è il caso da non sbagliare. La prima battuta di un brano
       in anacrusi non è piena: dura solo la coda. Spalmarci sopra tutte le
       pulsazioni della battuta accenderebbe il primo pallino — l'accento
       forte — proprio sulla nota che forte non è, ed è l'errore peggiore
       possibile in una lezione sul metro. Le pulsazioni del levare si
       contano quindi a ritroso dalla stanghetta. */
    battePulsazione(k, quota) {
      if (!this._puls || !this._puls.children.length) return;
      const d = this._dati || {};
      const n = this._puls.children.length;
      const quartiPerPuls = (d.metro === '6/8' || d.metro === '9/8') ? 1.5 : 1;
      const anac = parseFloat(d.anacrusi || 0) || 0;

      let j;
      if (k === 0 && anac > 0) {
        /* quante pulsazioni stanno nel levare, e da quale si comincia */
        const q = Math.min(n, Math.max(1, Math.ceil(anac / quartiPerPuls - 1e-9)));
        j = n - q + Math.floor((quota || 0) * q);
      } else {
        j = Math.floor((quota || 0) * n);
      }
      j = Math.min(n - 1, Math.max(0, j));
      if (j === this._ultimaPuls) return;      /* solo quando cambia davvero */
      this._ultimaPuls = j;
      [...this._puls.children].forEach((p, i) => p.classList.toggle('on', i === j));
    }

    spegniPulsazioni() {
      this._ultimaPuls = null;
      if (this._puls) [...this._puls.children].forEach(p => p.classList.remove('on'));
    }

    /* La linea verticale che attraversa la battuta mentre suona. Quota è
       quanto si è consumato della battuta, da 0 a 1. */
    cursore(k, quota) {
      const m = this.misure();
      /* Il contenitore è quello che scorre, non l'SVG: dentro la partitura
         Verovio annida più <svg> uno nell'altro, e appendere lì la linea
         significa cercarla poi in un posto diverso da dove sta. Al primo
         tentativo ne nasceva una nuova a ogni battuta e nessuna si
         spostava. Si usano gli stessi due contenitori che l'illuminazione
         usa già per scorrere. */
      const dentro = (k !== null && k >= 0 && m[k])
        ? m[k].closest('.tac-schermo-corpo, .tac-brano-part') : null;
      if (!dentro) {
        document.querySelectorAll('.tac-cursore').forEach(x => { x.style.display = 'none'; });
        return;
      }
      let l = dentro.querySelector(':scope > .tac-cursore');
      if (!l) {
        l = document.createElement('div');
        l.className = 'tac-cursore no-stampa';
        dentro.appendChild(l);
      }
      const cont = dentro.getBoundingClientRect();
      const r = m[k].getBoundingClientRect();
      l.style.display = 'block';
      l.style.left = (r.left - cont.left + dentro.scrollLeft + r.width * (quota || 0)) + 'px';
      l.style.top = (r.top - cont.top + dentro.scrollTop) + 'px';
      l.style.height = r.height + 'px';
    }

    /* Le battute visibili nella partitura attualmente mostrata */
    misure() {
      const f = (this._parti || []).find(x => !x.hidden);
      return f ? [...f.querySelectorAll('.measure')] : [];
    }

    /* Quale segno copre la battuta all'indice `k`, e come si dice.

       ⚠ SI PRENDE L'ULTIMO CHE COMINCIA, NON IL PRIMO CHE COPRE.
       Due segni possono sovrapporsi — «b29-b31=pedale di tonica» e
       «b30=e qui la voce alta continua da sola» — e in quella battuta
       vanno bene tutti e due. Ma la striscia ne mostra uno solo, e deve
       essere quello **appena entrato**: è la cosa nuova, ed è quella di
       cui si sta parlando. Il pedale lo si è già annunciato alla 29.
       Prendere il primo mostrerebbe per tre battute la stessa frase e
       farebbe sparire la seconda, che è quella che si voleva dire. */
    segnoDi(k) {
      if (!this._segni || !this._segni.length || k < 0) return -1;
      const b = k + (this._daBattuta || 1);
      let scelto = -1, inizio = -Infinity;
      this._segni.forEach((s, i) => {
        if (!s.da || s.da.tipo !== 'b') return;
        const d = s.da.numero;
        const a = (s.a && s.a.tipo === 'b') ? s.a.numero : d;
        if (b >= d && b <= a && d >= inizio) { scelto = i; inizio = d; }
      });
      return scelto;
    }

    diciSegno(i) {
      if (!this._strisciaSegno) return;
      const s = i >= 0 ? this._segni[i] : null;
      this._strisciaSegno.textContent = s ? s.testo : '';
      this._strisciaSegno.classList.toggle('vuota', !s || !s.testo);
    }

    illumina(k) {
      const m = this.misure();
      if (!m.length) return;
      m.forEach(x => x.classList.remove('suona'));

      /* La fascia del segno resta accesa su tutte le sue battute, anche
         su quelle che la musica ha già passato: un pedale che dura tre
         battute si capisce vedendole tutte e tre insieme, non una per
         volta. Il cursore dice dove siamo, la fascia dice quanto dura. */
      if (this._segni && this._segni.length) {
        const i = this.segnoDi(k);
        if (i !== this._segnoAcceso) {
          m.forEach(x => x.classList.remove('in-segno'));
          if (i >= 0) {
            const s = this._segni[i];
            const d = s.da.numero - (this._daBattuta || 1);
            const a = ((s.a && s.a.tipo === 'b') ? s.a.numero : s.da.numero)
                      - (this._daBattuta || 1);
            for (let j = d; j <= a; j++) if (m[j]) m[j].classList.add('in-segno');
          }
          this.diciSegno(i);
          this._segnoAcceso = i;
        }
      }

      if (k < 0 || !m[k]) return;
      m[k].classList.add('suona');

      /* Il riquadro che scorre è diverso a seconda di dove ci troviamo: sulla
         slide è il contenitore della partitura, a pagina piena è il corpo
         dell'overlay. Cercarlo qui invece di darlo per scontato evita che
         l'inseguimento della battuta smetta di funzionare proprio dove
         serve di più. Ora che la partitura è spezzata in sistemi lo
         scorrimento è soprattutto verticale, non più orizzontale. */
      const c = m[k].closest('.tac-schermo-corpo, .tac-brano-part');
      if (!c) return;
      const r = m[k].getBoundingClientRect(), rc = c.getBoundingClientRect();
      if (c.scrollHeight > c.clientHeight + 2 &&
          (r.bottom > rc.bottom - 8 || r.top < rc.top + 8))
        c.scrollTop += r.top - rc.top - rc.height / 3;
      if (c.scrollWidth > c.clientWidth + 2 &&
          (r.right > rc.right || r.left < rc.left))
        c.scrollLeft += r.left - rc.left - rc.width / 3;
    }

    ferma() {
      if (typeof Tone !== 'undefined' && Tone.Transport) {
        Tone.Transport.stop();
        Tone.Transport.cancel();      /* toglie dalla coda tutto il resto */
        if (Tone.Draw && Tone.Draw.cancel) Tone.Draw.cancel();
      }
      this.misure().forEach(x => x.classList.remove('suona'));
      (this._id || []).forEach(clearTimeout);
      this._id = [];
      Audio.zittisci();
      this.spegniPulsazioni();
      this._suona = false;
      if (this._play) this._play.innerHTML = '&#9654; Ascolta';
    }
  }
  customElements.define('tac-brano', TacBrano);

  /* Un ascoltatore solo per tutti i brani della pagina, non uno per
     elemento: con sette ascolti per lezione sarebbero sette ascoltatori che
     fanno la stessa cosa. Non è in cattura, quindi la partitura a schermo
     intero — che il suo Esc lo intercetta prima — continua a vincere. */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    let fatto = false;
    document.querySelectorAll('tac-brano').forEach(b => {
      if (b.esci && b.esci()) fatto = true;
    });
    if (fatto) e.stopPropagation();
  });

  /* ==========================================================
     9-bis. CORREZIONI AL VOLO
     ----------------------------------------------------------
     Il sito è statico: non c'è nessun server a cui mandare un testo
     riscritto. Le correzioni restano quindi nel browser di chi le fa,
     e servono a quello per cui nascono davvero: accorgersi di una frase
     storta cinque minuti prima di entrare in classe e sistemarla senza
     dover ricostruire e ripubblicare la lezione. Gli studenti continuano
     a vedere il testo pubblicato.

     Il punto delicato è agganciare una correzione al pezzo giusto di
     pagina. La posizione da sola non basta: se un giorno la lezione viene
     rifatta e una frase si sposta, la correzione finirebbe addosso a
     un'altra. Perciò accanto al testo nuovo si conserva anche quello
     vecchio, e al caricamento la correzione si applica solo se il testo
     di partenza è ancora quello. Se non lo è, la si lascia perdere: meglio
     perdere una correzione che sporcare una frase estranea.
     ========================================================== */

  const Correzioni = TAC.correzioni = {
    CHIAVE: 'tac-correzioni:' + location.pathname,
    /* Si correggono i testi scritti a mano. Fuori restano quelli generati
       dai componenti, che a ogni ridisegno tornerebbero come prima. */
    SCELTA: 'h1, h2, h3, p, li, figcaption, cite, .etichetta',
    dati: {},
    acceso: false,

    leggi() {
      try { this.dati = JSON.parse(localStorage.getItem(this.CHIAVE) || '{}'); }
      catch (e) { this.dati = {}; }
      return this.dati;
    },
    scrivi() {
      try { localStorage.setItem(this.CHIAVE, JSON.stringify(this.dati)); }
      catch (e) { /* spazio esaurito o navigazione privata: pazienza */ }
    },

    /* Tutti i testi correggibili, nell'ordine in cui stanno nella pagina.
       L'indice in questo elenco è la chiave della correzione. */
    elementi() {
      const COMP = 'tac-stave, tac-brano, tac-quiz, tac-drag, tac-ear, ' +
                   'tac-rhythm, tac-metro, tac-griglia, tac-piano';
      const dentroUnComponente = e => !!e.closest(COMP + ', .tac-barra, #tac-nav, #tac-indice');
      const contieneUnComponente = e => !!e.querySelector(COMP);
      const sel = '.slide ' + this.SCELTA.split(', ').join(', .slide ');
      return Array.prototype.filter.call(document.querySelectorAll(sel),
        e => !dentroUnComponente(e) && !contieneUnComponente(e));
    },

    applica() {
      const d = this.leggi();
      if (!Object.keys(d).length) return;
      const el = this.elementi();
      let messe = 0, saltate = 0;
      Object.keys(d).forEach(k => {
        const e = el[+k], c = d[k];
        if (!e) { saltate++; return; }
        if (e.innerHTML.trim() !== c.prima) { saltate++; return; }
        e.innerHTML = c.dopo;
        e.classList.add('corretto');
        messe++;
      });
      if (saltate) console.info('TAC: %d correzioni applicate, %d scartate ' +
        'perché il testo di partenza è cambiato.', messe, saltate);
    },

    commuta() {
      this.acceso = !this.acceso;
      document.body.classList.toggle('in-correzione', this.acceso);
      const el = this.elementi();
      el.forEach((e, k) => {
        if (!this.acceso) { e.removeAttribute('contenteditable'); return; }
        e.setAttribute('contenteditable', 'true');
        e.spellcheck = true;
        if (e.dataset.corrIniz === undefined) e.dataset.corrIniz = e.innerHTML.trim();
        e.dataset.corrK = k;
        e.addEventListener('blur', this._chiudi);
      });
      return this.acceso;
    },

    _chiudi(ev) {
      const e = ev.currentTarget, k = e.dataset.corrK;
      const ora = e.innerHTML.trim(), prima = e.dataset.corrIniz;
      const d = Correzioni.leggi();
      if (ora === prima) { delete d[k]; e.classList.remove('corretto'); }
      else {
        /* «prima» è il testo pubblicato, non l'ultimo corretto: serve a
           riconoscere la frase la prossima volta che si apre la pagina. */
        d[k] = { prima: (d[k] && d[k].prima) || prima, dopo: ora };
        e.classList.add('corretto');
      }
      Correzioni.dati = d; Correzioni.scrivi();
    },

    scorda() {
      const n = Object.keys(this.leggi()).length;
      if (!n) { alert('Non ci sono correzioni su questo computer.'); return; }
      if (!confirm('Butto via ' + n + (n === 1 ? ' correzione' : ' correzioni') +
                   ' e rimetto i testi come stanno nella lezione pubblicata?')) return;
      localStorage.removeItem(this.CHIAVE);
      this.dati = {};
      location.reload();
    }
  };

  /* ==========================================================
     10. NAVIGAZIONE DELLE SLIDE
     ========================================================== */

  const Deck = TAC.deck = {
    slides: [],
    i: 0,

    init() {
      if (this._avviato) return;
      const deck = document.getElementById('tac-deck');
      if (!deck) return;
      this.slides = [...deck.querySelectorAll('.slide')];
      if (!this.slides.length) return;
      this._avviato = true;

      if (TAC.audio && TAC.audio.sblocca) TAC.audio.sblocca();

      this.etichettaAree();
      this.costruisciNav();
      Correzioni.applica();

      const av = document.createElement('div');
      av.id = 'tac-densita'; av.className = 'no-stampa';
      document.body.appendChild(av);

      window.addEventListener('resize', () => this.adatta(true));
      if (typeof ResizeObserver === 'function') {
        this._ro = new ResizeObserver(() => this.adatta(true));
        this.slides.forEach(sl => {
          const d = sl.querySelector('.slide-interna');
          if (d) this._ro.observe(d);
        });
      }
      document.addEventListener('tac-strumento', () => this.aggiornaStrumento());
      this.costruisciIndice();

      const salvata = parseInt(location.hash.replace('#s', ''), 10);
      this.vai(isNaN(salvata) ? 0 : salvata);

      document.addEventListener('keydown', e => {
        if (document.body.classList.contains('modalita-studio')) return;
        if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); this.avanti(); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.indietro(); }
        else if (e.key === 'Home') this.vai(0);
        else if (e.key === 'End') this.vai(this.slides.length - 1);
        else if (e.key === 'r' || e.key === 'R') document.body.classList.toggle('regia');
        else if (e.key === 'Escape') document.getElementById('tac-indice').classList.remove('aperto');
      });
    },

    /* La tendina per andare a un'altra lezione o a un'altra unità.

       Da una lezione si poteva solo uscire — «Classe», «Corso» — e poi
       rientrare da un'altra parte. Per passare dalla lezione 1 alla 2
       servivano tre clic e due caricamenti di pagina, e in aula, con la
       classe che aspetta, sono venti secondi di silenzio.

       Una tendina sola con dentro tutto, non due in fila. Con due — prima
       l'unità, poi la lezione — servono due gesti e la seconda dipende
       dalla prima; con una sola si vede in un colpo dove si è e dove si
       può andare. Undici unità e sei lezioni stanno in un elenco che si
       scorre.

       L'elenco viene da `_indice.json`, incorporato da monta.py in fondo
       alla pagina: vedi lì il perché di un file unico invece che una copia
       per lezione.

       Le lezioni non ancora scritte **restano nell'elenco**, in grigio e
       non cliccabili. Toglierle farebbe credere che il corso sia più corto
       di quello che è, e in prima lezione la classe ha diritto di vedere
       dove si sta andando.

       ── LE CINQUE CLASSI, 17 agosto ────────────────────────────────
       Questo codice era stato scritto quando l'indice conteneva una
       classe sola, e quando gliene sono arrivate cinque ha continuato a
       girare senza protestare, producendo due difetti insieme.

       Il primo si vedeva: cinquantacinque intestazioni «Unità N · titolo»
       di fila, senza mai dire di quale classe fossero. Undici «Unità 1»
       diverse, e nessun modo di capire quale.

       Il secondo no, ed era peggio. La via si calcolava così:

           (u.n === qui.unita) ? l.file : '../' + u.via + '/' + l.file

       cioè confrontando **solo il numero d'unità**, come se la classe non
       esistesse. Dalla lezione 3 della seconda, la voce «Unità 1 · Il
       battito della musica, lezione 1» — che è della *prima* — dava
       `lezione-1.html`, cioè la lezione 1 della **seconda**. Il
       collegamento funzionava, la pagina si apriva, e portava altrove.
       Un link rotto lo trova `_collegamenti.py`; un link che funziona e
       va nel posto sbagliato non lo trova niente, perché il file di
       destinazione esiste davvero.

       Adesso ogni classe è una barra che si apre e si chiude: quella in
       cui si è nasce aperta, le altre chiuse. Andrea, 17 agosto: «per
       andare alle lezioni della quinta devo scorrere fino in fondo». */
    /* I due collegamenti fissi della barra: il workbook dell'unità
       aperta e il quaderno di lettura della classe.

       Non tutti e undici i workbook: **quello di questa unità**. Un
       elenco da scegliere in mezzo alla lezione è un elenco che non si
       apre — e gli altri restano raggiungibili dalla tendina «Vai a». */
    materiali(nav) {
      const posto = nav.querySelector('#tac-materiali');
      const dati = document.getElementById('tac-indice-corso');
      if (!posto || !dati) return;
      let ind;
      try { ind = JSON.parse(dati.textContent); } catch (e) { return; }
      const qui = ind.qui || {};
      const cl = (ind.classi || []).find(c => c.n === qui.classe);
      if (!cl) return;
      const mat = cl.materiali || [];

      const wb = mat.find(m => m.unita === qui.unita);
      const let_ = mat.find(m => /^solfeggi-/.test(m.file));
      let h = '';
      if (wb) h += '<a class="uscita materiale" href="../materiali/' + wb.file +
                   '" title="' + wb.titolo + ': i compiti di questa unità">Workbook</a>';
      if (let_) h += '<a class="uscita materiale" href="../materiali/' + let_.file +
                     '" title="' + let_.titolo + ': i pezzi di lettura dell\'anno">Letture</a>';
      posto.innerHTML = h;
    },

    costruisciTendina(nav) {
      const cont = nav.querySelector('#tac-vai');
      const menu = cont && cont.querySelector('.tac-tendina-menu');
      const dati = document.getElementById('tac-indice-corso');
      if (!cont || !menu || !dati) { if (cont) cont.remove(); return; }

      let ind;
      try { ind = JSON.parse(dati.textContent); }
      catch (e) { cont.remove(); return; }

      const qui = ind.qui || {};

      /* Il percorso da QUI a una pagina di un'altra unità o classe.

         La pagina aperta sta in `classe-X/<unità corrente>/lezione-N.html`,
         quindi due cartelle sotto la radice del sito, e da lì:

           stessa classe, stessa unità  →  nome
           stessa classe, altra unità   →  ../<via unità>/nome
           altra classe                 →  ../../<via classe>/<via unità>/nome

         Prima questa scelta guardava solo il numero d'unità. Il numero
         d'unità da solo non identifica niente: di «unità 1» ce ne sono
         cinque, una per classe. */
      const via = (cl, sotto, nome) => {
        const stessaClasse = cl.n === qui.classe;
        if (stessaClasse && sotto === null) return nome;   // stessa cartella
        if (stessaClasse) return '../' + sotto + '/' + nome;
        return '../../' + (cl.via || ('classe-' + cl.n)) + '/' + sotto + '/' + nome;
      };

      /* ══ DUE FILE DI PASTIGLIE, E POI LE LEZIONI ══

         Andrea, 21 agosto: «il menu "vai a" risulta ancora poco
         fruibile, lo spostamento fra le classi e fra le unità deve
         essere più agevole».

         Prima era **un elenco solo**: le classi si aprivano e si
         chiudevano, ma dentro una classe c'erano tutte le unità con
         tutte le loro lezioni. Aprire la prima voleva dire novanta righe
         di lezione da scorrere per arrivare all'unità 11.

         Adesso sono **tre pezzi sovrapposti**:

           riga 1   le cinque classi, cinque pastiglie
           riga 2   le unità della classe scelta, una pastiglia per unità
           corpo    le lezioni della sola unità scelta

         Cioè: due clic per arrivare ovunque, e **niente da scorrere** —
         perché quello che si vede alla volta è una unità sola, che è al
         massimo dodici righe.

         Le pastiglie dei numeri sono piccole apposta: in classe si
         cerca «l'unità 7», non il suo titolo. Il titolo compare sotto,
         quando l'unità è scelta. */
      const CL = ind.classi || [];
      let scelta = { classe: qui.classe, unita: qui.unita };

      const trovaCl = n => CL.find(c => c.n === n) || CL[0];
      const trovaU = (cl, n) => (cl.unita || []).find(u => u.n === n)
                             || (cl.unita || [])[0];

      const pronteDi = cl => (cl.unita || []).reduce(
        (n, u) => n + (u.lezioni || []).filter(l => l.stato === 'pronta').length, 0);

      const disegna = () => {
        const cl = trovaCl(scelta.classe);
        const u  = trovaU(cl, scelta.unita);
        let h = '';

        /* riga 1 · le classi */
        h += '<div class="tac-pastiglie classi">';
        CL.forEach(c => {
          const n = pronteDi(c);
          h += '<button type="button" class="tac-pil' +
               (c.n === scelta.classe ? ' scelta' : '') +
               (c.n === qui.classe ? ' qui' : '') +
               (n ? '' : ' vuota') + '" data-cl="' + c.n + '"' +
               ' title="Classe ' + c.n + '\u00aa \u00b7 ' + (c.titolo || '') +
               ' \u00b7 ' + (n ? n + ' lezioni' : 'in preparazione') + '">' +
               c.n + '\u00aa</button>';
        });
        h += '</div>';

        /* riga 2 · le unità della classe scelta */
        h += '<div class="tac-pastiglie unita">';
        (cl.unita || []).forEach(x => {
          const n = (x.lezioni || []).filter(l => l.stato === 'pronta').length;
          h += '<button type="button" class="tac-pil' +
               (u && x.n === u.n ? ' scelta' : '') +
               (cl.n === qui.classe && x.n === qui.unita ? ' qui' : '') +
               (n ? '' : ' vuota') + '" data-u="' + x.n + '"' +
               ' title="Unit\u00e0 ' + x.n + ' \u00b7 ' + (x.titolo || '') + '">' +
               x.n + '</button>';
        });
        h += '</div>';

        /* corpo · le lezioni della sola unità scelta.

           Sta dentro un contenitore suo, ed è quello che scorre. Il
           pannello ha altezza fissa: se cambiasse con il numero di
           lezioni, le pastiglie in cima si sposterebbero a ogni clic —
           il pannello è ancorato in basso e cresce verso l'alto. Andrea,
           21 agosto: «si ridimensiona quando clicchi un pulsante e ti
           ritrovi a rincorrere i pulsanti». */
        if (!u) { menu.innerHTML = h + '<div class="tac-elenco"></div>'; return; }
        h += '<div class="tac-elenco">';
        const viaU = u.via || ('uda-' + String(u.n).padStart(2, '0'));
        const suUnita = cl.n === qui.classe && u.n === qui.unita;

        h += '<div class="tac-tendina-testa' + (suUnita ? ' qui' : '') + '">' +
             'Classe ' + cl.n + '\u00aa \u00b7 unit\u00e0 ' + u.n + ' \u00b7 ' + u.titolo +
             (u.quando ? '<span class="quando">' + u.quando + '</span>' : '') +
             '</div>';

        const lez = u.lezioni || [];
        if (!lez.length) {
          h += '<div class="tac-voce vuota">' + (u.stato || 'da preparare') + '</div>';
        }
        lez.forEach(l => {
          const corrente = suUnita && l.n === qui.lezione;
          const dove = via(cl, suUnita ? null : viaU, l.file);
          if (corrente)
            h += '<div class="tac-voce corrente" aria-current="page">' +
                 '<b>' + l.n + '.</b> ' + l.titolo + '<span class="segno">sei qui</span></div>';
          else if (l.stato === 'pronta')
            h += '<a class="tac-voce" href="' + dove + '">' +
                 '<b>' + l.n + '.</b> ' + l.titolo + '</a>';
          else
            h += '<div class="tac-voce vuota"><b>' + l.n + '.</b> ' + l.titolo +
                 '<span class="segno">in preparazione</span></div>';
        });
        (u.materiali || []).forEach(m => {
          if (m.stato !== 'pronta') return;
          const nome = String(m.file).split('/').pop();
          h += '<a class="tac-voce materiale" href="' +
               via(cl, 'materiali', nome) + '">' + m.titolo + '</a>';
        });

        h += '</div>';
        menu.innerHTML = h;

        /* i clic sulle pastiglie **non** chiudono la tendina: scegliere
           una classe o un'unità è navigare dentro l'elenco, non uscirne */
        menu.querySelectorAll('.tac-pastiglie.classi .tac-pil').forEach(b => {
          b.addEventListener('click', ev => {
            ev.stopPropagation();
            const n = parseInt(b.dataset.cl, 10);
            scelta.classe = n;
            /* passando a un'altra classe si va alla sua prima unità, non
               a «l'unità con lo stesso numero»: fra classi il numero
               d'unità non vuol dire niente */
            scelta.unita = (n === qui.classe) ? qui.unita
                                              : ((trovaCl(n).unita || [{}])[0].n || 1);
            disegna();
          });
        });
        menu.querySelectorAll('.tac-pastiglie.unita .tac-pil').forEach(b => {
          b.addEventListener('click', ev => {
            ev.stopPropagation();
            scelta.unita = parseInt(b.dataset.u, 10);
            disegna();
          });
        });
      };

      disegna();

      const bottone = nav.querySelector('#tac-btn-vai');
      const chiudi = () => cont.classList.remove('aperto');
      bottone.onclick = e => {
        e.stopPropagation();
        /* riaprendola si riparte sempre da dove si è, non da dove si era
           andati a curiosare l'ultima volta */
        if (!cont.classList.contains('aperto')) {
          scelta = { classe: qui.classe, unita: qui.unita };
          disegna();
        }
        cont.classList.toggle('aperto');
      };
      document.addEventListener('click', ev => {
        if (!cont.contains(ev.target)) chiudi();
      });
      document.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') chiudi();
      });
    },

    /* Quando arriva il pianoforte campionato, i lettori lo dichiarano */
    aggiornaStrumento() { /* ogni lettore dichiara il proprio organico da sé */ },

    /* Antepone a ogni slide l'etichetta dell'area di appartenenza */
    etichettaAree() {
      const NOMI = { perc: 'Esperienza percettiva',
                     off:  'Officina compositiva',
                     anal: 'Indagine analitica' };
      this.slides.forEach(s => {
        if (s.classList.contains('copertina')) return;
        const chiave = ['perc', 'off', 'anal'].find(k => s.classList.contains(k));
        if (!chiave) return;
        const dentro = s.querySelector('.slide-interna') || s;
        if (dentro.querySelector('.tac-area')) return;
        const e = document.createElement('span');
        e.className = 'tac-area';
        e.textContent = NOMI[chiave];
        dentro.insertBefore(e, dentro.firstChild);
      });
    },

    costruisciNav() {
      const p = document.createElement('div');
      p.id = 'tac-progresso';
      document.body.appendChild(p);

      const nav = document.createElement('div');
      nav.id = 'tac-nav';
      nav.className = 'no-stampa';
      nav.innerHTML =
        /* Da una lezione non si tornava indietro: chi la apriva restava
           dentro finché non chiudeva la scheda. Due passi bastano, la
           classe e il corso, e sono gli stessi che la barra in cima alle
           pagine del sito mostra come briciole di pane. */
        /* ══ TRE ZONE, E CIASCUNA RISPONDE A UNA DOMANDA SOLA ══

           Andrea, 27 agosto, con la fotografia della barra: «il menu in
           basso va decisamente riordinato». Nella fotografia si vedono
           quattro difetti insieme, e sono tutti la stessa cosa — otto
           comandi in fila indiana in una barra alta 58 pixel:

             · «Workbook» e «Letture» impilati uno sopra l'altro, fuori
               dalla barra sotto e sopra;
             · «Vai a» spezzato in due righe;
             · il titolo della slide addosso alla freccia indietro;
             · le due frecce lontane l'una dall'altra, separate da un
               conteggio che in quella lezione era vuoto.

           Il rimedio non è stringere: è dividere. Le uscite, i
           materiali, l'indice, la tendina e le frecce facevano tutti
           parte di un unico `.gruppo`, e un gruppo solo non ha un
           ordine — ha una fila. Adesso sono tre, e ognuno risponde a
           una domanda:

               DA DOVE VENGO      DOVE SONO        CHE COSA APRO
               ← Classe  Corso    ‹  3 / 16  ›     Workbook Letture ☰ Vai a

           Le frecce restano al centro come prima, e adesso sono
           davvero al centro invece che spinte lì da quello che le
           circonda.

           IL TITOLO DELLA SLIDE ESCE DALLA BARRA. Non è una resa: era
           il `data-titolo` della slide corrente, cioè **la stessa cosa
           scritta in grande sulla slide che si sta guardando**. In
           dodici pixel troncati diventava «Da scrivere, per la pro…»,
           che non dice niente e occupava il posto delle frecce. Dove si
           è dentro la lezione lo dicono il conteggio al centro e
           l'indice sotto il ☰, che il titolo intero ce l'ha. */
        '<div class="gruppo indietro">' +
          /* Le due classi in più — `verso-classe` e `verso-corso` — servono
             al CSS: sotto gli 800 px le uscite non spariscono, si stringono
             al loro simbolo, e il simbolo dev'essere diverso per le due.
             Vedi la nota nel foglio di stile, alla regola delle uscite. */
          '<a class="uscita verso-classe" href="../" title="Torna alle unità della classe">&#8592; Classe</a>' +
          '<a class="uscita verso-corso" href="../../" title="Torna all\'indice del corso">Corso</a>' +
        '</div>' +
        '<div class="gruppo frecce">' +
          '<button id="tac-prec" title="Precedente">&#8249;</button>' +
          '<span id="tac-conta"></span>' +
          '<button id="tac-succ" title="Successiva">&#8250;</button>' +
        '</div>' +
        '<div class="gruppo avanti">' +
          /* ══ I MATERIALI, RAGGIUNGIBILI DA OGNI SLIDE ══
             Andrea, 21 agosto: «dobbiamo studiare anche dei collegamenti
             migliori verso il workbook e gli esercizi di lettura, forse
             direttamente dalla pagina di lettura delle slides».

             Prima l'unico modo di arrivarci era la slide dei compiti, in
             fondo: per aprire il workbook a metà lezione bisognava
             scorrere fino alla fine e poi tornare indietro. Adesso stanno
             nella barra, e la barra c'è su ogni slide.

             Li riempie `materiali()` dopo, quando l'indice è stato letto:
             qui si lascia solo il posto, perché il workbook da mostrare è
             quello **dell'unità aperta** e l'unità la sa l'indice.

             Stanno a destra e non più a sinistra: aprono qualcosa, non
             chiudono la lezione, e stavano nel gruppo sbagliato. */
          '<span id="tac-materiali"></span>' +
          '<button id="tac-btn-indice" title="Indice della lezione (I)">&#9776;</button>' +
          '<div id="tac-vai" class="tac-tendina">' +
            '<button id="tac-btn-vai" title="Vai a un\'altra lezione o unità">' +
              '<span class="etichetta-vai">Vai a</span> &#9662;</button>' +
            '<div class="tac-tendina-menu" role="menu"></div>' +
          '</div>' +
          '<button class="testo solo-regia" id="tac-correggi" ' +
            'title="Correggi i testi. Le correzioni restano su questo computer">Correggi</button>' +
          '<button class="testo solo-regia" id="tac-scorda" ' +
            'title="Rimette i testi come stanno nella lezione pubblicata">Scorda</button>' +
          /* «Studio» e «Dispensa» sono usciti dalla barra il 18 agosto.
             Andrea: «i pulsanti Studio e Dispensa non servono più, quando
             lo faremo possiamo metterci Libro».

             Servivano a leggere la lezione come un documento e a
             stamparla come dispensa. Tutti e due nascono da quando la
             lezione era anche il materiale di studio; adesso quel
             mestiere lo fanno il Workbook, il fascicolo di solfeggio e —
             quando ci sarà — il libro. Due pulsanti che offrono una
             seconda strada verso una cosa che ha già la sua non
             aiutano: fanno chiedere quale delle due sia quella giusta.

             IL CODICE CHE LI SERVIVA RESTA, e non è dimenticanza. Le
             classi `modalita-studio` e `modalita-dispensa` sono ancora
             nel foglio di stile e i loro gestori sono ancora qui sotto,
             agganciati solo se il pulsante esiste. Il giorno che al loro
             posto arriva «Libro», la stampa della dispensa potrebbe
             servire di nuovo, e riscriverla da capo costerebbe più che
             lasciarla dormire. Toglierla adesso sarebbe buttare via una
             cosa che funziona per far sembrare più pulito un file che
             nessuno guarda. */
          '<button id="tac-full" title="Schermo intero">&#9974;</button>' +
        '</div>';
      document.body.appendChild(nav);

      nav.querySelector('#tac-prec').onclick = () => this.indietro();
      nav.querySelector('#tac-succ').onclick = () => this.avanti();
      /* I gestori dei due pulsanti tolti si agganciano solo se il
         pulsante esiste. Senza questa guardia `querySelector` torna null
         e la barra intera smette di costruirsi: sparirebbero anche le
         frecce e l'indice, cioe' tutto quello che serve per fare lezione,
         e sparirebbero in silenzio dentro un errore di JavaScript. */
      const seC = (sel, fai) => { const b = nav.querySelector(sel); if (b) fai(b); };

      seC('#tac-stampa', b => b.onclick = () => {
        /* piè di pagina: titolo della lezione, al posto di quello del browser */
        const cop = document.querySelector('.slide.copertina');
        const tit = cop ? (cop.querySelector('h1') || {}).textContent : document.title;
        const occ = cop ? (cop.querySelector('.occhiello') || {}).textContent : '';
        document.body.dataset.piede = [occ, tit].filter(Boolean).join('  ·  ');
        document.body.classList.add('modalita-dispensa');
        const ripristina = () => {
          document.body.classList.remove('modalita-dispensa');
          window.removeEventListener('afterprint', ripristina);
        };
        window.addEventListener('afterprint', ripristina);
        setTimeout(() => window.print(), 120);
      });
      this.costruisciTendina(nav);
      this.materiali(nav);

      nav.querySelector('#tac-btn-indice').onclick = () =>
        document.getElementById('tac-indice').classList.toggle('aperto');
      nav.querySelector('#tac-full').onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      };
      seC('#tac-modo', b => b.onclick = e => {
        const studio = document.body.classList.toggle('modalita-studio');
        e.target.classList.toggle('acceso', studio);
        e.target.textContent = studio ? 'Proiezione' : 'Studio';
        if (!studio) this.vai(this.i);
        else window.scrollTo(0, 0);
      });
      seC('#tac-correggi', b => b.onclick = e =>
        e.target.classList.toggle('acceso', Correzioni.commuta()));
      seC('#tac-scorda', b => b.onclick = () => Correzioni.scorda());
    },

    costruisciIndice() {
      const ind = document.createElement('div');
      ind.id = 'tac-indice';
      ind.className = 'no-stampa';
      const ol = document.createElement('ol');
      this.slides.forEach((s, k) => {
        const t = s.dataset.titolo || (s.querySelector('h1,h2') || {}).textContent || ('Slide ' + (k + 1));
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#s' + k;
        a.textContent = t.trim();
        a.onclick = e => { e.preventDefault(); this.vai(k); ind.classList.remove('aperto'); };
        li.appendChild(a);
        ol.appendChild(li);
      });
      ind.innerHTML = '<h2 style="display:block;text-align:center;border:0">Indice della lezione</h2>' +
                      '<button class="chiudi">&times;</button>';
      ind.appendChild(ol);
      ind.querySelector('.chiudi').onclick = () => ind.classList.remove('aperto');
      document.body.appendChild(ind);
    },

    /* Fa entrare la slide nella finestra: prima scala il palco sulle
       proporzioni dello schermo, poi — solo se il contenuto eccede — lo
       rimpicciolisce in blocco. Sotto una certa soglia non comprime più:
       accende un avviso in regia, perché quella slide va sdoppiata. */
    /* Quanto sta stretta ogni slide, misurata davvero.

       Le slide inattive non sono disegnate, quindi non si possono misurare
       così come sono: si accendono una alla volta, invisibili e fuori dal
       flusso, il tempo di leggere l'altezza del contenuto. */
    misuraTutte() {
      const r = document.documentElement;
      const prima = r.style.getPropertyValue('--adatta');
      r.style.setProperty('--adatta', 1);
      let minimo = 1;
      this.carichi = [];
      this.slides.forEach((s, k) => {
        const dentro = s.querySelector('.slide-interna');
        if (!dentro || s.classList.contains('copertina')) return;
        const attiva = s.classList.contains('attiva');
        if (!attiva) s.classList.add('misura');
        void dentro.offsetHeight;
        const cs = getComputedStyle(s);
        const spazio = s.clientHeight - parseFloat(cs.paddingTop)
                       - parseFloat(cs.paddingBottom) - 8;

        /* Quanto è alto davvero il contenuto.

           `scrollHeight` sembra la risposta ovvia e non lo è. Su un
           elemento con `overflow: visible` — e `.slide-interna` ce l'ha —
           il browser non ha niente da far scorrere, quindi riporta
           `scrollHeight` **uguale a `clientHeight`** anche quando il
           contenuto esce dal riquadro. Il contenuto che sborda è
           invisibile proprio allo strumento che deve cercarlo.

           È così che è passata la slide «Perché il ritmo è stato l'ultimo
           a essere scritto»: la didascalia della foto usciva di 69 pixel
           sotto il bordo e veniva tagliata, e la lezione dichiarava zero
           slide che sbordano. Segnalato da Andrea, non dal controllo.

           Si misura allora il fondo vero dei figli, che non dipende da
           nessun overflow, e si tiene il più basso. `scrollHeight` resta
           come secondo parere per i casi in cui il contenitore scorre
           davvero. */

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
        const base = dentro.getBoundingClientRect().top
                     + parseFloat(getComputedStyle(dentro).paddingTop) * kappa;
        let fondo = 0;
        dentro.querySelectorAll('*').forEach(e => {
          const b = e.getBoundingClientRect();
          if (b.height) fondo = Math.max(fondo, (b.bottom - base) / kappa);
        });
        const alto = Math.max(dentro.scrollHeight, Math.round(fondo));

        if (!attiva) s.classList.remove('misura');
        if (alto > spazio + 1) {
          const q = spazio / alto;
          minimo = Math.min(minimo, q);
          this.carichi.push({ n: k, titolo: s.dataset.titolo, scala: +q.toFixed(3),
                              alto: Math.round(alto), spazio: Math.round(spazio) });
        }
      });
      if (prima) r.style.setProperty('--adatta', prima);
      return Math.max(0.58, minimo);
    },

    adatta(rimisura) {
      const s = this.slides[this.i];
      if (!s || document.body.classList.contains('modalita-studio')
             || document.body.classList.contains('modalita-dispensa')) return;

      const prop0 = window.innerWidth / window.innerHeight;
      document.documentElement.style.setProperty('--palco-l',
        Math.max(1100, Math.min(2000, Math.round(720 * prop0))) + 'px');

      /* La scala non si tocca: è sempre 1, uguale su tutte le slide.

         Prima veniva calcolata slide per slide, e quelle piene venivano
         rimpicciolite mentre le leggere restavano intere: nella lezione 1
         si passava da 1 sulla giga a 0,66 sul C. P. E. Bach, e il corpo
         del testo cambiava a ogni passaggio. Chi guarda non pensa «questa
         slide è più carica», pensa che la presentazione sia fatta male.

         La misura resta, ma non serve più a rimpicciolire: serve a dire
         quali slide non ci stanno, perché quelle vanno sdoppiate. È una
         diagnosi, non un rimedio — il rimedio è scrivere meno per pagina.
         L'elenco è in TAC.deck.carichi. */
      if (rimisura || this._scala == null) this.misuraTutte();
      this._scala = 1;
      document.documentElement.style.setProperty('--adatta', 1);
      const troppa = (this.carichi || []).length > 0;

      /* Il palco prende le proporzioni della finestra invece di restare
         inchiodato al 16:9: su uno schermo più largo o più alto niente
         bande vuote ai lati, si usa tutta la superficie disponibile. */
      const prop = window.innerWidth / window.innerHeight;
      const larg = Math.max(1100, Math.min(2000, Math.round(720 * prop)));
      document.documentElement.style.setProperty('--palco-l', larg + 'px');

      const k = Math.min(window.innerWidth / s.offsetWidth,
                         window.innerHeight / s.offsetHeight);
      document.documentElement.style.setProperty('--k', k);

      /* margine di sicurezza: meglio un filo di respiro che una cornice al limite */
      /* L'avviso in regia: quali slide non ci stanno, e di quanto.

         Due tarature, tutte e due nate dall'uso. Prima l'avviso diceva
         «vanno sdoppiate» per qualunque sforo, anche di dieci pixel, e
         chiedere di sdoppiare una slide che sborda di mezza riga è un
         consiglio che nessuno segue — quindi l'avviso si impara a
         ignorare, e allora non serve più a niente. E non diceva **di
         quanto**: fra dieci pixel e centoventotto c'è la differenza fra
         una parola e una riscrittura, e il numero è l'unica cosa che
         permette di decidere.

         Sotto i quaranta pixel — meno di una riga e mezza — l'avviso tace.
         Non perché quello sforo non esista, ma perché il rimedio costa più
         del difetto, e un controllo che segnala cose che non conviene
         correggere addestra a non guardarlo. */
      const av = document.getElementById('tac-densita');
      if (av) {
        const SOGLIA = 40;   // pixel: sotto, non vale la pena intervenire
        const c = (this.carichi || []).map(x => {
          const sforo = Math.round(x.alto - x.spazio);
          return Object.assign({ sforo: isNaN(sforo) ? null : sforo }, x);
        });
        const gravi = c.filter(x => x.sforo == null || x.sforo >= SOGLIA);
        av.classList.toggle('acceso', gravi.length > 0);
        av.textContent = gravi.length
          ? 'slide ' + gravi.map(x => x.n + 1).join(', ')
            + (gravi.length === 1 ? ' non ci sta' : ' non ci stanno')
            + ' — ' + (gravi[0].sforo != null
                ? 'fino a ' + Math.max(...gravi.map(x => x.sforo)) + ' px fuori'
                : 'da alleggerire')
          : '';
        av.title = c.map(x => (x.n + 1) + '. ' + x.titolo +
                              (x.sforo != null ? '  (' + x.sforo + ' px fuori)' : '')).join('\n')
                   + (c.length > gravi.length
                      ? '\n\nSotto i ' + SOGLIA + ' px l\'avviso non si accende.'
                      : '');
      }
    },

    vai(n) {
      if (document.body.classList.contains('modalita-studio')) return;
      this.i = Math.max(0, Math.min(n, this.slides.length - 1));
      this.slides.forEach((s, k) => s.classList.toggle('attiva', k === this.i));
      const cur = this.slides[this.i];
      const titolo =
        cur.dataset.titolo || (cur.querySelector('h1,h2') || {}).textContent || '';

      /* ══ IL CONTEGGIO FRA LE DUE FRECCE, CHE NON C'ERA MAI STATO ══

         `#tac-conta` esisteva nella barra dal primo giorno, con un
         `min-width: 5.5rem` nel foglio di stile, e **nessuno lo
         riempiva**: in tutto il file non c'era una riga che gli
         scrivesse dentro qualcosa. Il risultato era uno spazio vuoto di
         88 pixel fra la freccia indietro e quella avanti, che sembrava
         un difetto di allineamento e invece era un dato mancante.

         Si vede nella fotografia del 27 agosto: le due frecce lontane
         l'una dall'altra senza niente in mezzo. Andrea l'ha letto come
         disordine, ed era disordine — ma la causa non era il CSS.

         Adesso dice a che slide si è e quante sono, che è l'unica cosa
         che in una lezione proiettata si vuole sapere a colpo d'occhio. */
      const conta = document.getElementById('tac-conta');
      if (conta) conta.textContent = (this.i + 1) + ' / ' + this.slides.length;

      /* Il titolo della slide non sta più nella barra — era la stessa
         cosa scritta in grande sulla slide, e troncato a dodici pixel
         non diceva niente. Resta come suggerimento del pulsante
         dell'indice: chi ci passa sopra col mouse lo legge intero,
         senza che rubi spazio alle frecce. */
      const ind = document.getElementById('tac-btn-indice');
      if (ind) {
        ind.title = titolo
          ? 'Indice della lezione (I) — sei su: ' + titolo
          : 'Indice della lezione (I)';
      }

      document.getElementById('tac-progresso').style.width =
        ((this.i + 1) / this.slides.length * 100) + '%';
      /* Cambiando slide si zittisce quello che stava suonando.

         Le slide non escono dal documento, si nascondono: un componente
         che sta suonando continua a suonare da dietro, e chi tiene la
         lezione si ritrova il metronomo o un ascolto che vanno avanti su
         un'altra schermata senza vedere da dove arrivano. */
      document.querySelectorAll('tac-metro, tac-livelli, tac-rhythm, tac-brano, tac-gesto')
        .forEach(c => { if (typeof c.ferma === 'function') { try { c.ferma(); } catch (e) {} } });

      this.adatta();
      /* i pentagrammi e le partiture arrivano dopo: si rimisura */
      clearTimeout(this._t1); this._t1 = setTimeout(() => this.adatta(), 260);
      clearTimeout(this._t2); this._t2 = setTimeout(() => this.adatta(true), 900);
      try { history.replaceState(null, '', '#s' + this.i); } catch (e) { /* alcuni contesti file:// */ }
      window.scrollTo(0, 0);
    },

    avanti()   { this.vai(this.i + 1); },
    indietro() { this.vai(this.i - 1); }
  };

  /* ══════════════════════════════════════════════════════════════
     <tac-chiuso> — quello che si vede solo col codice del docente

     Andrea, 17 agosto: «per evitare che gli studenti lo vedano prima di
     svolgerlo potremmo pensare a un codice che conosco soltanto io per far
     apparire la soluzione».

     NON C'È NIENTE DA SCOPRIRE NEL SORGENTE. La strada ovvia sarebbe un
     campo e un confronto — `if (codice === '...')` — con la soluzione
     nascosta da un `display:none`. Non protegge niente: il codice sta nel
     sorgente e la soluzione pure, e «visualizza sorgente» è a due clic.
     Sarebbe anche peggio che non fare nulla, perché darebbe l'impressione
     di una protezione.

     Qui dentro l'attributo `dati` ci sono **byte cifrati**: la soluzione
     non è nella pagina in nessuna forma leggibile. La chiave si deriva dal
     codice con PBKDF2 a 150.000 giri e i byte si aprono con AES-GCM, che
     è autenticato — un codice sbagliato non produce spazzatura
     plausibile, fallisce e basta.

     A cifrare è `_chiudi.py`, che gira sul deposito dopo il montaggio. I
     sorgenti restano in chiaro: si legge e si corregge la soluzione come
     qualsiasi altra parte della lezione. */
  class TacChiuso extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      const invito = this.getAttribute('invito') || 'Contenuto riservato';
      if (!this.getAttribute('dati')) {
        /* Non cifrato: siamo nei sorgenti, o `_chiudi.py` non è passato.
           Si mostra com'è — nascondere qui non servirebbe a niente e
           renderebbe impossibile controllare la lezione mentre la si
           scrive. */
        return;
      }
      const dentro = this.innerHTML;
      this.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'tac-chiuso';
      box.innerHTML =
        '<p class="tac-chiuso-invito">&#128274; ' + invito + '</p>' +
        '<div class="tac-chiuso-riga">' +
        '<input type="password" class="tac-chiuso-campo" ' +
        'placeholder="codice" autocomplete="off" spellcheck="false">' +
        '<button type="button" class="tac-chiuso-tasto">Mostra</button>' +
        '</div><p class="tac-chiuso-esito" role="status"></p>';
      this.appendChild(box);
      this._dentro = dentro;

      const campo = box.querySelector('.tac-chiuso-campo');
      const tasto = box.querySelector('.tac-chiuso-tasto');
      const esito = box.querySelector('.tac-chiuso-esito');
      const apri = () => this.apri(campo.value, esito, box);
      tasto.addEventListener('click', apri);
      campo.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); apri(); }
      });
    }

    async apri(cod, esito, box) {
      const b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
      if (!cod) { esito.textContent = 'Scrivi il codice.'; return; }
      esito.textContent = 'Apro…';
      try {
        const sale = b(this.getAttribute('sale'));
        const iv = b(this.getAttribute('iv'));
        const dati = b(this.getAttribute('dati'));
        const base = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(cod), 'PBKDF2', false, ['deriveKey']);
        const k = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: sale, iterations: 150000, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        const chiaro = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv }, k, dati);
        const html = new TextDecoder().decode(chiaro);
        box.remove();
        this.innerHTML = html;
        /* I componenti dentro la soluzione — un pentagramma, un ritmo —
           nascono adesso, e vanno svegliati: sono stati creati dopo che
           il documento era già a posto. */
        this.querySelectorAll('*').forEach(n => {
          if (n.tagName.toLowerCase().startsWith('tac-') && n.connectedCallback) {
            try { n.connectedCallback(); } catch (e) { /* già a posto */ }
          }
        });
      } catch (e) {
        /* AES-GCM è autenticato: un codice sbagliato fallisce qui, e non
           produce un testo sbagliato ma plausibile. */
        esito.textContent = 'Codice non valido.';
      }
    }
  }
  customElements.define('tac-chiuso', TacChiuso);

  /* ==========================================================
     <tac-orale> — IL SOLFEGGIO DI PRIMA VISTA, DIETRO UN CODICE

     <tac-orale sale="…" invito="…">
       <script type="application/json">[{iv, dati}, …]</script>
     </tac-orale>

     PERCHÉ NON BASTAVA `tac-chiuso`. Quello apre **un** blocco con
     **un** codice, ed è giusto per la soluzione di un dettato, che è
     una sola. Qui i pezzi sono dodici e il codice dice **quale**: sul
     foglio dell'interrogazione ogni studente ha il suo, e scrivendolo
     deve comparire il suo e nessun altro.

     COME LO FA. Deriva la chiave una volta sola dal codice scritto, poi
     prova ad aprire i dodici blocchi. AES-GCM è autenticato: quello che
     si apre è quello giusto, e sugli altri la decifratura fallisce
     invece di produrre spazzatura plausibile. Se non si apre niente, il
     codice è sbagliato.

     UN SALE SOLO PER PAGINA, e la ragione è il tempo. Con un sale per
     pezzo servirebbero dodici derivazioni PBKDF2 a 150.000 giri: qualche
     secondo, in piedi, davanti alla classe che aspetta. Con un sale solo
     si deriva una volta e le dodici decifrature sono istantanee.

     E NIENTE IN CHIARO NEL SORGENTE. È tutto il punto: «prima vista»
     smette di esserlo se il pezzo si può leggere il giorno prima
     guardando il codice della pagina.
     ========================================================== */

  class TacOrale extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;

      const dep = this.querySelector('script[type="application/json"]');
      let blocchi = [];
      try { blocchi = JSON.parse(dep ? dep.textContent : '[]'); } catch (e) {}
      this._blocchi = blocchi;
      if (dep) dep.remove();

      const invito = this.getAttribute('invito') ||
                     'Il codice sta sul foglio dell\u2019interrogazione';
      const box = document.createElement('div');
      box.className = 'tac-chiuso tac-orale-avvio';
      box.innerHTML =
        '<p class="tac-chiuso-invito">&#128274; ' + invito + '</p>' +
        '<div class="tac-chiuso-riga">' +
        '<input type="text" class="tac-chiuso-campo tac-orale-campo" ' +
        'placeholder="codice" autocomplete="off" spellcheck="false" ' +
        'maxlength="6" inputmode="latin">' +
        '<button type="button" class="tac-chiuso-tasto">Mostra</button>' +
        '</div><p class="tac-chiuso-esito" role="status"></p>';
      this.appendChild(box);
      this._avvio = box;

      const campo = box.querySelector('.tac-chiuso-campo');
      const tasto = box.querySelector('.tac-chiuso-tasto');
      const esito = box.querySelector('.tac-chiuso-esito');
      /* Maiuscolo sempre: i codici lo sono, e chi scrive al volo davanti
         a una classe non guarda il tasto delle maiuscole. */
      campo.addEventListener('input', () => {
        campo.value = campo.value.toUpperCase();
      });
      const apri = () => this.apri(campo.value.trim(), esito);
      tasto.addEventListener('click', apri);
      campo.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); apri(); }
      });
    }

    async apri(cod, esito) {
      const b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
      if (!cod) { esito.textContent = 'Scrivi il codice.'; return; }
      esito.textContent = 'Apro\u2026';
      let chiave;
      try {
        const base = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(cod), 'PBKDF2', false, ['deriveKey']);
        chiave = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: b(this.getAttribute('sale')),
            iterations: 150000, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      } catch (e) {
        esito.textContent = 'Qui non posso aprire niente: serve una pagina ' +
                            'aperta da internet, non da disco.';
        return;
      }

      for (const blocco of (this._blocchi || [])) {
        try {
          const chiaro = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: b(blocco.iv) }, chiave, b(blocco.dati));
          this.mostra(JSON.parse(new TextDecoder().decode(chiaro)));
          return;
        } catch (e) { /* non è questo: si prova il prossimo */ }
      }
      esito.textContent = 'Codice non valido.';
    }

    mostra(pezzo) {
      if (this._avvio) this._avvio.remove();
      const d = document.createElement('div');
      d.className = 'tac-orale-pezzo';
      d.innerHTML = pezzo.svg;
      this.appendChild(d);

      /* Il tasto per chiudere: fra uno studente e l'altro il pezzo deve
         sparire, sennò il secondo entra e lo trova sullo schermo. */
      const chiudi = document.createElement('button');
      chiudi.type = 'button';
      chiudi.className = 'tac-chiuso-tasto tac-orale-chiudi';
      chiudi.textContent = 'Nascondi';
      chiudi.addEventListener('click', () => {
        d.remove();
        chiudi.remove();
        this._fatto = false;
        this.connectedCallback();
      });
      this.appendChild(chiudi);
    }
  }
  customElements.define('tac-orale', TacOrale);

  document.addEventListener('DOMContentLoaded', () => Deck.init());

})();
