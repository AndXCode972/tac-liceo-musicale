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
    VERSIONE: 1,

    /* La risposta e un numero da 0 a 7: 0 vuol dire «non data», e
       da 1 a 7 sono le scelte. Sette bastano: una domanda con piu
       di sette opzioni non si risponde, si indovina. */
    MAX_SCELTE: 7,
    MAX_DOMANDE: 63,

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
      for (const r of risposte) bit += this._bit(r, 3);
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
      const fine = 51 + n * 3;
      if (bit.length < fine + 10) return null;

      const risposte = [];
      for (let i = 0; i < n; i++) {
        risposte.push(parseInt(bit.slice(51 + i * 3, 54 + i * 3), 2));
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
      const puntata = parteDur.includes('.');
      const dur = parteDur.replace(/\./g, '') || 'q';
      const pausa = /^r$/i.test(parteNote);
      const keys = pausa ? ['b/4'] : parteNote.split('+').map(s => s.trim().toLowerCase());
      let battiti = DURATE_BATTITI[dur] || 1;
      if (puntata) battiti *= 1.5;
      return { keys, dur, puntata, pausa, battiti, legata };
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
      const caption = this.getAttribute('caption') || '';
      const testo   = this.getAttribute('notes')  || '';
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
      this.appendChild(tela);

      const dati = leggiNote(testo);
      this._dati = dati;

      const renderer = new VF.Renderer(tela, VF.Renderer.Backends.SVG);
      const altezza = clef === 'bass' ? 150 : 150;
      renderer.resize(larghezza, altezza);
      const ctx = renderer.getContext();

      const testoBasso = this.getAttribute('bass');
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
        new VF.StaveConnector(stave, staveB).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
        new VF.StaveConnector(stave, staveB).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
        new VF.StaveConnector(stave, staveB).setType(VF.StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();
        this._staveB = staveB;
        this._datiB = leggiNote(testoBasso);
        if (this._datiB.length) {
          const noteB = this._datiB.map(d => {
            if (d.stanghetta) return stanghettaVF(VF, d.stanghetta);
            const sn = new VF.StaveNote({ keys: d.keys, duration: d.dur + (d.pausa ? 'r' : ''), clef: 'bass' });
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
          new VF.Formatter().joinVoices([vB]).format([vB], larghezza - 110);
          vB.draw(ctx, staveB);
          travB.forEach(b => b.setContext(ctx).draw());
        }
      }

      if (dati.length) {
        const note = dati.map(d => {
          if (d.stanghetta) return stanghettaVF(VF, d.stanghetta);
          const sn = new VF.StaveNote({
            keys: d.keys,
            duration: d.dur + (d.pausa ? 'r' : ''),
            clef: clef
          });
          if (!d.pausa) {
            d.keys.forEach((k, i) => {
              const p = N.scomponi(k);
              if (p.alt) sn.addModifier(new VF.Accidental(p.alt), i);
            });
          }
          if (d.puntata) VF.Dot.buildAndAttach([sn], { all: true });
          return sn;
        });

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
        new VF.Formatter().joinVoices([voce]).format([voce], larghezza - 90);
        voce.draw(ctx, stave);
        travature.forEach(b => b.setContext(ctx).draw());
        disegnaLegature(VF, ctx, dati, note);

        this._note = note;
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

    /* Riproduce la sequenza evidenziando le note */
    async suona(bottone, fattore = 1) {
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
      let t = Tone.now() + 0.15;

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

      this._dati.forEach((d, i) => {
        if (d.stanghetta) return;          /* non dura e non suona */
        const secondi = d.battiti * durBattito;
        const suonati = durate[i] * durBattito;
        if (!d.pausa && !muta[i]) {
          if (soloRitmo) {
            Audio.tick.triggerAttackRelease(Audio.LIVELLI.ritmo.altezza, '64n', t,
                                            Audio.LIVELLI.ritmo.forza);
          } else {
            voce.triggerAttackRelease(
              d.keys.map(k => N.aTone(k)), suonati * 0.92, t
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
        t += secondi;
      });

      const attesa = (t - Tone.now()) * 1000 + 200;
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
      prova.registra(ospite, dati.punti, dati.massimo);
      return null;
    }
    return bloccoCodice(ospite, dati);
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
     ========================================================== */

  class TacVerifica extends HTMLElement {
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;

      this._prove = [...this.children].filter(
        e => /^TAC-/.test(e.tagName) && e.tagName !== 'TAC-STAVE');
      if (!this._prove.length) return;

      this._esiti = [];
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
    }

    aggiornaTesta() {
      const t = this.getAttribute('titolo') || 'Verifica';
      this._testa.innerHTML =
        '<span class="tac-verifica-nome">' + t + '</span>' +
        '<span class="tac-verifica-conta">Esercizio ' + (this._i + 1) +
        ' di ' + this._prove.length + '</span>';
    }

    /* Chiamata dal singolo esercizio quando ha finito. Il peso si legge
       qui e non nell'esercizio: l'esercizio non deve sapere quanto vale,
       altrimenti lo stesso esercizio riusato in due verifiche diverse
       porterebbe con sé il peso della prima. */
    registra(chi, punti, massimo) {
      if (chi._registrato) return;
      chi._registrato = true;
      this._esiti.push({
        peso: parseFloat(chi.getAttribute('peso')) || 1,
        punti: punti, massimo: massimo
      });

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

    chiudi() {
      /* Il punteggio della prova e' la media pesata delle rese, riportata
         su cento. Non si sommano i punti grezzi: un esercizio da venti item
         schiaccerebbe uno da cinque anche avendo peso minore, e il peso non
         servirebbe piu' a niente. */
      let resa = 0, pesi = 0;
      this._esiti.forEach(e => {
        if (!e.massimo) return;
        resa += e.peso * (e.punti / e.massimo);
        pesi += e.peso;
      });
      const cento = pesi ? Math.round(resa / pesi * 100) : 0;

      this._prove.forEach(p => { p.hidden = true; });
      this._testa.innerHTML = '<span class="tac-verifica-nome">' +
        (this.getAttribute('titolo') || 'Verifica') + '</span>' +
        '<span class="tac-verifica-conta">conclusa</span>';

      const esito = document.createElement('div');
      esito.className = 'tac-punteggio mostra';
      esito.innerHTML = '<div class="valore">' + cento + ' / 100</div>' +
        '<p style="margin:.6rem 0 0">' + this.dettaglio() + '</p>';
      this._piede.appendChild(esito);

      bloccoCodice(this._piede, {
        scheda: this.getAttribute('sigla'),
        punti: cento, massimo: 100
      });

      const ri = document.createElement('button');
      ri.className = 'btn secondario';
      ri.style.marginTop = '1rem';
      ri.textContent = 'Rifai la verifica';
      /* Rifare e' permesso, ma il codice lo dira': il tentativo si conta
         sulla prova intera e ogni ripetizione vale meno. Vietarlo sarebbe
         una promessa che non posso mantenere -- basta svuotare i dati del
         browser -- e renderla visibile e' piu' onesto che fingere. */
      ri.onclick = () => {
        this._piede.innerHTML = '';
        this._esiti = []; this._i = 0;
        this._prove.forEach((p, k) => {
          p._registrato = false; p._fatto = false; p.hidden = !!k;
          p.innerHTML = ''; p.connectedCallback && p.connectedCallback();
        });
        this.aggiornaTesta();
      };
      this._piede.appendChild(ri);
    }

    dettaglio() {
      return this._esiti.map((e, k) =>
        'es. ' + (k + 1) + ': ' + e.punti + '/' + e.massimo +
        (e.peso !== 1 ? ' (peso ' + e.peso + ')' : '')).join(' &middot; ');
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
      const sol = document.createElement('p');
      sol.className = 'tac-quiz-chiavi';
      sol.innerHTML = '<strong>Risposte:</strong> ' +
        (this._tutte || this._dom).map((q, i) => (i + 1) + LETTERE[q.c].toLowerCase()).join(' · ');
      d.appendChild(sol);
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
        '<span class="tac-quiz-conta">Punteggio ' + this._punti + '</span>';
      tastoAzzera(testa, () => { this.pesca(); this.mostra(); },
                  () => this._i + this._punti);
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

      const avanti = document.createElement('button');
      avanti.className = 'btn';
      avanti.style.marginTop = '1.1rem';
      avanti.textContent = (this._i < this._dom.length - 1) ? 'Domanda successiva' : 'Vedi il risultato';
      avanti.onclick = () => {
        if (this._fermaSuono) this._fermaSuono();
        if (this._i < this._dom.length - 1) { this._i++; this.mostra(); }
        else this.risultato();
      };
      this._box.appendChild(avanti);
    }

    risultato() {
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
      let frasi = cfg.frasi.slice();
      let gettoni;
      if (quante > 0 && quante < frasi.length) {
        for (let i = frasi.length - 1; i > 0; i--) {
          const j = TAC.caso.intero(i + 1);
          [frasi[i], frasi[j]] = [frasi[j], frasi[i]];
        }
        const scelte = frasi.slice(0, quante);
        const giuste = scelte.map(f => f[1]);
        const altre = frasi.slice(quante).map(f => f[1])
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
      frasi.forEach(([testo, giusta]) => {
        const r = document.createElement('p');
        r.className = 'tac-frase';
        r.innerHTML = testo + ' ';
        const buca = document.createElement('span');
        buca.className = 'tac-buca';
        buca.dataset.giusta = giusta;
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
      cfg.frasi.forEach(([testo]) => {
        const li = document.createElement('li');
        li.innerHTML = testo + ' <span class="puntini"></span>';
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
      bt.textContent = 'Controlla';
      bt.onclick = () => {
        let giuste = 0, messe = 0;
        lista.querySelectorAll('.tac-buca').forEach(b => {
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
      tastoAzzera(barra, rifai,
                  () => lista.querySelectorAll('.tac-buca').length &&
                        [...lista.querySelectorAll('.tac-buca')]
                          .filter(b => b.textContent.trim()).length);
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
    if (Math.abs(s) < 4) return M;                 // centro sulla corda: dritto
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

      /* LA TANGENTE DI OGNI ICTUS.

         Scelta confrontando cinque regole disegnate una accanto all'altra
         (`03_Materiali/_repertorio/cerca-tangenti.js`), non a tentativi:
         provate una per volta ricaricando la pagina sono venti minuti a
         tentativo e non si confrontano fra loro.

         Quella che teneva il giro più largo — tangenti perpendicolari al
         raggio, la mano che gira sempre attorno al centro — è stata
         **scartata** anche se era la più elegante: nel quattro il due e il
         tre smettevano di collegarsi come devono, e il gesto diventava un
         ovale qualunque. Il gesto di direzione **si incrocia**, e Andrea
         l'aveva già detto: «le linee si possono attraversare». Una regola
         che lo impedisce risolve il disegno e rompe il significato.

         Vince quindi la regola che rispetta le direzioni:

           · BATTERE — orizzontale, verso dove si andrà. È il rimbalzo: la
             mano arriva scendendo e nel punto più basso va già di lato.
           · LEVARE — orizzontale, verso il battere. Uscendo dalla parte
             opposta rientra su sé stessa, ed è il cappio che chiude il giro.
           · LATERALI — verso il prossimo ictus, ma **piegata in su**: sei
             parti di direzione e quattro di verticale. È da qui che nasce
             l'ansa che ammorbidisce il transito verso l'alto, e nasce da
             sé: nessun ricciolo disegnato a mano. */
      ictus.forEach((ic, k) => {
        const S = ictus[(k + 1) % N].p;
        if (ic.dove === 'basso' || ic.dove === 'alto') {
          const s = Math.sign(S[0] - ic.p[0]) || (ic.dove === 'alto' ? -1 : 1);
          ic.t = [s, 0];
        } else {
          const dx = S[0] - ic.p[0], dy = S[1] - ic.p[1];
          const L = Math.hypot(dx, dy) || 1;
          const vx = dx / L * .6, vy = dy / L * .6 - .4;
          const M2 = Math.hypot(vx, vy) || 1;
          ic.t = [vx / M2, vy / M2];
        }
      });

      const seg = [];
      for (let k = 0; k < N; k++) {
        const A = ictus[k], B = ictus[(k + 1) % N];
        const L = Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]) * 0.55;
        seg.push({ b: [A.p,
                       [A.p[0] + A.t[0] * L, A.p[1] + A.t[1] * L],
                       [B.p[0] - B.t[0] * L, B.p[1] - B.t[1] * L],
                       B.p] });
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

      let d = 'M' + ictus[0].p[0] + ',' + ictus[0].p[1];
      seg.forEach(s => { d += ' C' + s.b[1][0] + ',' + s.b[1][1] +
                              ' ' + s.b[2][0] + ',' + s.b[2][1] +
                              ' ' + s.b[3][0] + ',' + s.b[3][1]; });
      svg.appendChild(el('path', { d: d + ' Z', fill: 'none', stroke: 'currentColor',
        'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: .45 }));

      /* ---- LE FRECCE ----------------------------------------------------
         Una per battuta, sulla curva, girata come la tangente: dice da che
         parte si va e che lì la mano sta ancora andando. */
      this._battute.forEach((B, b) => {
        /* La freccia sta a tre quarti di battuta, non a metà: a metà la mano
           è ancora dentro il prolungamento del battito precedente e sta
           girando, così la punta indicava di traverso o addirittura
           all'indietro. A tre quarti punta già dove sta andando. */
        const q = suBattuta(b, .75), a = tangBattuta(b, .75);
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
      const incisa = !!this.getAttribute('inciso');
      if (incisa) this.preparaInciso(barra);

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
    preparaInciso(barra) {
      const url = this.getAttribute('inciso');
      let mappa = null;
      try { mappa = JSON.parse(this.getAttribute('mappa') || 'null'); } catch (e) {}

      const au = document.createElement('audio');
      au.preload = 'none'; au.src = url;
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

    illumina(k) {
      const m = this.misure();
      if (!m.length) return;
      m.forEach(x => x.classList.remove('suona'));
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
       dove si sta andando. */
    costruisciTendina(nav) {
      const cont = nav.querySelector('#tac-vai');
      const menu = cont && cont.querySelector('.tac-tendina-menu');
      const dati = document.getElementById('tac-indice-corso');
      if (!cont || !menu || !dati) { if (cont) cont.remove(); return; }

      let ind;
      try { ind = JSON.parse(dati.textContent); }
      catch (e) { cont.remove(); return; }

      const qui = ind.qui || {};
      let html = '';
      (ind.classi || []).forEach(cl => {
        (cl.unita || []).forEach(u => {
          const suUnita = u.n === qui.unita;
          const lez = u.lezioni || [];
          html += '<div class="tac-tendina-testa' + (suUnita ? ' qui' : '') + '">' +
                  'Unità ' + u.n + ' · ' + u.titolo +
                  (u.quando ? '<span class="quando">' + u.quando + '</span>' : '') +
                  '</div>';
          if (!lez.length) {
            html += '<div class="tac-voce vuota">' +
                    (u.stato || 'da preparare') + '</div>';
            return;
          }
          lez.forEach(l => {
            const corrente = suUnita && l.n === qui.lezione;
            const pronta = l.stato === 'pronta';
            /* la via è relativa alla lezione aperta: dalla cartella di
               un'unità si sale di uno e si scende nell'altra */
            const via = (u.n === qui.unita) ? l.file : '../' + u.via + '/' + l.file;
            if (corrente)
              html += '<div class="tac-voce corrente" aria-current="page">' +
                      '<b>' + l.n + '.</b> ' + l.titolo + '<span class="segno">sei qui</span></div>';
            else if (pronta)
              html += '<a class="tac-voce" href="' + via + '">' +
                      '<b>' + l.n + '.</b> ' + l.titolo + '</a>';
            else
              html += '<div class="tac-voce vuota"><b>' + l.n + '.</b> ' + l.titolo +
                      '<span class="segno">in preparazione</span></div>';
          });
          (u.materiali || []).forEach(m => {
            if (m.stato !== 'pronta') return;
            html += '<a class="tac-voce materiale" href="' + m.file + '">' +
                    m.titolo + '</a>';
          });
        });
      });
      menu.innerHTML = html;

      const bottone = nav.querySelector('#tac-btn-vai');
      const chiudi = () => cont.classList.remove('aperto');
      bottone.onclick = e => {
        e.stopPropagation();
        cont.classList.toggle('aperto');
        /* aperta, si porta subito sotto gli occhi la voce corrente:
           con undici unità l'elenco è lungo e quella è il punto di
           partenza di chiunque */
        if (cont.classList.contains('aperto')) {
          const q = menu.querySelector('.corrente');
          if (q) menu.scrollTop = Math.max(0, q.offsetTop - menu.clientHeight / 2);
        }
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
        '<div class="gruppo">' +
          '<a class="uscita" href="../" title="Torna alle unità della classe">&#8592; Classe</a>' +
          '<a class="uscita" href="../../" title="Torna all\'indice del corso">Corso</a>' +
          '<div id="tac-vai" class="tac-tendina">' +
            '<button id="tac-btn-vai" title="Vai a un\'altra lezione o unità">' +
              '<span class="etichetta-vai">Vai a</span> &#9662;</button>' +
            '<div class="tac-tendina-menu" role="menu"></div>' +
          '</div>' +
          '<button id="tac-btn-indice" title="Indice della lezione (I)">&#9776;</button>' +
          '<span id="tac-titolo-corrente"></span>' +
        '</div>' +
        '<div class="gruppo frecce">' +
          '<button id="tac-prec" title="Precedente">&#8249;</button>' +
          '<span id="tac-conta"></span>' +
          '<button id="tac-succ" title="Successiva">&#8250;</button>' +
        '</div>' +
        '<div class="gruppo">' +
          '<button class="testo solo-regia" id="tac-correggi" ' +
            'title="Correggi i testi. Le correzioni restano su questo computer">Correggi</button>' +
          '<button class="testo solo-regia" id="tac-scorda" ' +
            'title="Rimette i testi come stanno nella lezione pubblicata">Scorda</button>' +
          '<button class="testo" id="tac-modo" title="Passa alla versione per lo studio">Studio</button>' +
          '<button class="testo" id="tac-stampa" title="Genera la dispensa stampabile in PDF">Dispensa</button>' +
          '<button id="tac-full" title="Schermo intero">&#9974;</button>' +
        '</div>';
      document.body.appendChild(nav);

      nav.querySelector('#tac-prec').onclick = () => this.indietro();
      nav.querySelector('#tac-succ').onclick = () => this.avanti();
      nav.querySelector('#tac-stampa').onclick = () => {
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
      };
      this.costruisciTendina(nav);

      nav.querySelector('#tac-btn-indice').onclick = () =>
        document.getElementById('tac-indice').classList.toggle('aperto');
      nav.querySelector('#tac-full').onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      };
      nav.querySelector('#tac-modo').onclick = e => {
        const studio = document.body.classList.toggle('modalita-studio');
        e.target.classList.toggle('acceso', studio);
        e.target.textContent = studio ? 'Proiezione' : 'Studio';
        if (!studio) this.vai(this.i);
        else window.scrollTo(0, 0);
      };
      nav.querySelector('#tac-correggi').onclick = e =>
        e.target.classList.toggle('acceso', Correzioni.commuta());
      nav.querySelector('#tac-scorda').onclick = () => Correzioni.scorda();
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
      document.getElementById('tac-titolo-corrente').textContent =
        cur.dataset.titolo || (cur.querySelector('h1,h2') || {}).textContent || '';
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

  document.addEventListener('DOMContentLoaded', () => Deck.init());

})();
