/**
 * Núcleo de inyección de dependencias — estilo NestJS.
 *
 * Un contenedor mínimo de singletons por token, inspirado en el DI container de NestJS.
 * Cada módulo registra sus providers (servicios) y controladores mediante `provide`.
 * Los controladores resuelven sus dependencias con `inject`.
 */
type Factory<T> = () => T;
const registry = new Map<string, Factory<unknown>>();
const instances = new Map<string, unknown>();

/** Registra un provider (factory) bajo un token. */
export function provide<T>(token: string, factory: Factory<T>): void {
  registry.set(token, factory);
}

/** Resuelve (y cachea como singleton) la instancia asociada al token. */
export function inject<T>(token: string): T {
  if (instances.has(token)) return instances.get(token) as T;
  const factory = registry.get(token);
  if (!factory) throw new Error(`[DI] No provider registrado para el token: "${token}"`);
  const instance = factory();
  instances.set(token, instance);
  return instance as T;
}

/** Limpia las instancias cacheadas (útil para tests / hot-reload). */
export function resetContainer(): void {
  instances.clear();
}

/** Marca una clase como inyectable (al estilo @Injectable de NestJS). */
export function Injectable(): ClassDecorator {
  return (target: Function) => {
    (target as any).__injectable = true;
  };
}
