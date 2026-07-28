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

      this.tick = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }
      }).toDestination();
      this.tick.volume.value = -19;

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

    async metronomo(forte, quando) {
      await this.avvia();
      if (!this.click) return;
      this.click.triggerAttackRelease('32n', quando, forte ? 1 : 0.4);
      this.tick.triggerAttackRelease(forte ? 'A6' : 'D6', '64n', quando, forte ? 0.9 : 0.3);
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
      const [parteNote, parteDur = 'q'] = gettone.split(':');
      const puntata = parteDur.includes('.');
      const dur = parteDur.replace(/\./g, '') || 'q';
      const pausa = /^r$/i.test(parteNote);
      const keys = pausa ? ['b/4'] : parteNote.split('+').map(s => s.trim().toLowerCase());
      let battiti = DURATE_BATTITI[dur] || 1;
      if (puntata) battiti *= 1.5;
      return { keys, dur, puntata, pausa, battiti };
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
          const travB = VF.Beam.generateBeams(
            noteB.filter((n, i) => !this._datiB[i].pausa && !this._datiB[i].stanghetta));
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
        const travature = [];
        let gruppo = [];
        dati.forEach((d, i) => {
          if (d.stanghetta) { travature.push(...VF.Beam.generateBeams(gruppo)); gruppo = []; return; }
          if (!d.pausa) gruppo.push(note[i]);
        });
        travature.push(...VF.Beam.generateBeams(gruppo));
        new VF.Formatter().joinVoices([voce]).format([voce], larghezza - 90);
        voce.draw(ctx, stave);
        travature.forEach(b => b.setContext(ctx).draw());

        this._note = note;
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
      const durBattito = (60 / (this._tempo * fattore));
      let t = Tone.now() + 0.15;

      this._dati.forEach((d, i) => {
        if (d.stanghetta) return;          /* non dura e non suona */
        const secondi = d.battiti * durBattito;
        if (!d.pausa) {
          Audio.synth.triggerAttackRelease(
            d.keys.map(k => N.aTone(k)), secondi * 0.92, t
          );
          const el = this._note && this._note[i] && this._note[i].getSVGElement();
          if (el) {
            const ms = (t - Tone.now()) * 1000;
            setTimeout(() => { el.style.fill = '#f59e0b'; el.style.stroke = '#f59e0b'; }, ms);
            setTimeout(() => { el.style.fill = ''; el.style.stroke = ''; }, ms + secondi * 1000);
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
      this._dom = dom;
      this._i = 0;
      this._punti = 0;
      this.textContent = '';

      this._box = document.createElement('div');
      this._box.className = 'tac-quiz-box';
      this.appendChild(this._box);
      this.appendChild(this.versioneStampa());
      this.mostra();
    }

    /* Elenco statico di tutte le domande, visibile solo in stampa */
    versioneStampa() {
      const d = document.createElement('div');
      d.className = 'tac-quiz-stampa';
      const ol = document.createElement('ol');
      ol.className = 'spaziato';
      this._dom.forEach(q => {
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
        this._dom.map((q, i) => (i + 1) + LETTERE[q.c].toLowerCase()).join(' · ');
      d.appendChild(sol);
      return d;
    }

    mostra() {
      const q = this._dom[this._i];
      this._box.innerHTML = '';

      const testa = document.createElement('div');
      testa.className = 'tac-quiz-testa';
      testa.innerHTML =
        '<span class="tac-quiz-conta">Domanda ' + (this._i + 1) + ' di ' + this._dom.length + '</span>' +
        '<span class="tac-quiz-conta">Punteggio ' + this._punti + '</span>';
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

      const opz = document.createElement('div');
      opz.className = 'tac-quiz-opz';
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

      const ri = document.createElement('button');
      ri.className = 'btn secondario';
      ri.style.marginTop = '1rem';
      ri.textContent = 'Ricomincia';
      ri.onclick = () => { this._i = 0; this._punti = 0; this.mostra(); };
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
    connectedCallback() {
      if (this._fatto) return;
      this._fatto = true;
      let cfg;
      try { cfg = JSON.parse(this.textContent.trim()); }
      catch (e) { this.innerHTML = '<p style="color:#ef4444">Trascina: JSON non valido.</p>'; return; }
      this.textContent = '';

      const pool = document.createElement('div');
      pool.className = 'tac-drag-pool';
      const mescolati = cfg.gettoni.slice().sort(() => Math.random() - 0.5);
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
      cfg.frasi.forEach(([testo, giusta]) => {
        const r = document.createElement('p');
        r.style.fontSize = '1.1rem';
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

      const bt = document.createElement('button');
      bt.className = 'btn no-stampa';
      bt.textContent = 'Controlla';
      bt.onclick = () => {
        lista.querySelectorAll('.tac-buca').forEach(b => {
          b.classList.remove('giusta', 'sbagliata');
          b.classList.add(b.textContent.trim() === b.dataset.giusta ? 'giusta' : 'sbagliata');
        });
      };
      this.appendChild(bt);
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
      this._corrente = this._scelte[Math.floor(Math.random() * this._scelte.length)];
      this._fb.className = 'tac-feedback';
      this._opz.innerHTML = '';
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
      const t = Tone.now() + 0.1;
      Audio.synth.triggerAttackRelease(b, '4n', t);
      Audio.synth.triggerAttackRelease(a, '4n', t + 0.65);
      Audio.synth.triggerAttackRelease([b, a], '2n', t + 1.5);
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

      /* Cellula ritmica: si ripete ogni battuta, note ai rispettivi movimenti */
      const durataBattuta = this._batt; // in movimenti
      let off = 0;
      this._dati.forEach(d => {
        if (!d.pausa) {
          const quando = off; // in movimenti dall'inizio della battuta
          this._eventi.push(
            Tone.Transport.scheduleRepeat(t => {
              Audio.synth.triggerAttackRelease('C5', '32n', t);
            }, durataBattuta + '*4n', quando + '*4n')
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
     9-bis. <tac-metro> — RICONOSCI IL METRO ALL'ASCOLTO

     <tac-metro scelte="2/4,3/4,6/8,9/8" tempo="92"></tac-metro>
     Genera una battuta ritmica nel metro scelto a caso e chiede
     allo studente di riconoscerlo. Autocorrettivo.
     ========================================================== */

  const METRI = {
    '2/4':  { puls: 2, sudd: 2, nome: 'binario semplice' },
    '3/4':  { puls: 3, sudd: 2, nome: 'ternario semplice' },
    '4/4':  { puls: 4, sudd: 2, nome: 'quaternario semplice' },
    '6/8':  { puls: 2, sudd: 3, nome: 'binario composto' },
    '9/8':  { puls: 3, sudd: 3, nome: 'ternario composto' },
    '12/8': { puls: 4, sudd: 3, nome: 'quaternario composto' }
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

      const barra = document.createElement('div');
      barra.className = 'tac-barra';
      barra.style.marginBottom = '1.1rem';
      const asc = document.createElement('button');
      asc.className = 'btn'; asc.innerHTML = '&#9654; Ascolta';
      asc.onclick = () => this.riproduci();
      const nuo = document.createElement('button');
      nuo.className = 'btn secondario'; nuo.textContent = 'Nuovo esempio';
      nuo.onclick = () => this.nuovo(true);
      barra.appendChild(asc); barra.appendChild(nuo);
      box.appendChild(barra);

      const opz = document.createElement('div');
      opz.className = 'tac-quiz-opz';
      box.appendChild(opz);
      this._opz = opz;

      const fb = document.createElement('div');
      fb.className = 'tac-feedback';
      box.appendChild(fb);
      this._fb = fb;

      this.nuovo(false);
    }

    nuovo(suona) {
      this._corrente = this._scelte[Math.floor(Math.random() * this._scelte.length)];
      this._fb.className = 'tac-feedback';
      this._opz.innerHTML = '';
      this._scelte.forEach((s, k) => {
        const b = document.createElement('button');
        b.className = 'tac-opz';
        const m = METRI[s];
        b.innerHTML = '<span class="lettera">' + LETTERE[k] + '</span><span><strong>' + s +
                      '</strong> &mdash; ' + (m ? m.nome : '') + '</span>';
        b.onclick = () => this.rispondi(s);
        this._opz.appendChild(b);
      });
      if (suona) this.riproduci();
    }

    /* Due battute: accento forte sul primo movimento, suddivisioni piu deboli */
    async riproduci() {
      await Audio.avvia();
      if (!Audio.pronto) return;
      const m = METRI[this._corrente];
      if (!m) return;
      const durPuls = 60 / this._tempo;
      const durSudd = durPuls / m.sudd;
      let t = Tone.now() + 0.15;
      for (let bat = 0; bat < 2; bat++) {
        for (let p = 0; p < m.puls; p++) {
          for (let s = 0; s < m.sudd; s++) {
            const forte = (p === 0 && s === 0);
            const capo  = (s === 0);
            Audio.synth.triggerAttackRelease(
              forte ? 'C5' : (capo ? 'G4' : 'C4'),
              durSudd * 0.8, t, forte ? 0.9 : (capo ? 0.6 : 0.35)
            );
            t += durSudd;
          }
        }
      }
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
      const m = METRI[this._corrente];
      this._fb.className = 'tac-feedback mostra ' + (ok ? 'ok' : 'no');
      this._fb.innerHTML = ok
        ? '<strong>Esatto.</strong> Era ' + this._corrente + ', metro ' + m.nome + '.'
        : '<strong>No.</strong> Era <strong>' + this._corrente + '</strong>, metro ' + m.nome +
          '. Riascolta contando gli accenti forti: ne senti uno ogni ' + m.puls +
          ' pulsazioni, e ciascuna si divide in ' + m.sudd + '.';
      this._box.querySelector('.punteggio').textContent = this._giuste + ' / ' + this._tot;
    }
  }
  customElements.define('tac-metro', TacMetro);

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
      if (this.getAttribute('inciso')) ctrl.hidden = true;
      box.appendChild(ctrl);
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
          if (this._metro && this._metro.dataset.on === '1') Audio.metronomo(k === 0, t);
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
      /* L'esecuzione dal vivo esce di scena dove c'è la registrazione. */
      this._play.hidden = true;
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
        au.play().catch(() => {});
      };
      au.onplay  = () => { b.innerHTML = '&#9632; Ferma'; this._box.classList.add('in-ascolto'); };
      au.onpause = () => { b.innerHTML = '&#9654; Ascolta'; };
      au.onended = () => {
        b.innerHTML = '&#9654; Ascolta';
        this._box.classList.remove('in-ascolto');
        this.illumina(-1); this.cursore(null);
      };
      au.ontimeupdate = () => {
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
        this.cursore(e[i][0], fin > ini ? (ms - ini) / (fin - ini) : 0);
      };
      this._scorri.oninput = () => {
        if (au.duration) au.currentTime = au.duration * this._scorri.value / 1000;
      };

      this._box.appendChild(riga);
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
      [...this._puls.children].forEach(p => p.classList.remove('on'));
      this._suona = false;
      if (this._play) this._play.innerHTML = '&#9654; Ascolta';
    }
  }
  customElements.define('tac-brano', TacBrano);

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
        const alto = dentro.scrollHeight;
        if (!attiva) s.classList.remove('misura');
        if (alto > spazio + 1) {
          const q = spazio / alto;
          minimo = Math.min(minimo, q);
          this.carichi.push({ n: k, titolo: s.dataset.titolo, scala: +q.toFixed(3) });
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
      const av = document.getElementById('tac-densita');
      if (av) {
        const c = this.carichi || [];
        av.classList.toggle('acceso', troppa);
        av.textContent = c.length
          ? (c.length === 1 ? 'slide ' : 'slide ') + c.map(x => x.n + 1).join(', ')
            + (c.length === 1 ? ' non ci sta: va sdoppiata'
                              : ' non ci stanno: vanno sdoppiate')
          : '';
        av.title = c.map(x => (x.n + 1) + '. ' + x.titolo +
                              '  (serve il ' + Math.round(100 / x.scala) + '% dello spazio)').join('\n');
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

  document.addEventListener('DOMContentLoaded', () => Deck.init());

})();
