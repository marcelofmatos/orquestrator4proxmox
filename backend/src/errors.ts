export class AppError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class NotFoundError extends AppError { constructor(m = 'não encontrado', d?: string) { super(m, 404, d); } }
export class AuthError extends AppError { constructor(m = 'não autenticado', d?: string) { super(m, 401, d); } }
export class ForbiddenError extends AppError { constructor(m = 'proibido', d?: string) { super(m, 403, d); } }
export class ProxmoxError extends AppError { constructor(m: string, d?: string) { super(m, 502, d); } }
export class LdapDownError extends AppError { constructor(m = 'diretório indisponível', d?: string) { super(m, 503, d); } }
