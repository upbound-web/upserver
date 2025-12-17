declare module 'find-free-port' {
  function findFreePort(startPort: number, endPort?: number, ip?: string, count?: number): Promise<number[]>;
  export = findFreePort;
}

