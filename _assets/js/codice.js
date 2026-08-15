/* IL CODICE D'ESITO
   =================

   Un esercizio che si corregge da sé sa il punteggio, ma il sito è statico:
   non c'è nessun server a cui mandarlo. Il codice serve a questo — è il
   punteggio reso trasportabile a mano. Lo studente lo copia e lo incolla su
   Classroom insieme al compito; l'insegnante lo incolla nella pagina di
   decodifica e ne esce la tabella.

   FORMA

       C1U1L103B/MRS4J/7-9/T1/K4F2

       C1U1L103B  la scheda: classe 1, unità 1, esercizio L1-03b
       MRS4J      chi: tre iniziali più due caratteri dal nome intero
       7-9        sette punti su nove, in chiaro: si legge anche a occhio
       T1         primo tentativo
       K4F2       firma di controllo

   PERCHÉ LE INIZIALI NON BASTANO DA SOLE. Su Classroom l'identità la dà già
   la consegna: il codice non deve dire chi è, deve rendere visibile se uno
   incolla il codice di un compagno. Tre iniziali però collidono spesso —
   in una classe di venticinque, due «MRS» sono normali — e a parità di
   punteggio due studenti darebbero codici identici, cioè la copia
   diventerebbe invisibile proprio nel caso in cui è più comoda. I due
   caratteri ricavati dal nome intero distinguono «Mario Rossi» da «Marta
   Rossi».

   FIN DOVE ARRIVA LA FIRMA, E DOVE NO. La firma nasce dagli altri campi più
   una parola segreta. Cambiare il «7» in «9» a mano rompe la firma, e la
   pagina di decodifica lo dice. Ma la parola segreta sta qui dentro, in un
   file che chiunque può leggere aprendo gli strumenti del browser: uno
   studente capace e ostinato può fabbricare un codice valido.

   Questo sistema rende evidente la manomissione occasionale; non la
   impedisce. Impedirla richiederebbe un server, cioè un'altra
   infrastruttura e un costo ricorrente. È bene che sia scritto qui e non
   solo detto a voce, perché fra un anno la differenza fra le due cose non
   sarà più ovvia a nessuno.
*/
(function (radice) {
  'use strict';

  /* Alfabeto di Crockford: niente I, L, O, U. Le prime tre si confondono
     con 1 e 0 quando un codice viene ricopiato a mano invece che incollato,
     e la U si evita perché insieme alle altre forma parole sgradevoli per
     puro caso. */
  var ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var SEGRETO = 'tac-liceo-musicale-2026';

  /* FNV-1a a 32 bit. Non è una firma crittografica e non deve sembrarlo:
     è un mescolatore veloce, deterministico e identico in ogni browser.
     Serve a rendere improbabile l'indovinello, non impossibile la
     falsificazione. */
  function mescola(testo) {
    var h = 0x811c9dc5;
    for (var i = 0; i < testo.length; i++) {
      h ^= testo.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h >>> 0;
  }

  function inLettere(numero, quante) {
    var s = '';
    for (var i = 0; i < quante; i++) {
      s = ALFABETO[numero % 32] + s;
      numero = Math.floor(numero / 32);
    }
    return s;
  }

  /* Il nome si normalizza prima di mescolarlo: senza accenti, senza spazi
     doppi, tutto maiuscolo, e con le parole in ordine alfabetico. Così
     «Rossi Mario» e «Mario Rossi» danno lo stesso risultato — lo studente
     scrive il proprio nome come gli viene, e non deve ricordarsi in che
     ordine l'aveva scritto la volta prima. */
  function pulisciNome(nome) {
    return String(nome || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z ]/g, ' ')
      .split(/\s+/).filter(Boolean).sort().join(' ');
  }

  /* Le iniziali non si riempiono per arrivare a una lunghezza fissa. Quasi
     tutti i nomi ne hanno due, e imporne tre faceva diventare «Mario Rossi»
     un MRX: una lettera che non c'è, in un campo che serve proprio a
     riconoscere una persona a colpo d'occhio. La lunghezza variabile non
     dà fastidio perché le parti sono separate dalla barra, e i due
     caratteri del mescolamento stanno sempre in fondo. */
  function siglaPersona(nome) {
    var parole = pulisciNome(nome).split(' ').filter(Boolean);
    if (!parole.length) return null;
    var iniziali = parole.map(function (p) { return p[0]; }).join('').slice(0, 3);
    return iniziali + inLettere(mescola(parole.join(' ')), 2);
  }

  function corpo(scheda, persona, punti, massimo, tentativo) {
    return [scheda, persona, punti + '-' + massimo, 'T' + tentativo].join('/');
  }

  function genera(dati) {
    var persona = siglaPersona(dati.nome);
    if (!persona) return null;
    var scheda = String(dati.scheda || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var t = Math.max(1, parseInt(dati.tentativo, 10) || 1);
    var c = corpo(scheda, persona, dati.punti, dati.massimo, t);
    return c + '/' + inLettere(mescola(c + SEGRETO), 4);
  }

  /* La lettura non si fida di niente: un codice arriva da un ragazzo che
     l'ha incollato in un campo di testo, quindi può avere spazi in mezzo,
     virgolette intorno, la maiuscola sbagliata, o essere tagliato a metà.
     Tutto quello che non torna diventa un motivo scritto in chiaro, mai un
     errore silenzioso: un codice scartato senza dire perché farebbe
     sospettare uno studente che non ha fatto niente di male. */
  function leggi(testo) {
    var grezzo = String(testo || '').trim().replace(/\s+/g, '').toUpperCase();
    if (!grezzo) return { valido: false, perche: 'vuoto' };
    var p = grezzo.split('/');
    if (p.length !== 5) {
      return { valido: false, perche: 'non ha cinque parti', grezzo: grezzo };
    }
    var punteggio = p[2].split('-');
    if (punteggio.length !== 2 || isNaN(+punteggio[0]) || isNaN(+punteggio[1])) {
      return { valido: false, perche: 'il punteggio non si legge', grezzo: grezzo };
    }
    var atteso = inLettere(mescola(p.slice(0, 4).join('/') + SEGRETO), 4);
    return {
      valido: atteso === p[4],
      perche: atteso === p[4] ? null : 'firma non valida: forse ritoccato a mano',
      grezzo: grezzo,
      scheda: p[0],
      persona: p[1],
      iniziali: p[1].slice(0, -2),
      punti: +punteggio[0],
      massimo: +punteggio[1],
      tentativo: parseInt(p[3].replace(/^T/, ''), 10) || 1
    };
  }

  radice.TACCodice = {
    genera: genera,
    leggi: leggi,
    siglaPersona: siglaPersona,
    pulisciNome: pulisciNome
  };
})(typeof window !== 'undefined' ? window : globalThis);
