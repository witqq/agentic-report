const registryIdentityPattern = /^[a-z][a-z0-9-]{0,63}$/u;

export function isRegistryIdentity(value: string): boolean {
  return registryIdentityPattern.test(value);
}
