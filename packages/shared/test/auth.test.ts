import { describe, it, expect } from 'vitest';
import { RegisterInputSchema, LoginInputSchema } from '../src/auth.js';

describe('Shared Auth Schemas', () => {
  describe('RegisterInputSchema', () => {
    it('acepta datos de registro válidos', () => {
      const valid = {
        email: 'aventurero@burgoslabs.es',
        displayName: 'Drizzt DoUrden',
        password: 'PasswordSegura123!',
      };
      const res = RegisterInputSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('falla con correos inválidos', () => {
      const invalid = {
        email: 'no-es-un-correo',
        displayName: 'Gandalf',
        password: 'PasswordSegura123!',
      };
      const res = RegisterInputSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.path.includes('email'))).toBe(true);
      }
    });

    it('rechaza contraseñas con menos de 10 caracteres', () => {
      const invalid = {
        email: 'user@example.com',
        displayName: 'Legolas',
        password: '123456789', // 9 caracteres
      };
      const res = RegisterInputSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.path.includes('password'))).toBe(true);
      }
    });

    it('acepta contraseñas en los límites exactos (10 y 128 caracteres)', () => {
      const atMin = {
        email: 'user@example.com',
        displayName: 'Gimli',
        password: 'a'.repeat(10),
      };
      expect(RegisterInputSchema.safeParse(atMin).success).toBe(true);

      const atMax = {
        email: 'user@example.com',
        displayName: 'Gimli',
        password: 'a'.repeat(128),
      };
      expect(RegisterInputSchema.safeParse(atMax).success).toBe(true);

      const overMax = {
        email: 'user@example.com',
        displayName: 'Gimli',
        password: 'a'.repeat(129),
      };
      expect(RegisterInputSchema.safeParse(overMax).success).toBe(false);
    });

    it('falla si displayName tiene menos de 2 o más de 50 caracteres', () => {
      expect(
        RegisterInputSchema.safeParse({
          email: 'user@example.com',
          displayName: 'A',
          password: 'PasswordSegura123!',
        }).success,
      ).toBe(false);

      expect(
        RegisterInputSchema.safeParse({
          email: 'user@example.com',
          displayName: 'B'.repeat(51),
          password: 'PasswordSegura123!',
        }).success,
      ).toBe(false);
    });
  });

  describe('LoginInputSchema', () => {
    it('acepta credenciales de login válidas', () => {
      const res = LoginInputSchema.safeParse({
        email: 'dm@burgoslabs.es',
        password: 'CualquierPassword10!',
      });
      expect(res.success).toBe(true);
    });

    it('falla con password vacía', () => {
      const res = LoginInputSchema.safeParse({
        email: 'dm@burgoslabs.es',
        password: '',
      });
      expect(res.success).toBe(false);
    });
  });
});
