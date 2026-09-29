import { type ReisekostenState } from '@gruenerator/contracts';

/** A blank claim — the web wizard's start and the base the chat tool merges its partial input onto. */
export function emptyReisekostenState(): ReisekostenState {
  return {
    rateKey: 'de-DE/nrw',
    stammdaten: {
      name: '',
      strasse: '',
      hausnr: '',
      plz: '',
      ort: '',
      email: '',
      telefon: '',
      iban: '',
      bic: '',
    },
    reise: { anlass: '', ziel: '', reisebeginn: '', rueckkehr: '' },
    fahrt: { bahn: null, oepnv: null, kfz: null, miete: null, taxi: null, sonstiges: null },
    verpflegungAbzuege: [],
    uebernachtung: null,
    spende: 0,
  };
}
