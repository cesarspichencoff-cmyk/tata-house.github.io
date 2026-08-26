import { beforeEach, describe, expect, it } from 'vitest';
import {
  definirPendentesNuvem,
  definirStatusNuvem,
  lerStatusNuvem,
} from './status';

describe('status da nuvem', () => {
  beforeEach(() => {
    definirPendentesNuvem(0);
    definirStatusNuvem('conectando');
  });

  it('não permite online quando existe alteração pendente', () => {
    definirPendentesNuvem(2);
    definirStatusNuvem('online');
    expect(lerStatusNuvem().status).toBe('sincronizando');
    expect(lerStatusNuvem().pendentes).toBe(2);
  });

  it('uma nova pendência derruba um online anterior', () => {
    definirStatusNuvem('online');
    expect(lerStatusNuvem().status).toBe('online');
    definirPendentesNuvem(1);
    expect(lerStatusNuvem().status).toBe('sincronizando');
  });

  it('permite online novamente quando não há pendências', () => {
    definirPendentesNuvem(1);
    definirStatusNuvem('online');
    definirPendentesNuvem(0);
    definirStatusNuvem('online');
    expect(lerStatusNuvem().status).toBe('online');
  });
});
