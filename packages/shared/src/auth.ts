import { z } from 'zod';

export const RegisterInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: 'El formato del correo electrónico no es válido' })
    .max(255, { message: 'El correo no puede superar los 255 caracteres' }),
  displayName: z
    .string()
    .trim()
    .min(2, { message: 'El nombre visible debe tener al menos 2 caracteres' })
    .max(50, { message: 'El nombre visible no puede superar los 50 caracteres' }),
  password: z
    .string()
    .min(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
    .max(128, { message: 'La contraseña no puede superar los 128 caracteres' }),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: 'El formato del correo electrónico no es válido' })
    .max(255, { message: 'El correo no puede superar los 255 caracteres' }),
  password: z
    .string()
    .min(1, { message: 'La contraseña es obligatoria' })
    .max(128, { message: 'La contraseña no puede superar los 128 caracteres' }),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const UserPublicSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  createdAt: z.union([z.string(), z.date()]),
});

export type UserPublic = z.infer<typeof UserPublicSchema>;
